# #445 Crawlee native worker package (NCP deployment pending)

## Work in progress: native Cheerio acquisition

`createApprovedCheerioAcquisition()` is exported by `native-worker.mjs` and
can be passed as `acquisition` to `createOperatorApprovedSource`. Its actual
CheerioCrawler client uses only the API's one-use exact GET capability; current
rights, two DNS checks, IP pinning and TLS/SNI remain in the existing transport.
The API separately retains bounded original bytes/headers before the crawler
reads its copy. The driver cannot replace origin bytes or create another URL.
Sessions, cookies, proxy use, automatic retries, source logging and persistent
Crawlee storage are disabled. Conditional 304 remains an unchanged observation.

This remains a **partial #445 pipeline**. The native acquisition path now
requires the private source preflight and runtime version manifest; both are
rechecked immediately before pinned HTTP. Version drift is also checked before
every persistence operation. No actual source/NCP was accessed.

The private `runtimeVersion` port passed to `createOperatorApprovedSource`
contains `expected` (`gitSha`, `buildSha`, `migrationVersion`, `adapterVersion`,
`datasetRevision`, `schemaVersion`), a reader schema range, and `loadCurrent`.
The initial policy permits only exact pinned versions. Missing configuration,
drift or loader failure blocks native acquisition; it never initiates migration.

`PostgresSourceRefreshScheduler` and `createScheduledSourceQueue` (compiled API
modules) can wrap the existing SQL queue before passing it to
`createNativeApprovedQueueWorker`. A private `loadSchedules` supplies at most 16
records with `sourceId`, `permissionRef`, `actorRef`, `scheduleVersion`,
`anchorAt`, and explicit `intervalSeconds` (300 seconds–30 days). Configuration
is loaded once per one-shot worker, never from a browser or source HTML. A
stable interval key, per-source advisory lock, last settled job timestamp and
the existing global capacity lock prevent duplicate/catch-up work. Pending,
ambiguous or rights-blocked jobs are not automatically retried. Schedule
selection and rights-aware enqueue share one connection and transaction,
including for a single-slot pool; the independent rights resolver retains its
separate restricted pool. Only the existing systemd timer triggers execution.

`PostgresSourceRefreshBudget` supplies the mandatory native `budget` port.
Apply the separately reviewed `infra/sql/20261112_source_refresh_budget.sql`
before configuring it. Give the restricted worker only EXECUTE on
`reserve_source_refresh_budget(text,text,integer,bigint,integer,bigint,integer)`;
do not grant direct table access. Use a pool independent of the active queue
lease pool (composition rejects reuse). Private per-source policies include a
canonical HTTPS origin and explicit source/origin daily request and byte caps.
The SQL clock determines UTC days. Each HTTP attempt reserves the full 256 KiB
response bound against both scopes before transmission, including conditional
304s and failures; unknown outcomes are never refunded or retried. Limits are
conservative response allowances, not measured NCP traffic or billing credits.
Rights and version are rechecked after asynchronous budget admission.

Failure notification is a separate `hufs-one-ai-data-refresh-alert.service`
triggered only by the refresh service's `OnFailure`. It runs as `hufs-crawler`,
loads a root-owned `/etc/hufs-one/private/refresh-alert-factory.mjs`, and calls
its `deliverRefreshAlert({event,idempotencyKey,occurredAt,signal})` export. The
factory must use an operator-configured private destination and honour the
idempotency key and abort signal. The only event is `SOURCE_REFRESH_FAILED`;
no source URL, document, job details, private error or token is passed.
`{state:'DELIVERED'}` is required to report delivery. Unknown outcomes/timeouts
remain `UNCONFIRMED`; the notifier has no retry or collection fallback.

The handler requires systemd 251+ for the triggering unit's
`MONITOR_INVOCATION_ID` and `MONITOR_UNIT` environment variables (see
[systemd's execution environment contract](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml)).
The operator must install the refresh service, timer **and** alert service
together, configure the private notifier, run `systemctl daemon-reload`, and
test one approved synthetic failure before enabling a live schedule. These
host operations and actual alert delivery have not been executed locally.
`node tools/ingestion/refresh-alert-cli.mjs --plan` remains offline and inert.

Playwright/browser rendering is implemented below, default off. Actual schedules, manifests,
SQL privileges, site policies and NCP installation remain NOT_CONNECTED/NOT_RUN.

### Browser runtime foundation (#445)

`apps/api/src/modules/opportunities/source-browser-runtime.ts` verifies the
separate Chromium runtime without launching a browser or fetching a source.
The private manifest pins `wrapperSha256`, `bwrapSha256`, `rootfsSha256`,
`chromiumVersion`, and `policyVersion`. Runtime paths are fixed:
`/usr/local/libexec/hufs-one-source-browser`, `/usr/bin/bwrap`, and
`/opt/hufs-one-source-browser/rootfs`. Root and non-Linux workers are refused.

The wrapper is provided by `infra/ncp/launch-source-browser.sh` and must be
installed root-owned/executable at the fixed path. It runs Chromium inside
`bubblewrap --unshare-all` with a separate read-only rootfs, private proc/dev/tmp,
cleared environment and dropped capabilities; no host root or private data
directory is mounted. Chromium's own sandbox remains enabled. Alternate
switch spellings that disable isolation are rejected. Playwright's inherited
debugging pipes are carried into the child; no TCP debugging port is enabled.
[bubblewrap's source](https://github.com/containers/bubblewrap/blob/main/bubblewrap.c)
defines namespace and inherited-file-descriptor behaviour.

Verification streams rootfs files (512 MiB/file, 2 GiB total, 30,000 entries,
depth 32) and hashes ordered `D/path/mode`, `F/path/mode/size/SHA-256`, and
`L/path/target` records. Ownership, writable/setuid modes, hardlinks, unsupported
entries, unknown targets, escaping links and cycles fail closed. Links resolve
in filesystem order before subsequent `..` components. The fixed
`usr/lib/chromium/chromium` target must be an executable native ELF file.

The runtime tests simulate metadata/bytes and execute only shell argument
validation. They do not establish that an NCP rootfs, user namespaces or
Chromium is installed or runnable. The renderer below connects this boundary
to Crawlee/Playwright and serves only already-authorized captured bytes.

### Browser DOM proof and review storage

Apply `infra/sql/20261112_source_browser_evidence.sql` after the PDF evidence
and verified-source-rights migrations **before deploying the new source writer
or reviewer**, including when browser rendering is disabled. The existing
originals table gains private DOM bytes, a separate DOM metadata bundle and
its hash. No public DTO/view exposes those bytes. Originals and DOM proof are
inserted in one transaction; existing immutable-history triggers cover all
added columns. Browser-produced HTML must start as `NEEDS_REVIEW`.

`source-browser-evidence.ts` binds the original byte SHA/length, DOM SHA/length,
paragraph hash, root selector, exact renderer identity and resource references.
Its stable rendering hash excludes capture time/revision identity, allowing
unchanged captures to be recognized without mislabelling DOM as origin bytes.
Resources are bounded to 16 distinct canonical URLs/1 MiB, each linked to an
immutable source revision and exact `rightsReceiptId` with current
COLLECT/STORE/SEARCH authority. Native resource acquisition remains separately
rights/egress/budget gated; metadata alone grants no fetch permission.

The independent review port must acknowledge `browserEvidenceSha256` for the
exact retained bundle. SQL activation also checks that each resource still has
the same current head and latest non-revoked, unexpired rights receipt.
Correction or withdrawal of a resource immediately makes the derived parent
`NEEDS_REVIEW`; it cannot retain a previous browser approval. The prior
TEXT/image/PDF view columns and behaviour are preserved.

The native disposable PostgreSQL suite includes the complete synthetic
writer→review→effective-view flow and dependency changes. A local, explicitly
enabled PGlite proof can exercise the same slice on Windows:
`$env:HUFS_SOURCE_BROWSER_PGLITE='1'; npx vitest run tests/api/source-browser-local-pg-opt-in.test.ts` (PowerShell).
It requires an operator-installed development-only PGlite at
`local_only/sql-validation`; the test does not install packages or open a socket.
PostgreSQL-WASM is a single-connection proof, not native pool/concurrency or NCP
acceptance. The renderer's actual Linux runtime test remains opt-in/NOT_RUN.

### Private captured-resource rendering

The worker pins `playwright-core` 1.64.1 and exports async
`createApprovedPlaywrightExtractor({runtime, resources, rootSelector, enabled})`.
Pass the returned port as `browserExtractor` to `createOperatorApprovedSource`.
`enabled` defaults to false; merely importing/building the worker does not launch
or download Chromium. The operator supplies the verified runtime manifest and
`createPostgresSourceBrowserResources({pool, actorRef, registrations})` from the
compiled API. Each private registration binds exact source/permission/URL,
SCRIPT/STYLE/JSON/IMAGE kind and a permitted explicit MIME. The resource pool
needs private original-byte/rights access and must remain separate from public
retrieval and head-reader roles. This loader reads already-retained originals;
it does not discover, fetch or approve missing resources.

The durable executor requires current preflight, runtime-version and budget
ports for browser mode even without a native acquisition driver. It retains
the fetched original independently from DOM, rejects 304/conditional reuse,
and requires matching original, paragraphs and stable rendering hash for an
unchanged observation. Renderer/resource changes create a new review draft.
Disabling rendering does not inherit earlier browser approval. Explicitly grant
the private head reader SELECT on `source_browser_revision_metadata_vnext`;
the two-column view exposes only revision ID and rendering hash, never bytes.

The renderer verifies root-owned runtime artifacts before work and immediately
before launch, and checks the actual Chromium version. Its custom launcher
discards Crawlee's proxy and anti-detection flag mutations and passes only fixed
verified launch options to Chromium. One fresh incognito context blocks service
workers/downloads and starts with no stored credentials. Context-wide request
routes replay exact original/resource byte copies or abort; there is no fetch,
continue or fallback. Unknown URLs, repeated navigation, other frames, cookies,
authorization, inappropriate resource kinds, WebSockets, popups, downloads and
script errors invalidate the capture. CSP additionally blocks workers, frames,
forms, base URLs and unapproved active formats. Request replay is capped at
64 requests/2 MiB. UTF-8/EUC-KR HTML content types are explicit; retained DOM is
UTF-8 and capped at 256 KiB. A network-idle snapshot is draft evidence, not proof
that an arbitrary site's asynchronous content is complete.

Execution has a 20-second deadline and separately bounded one-second cleanup.
All cleanup paths are attempted, including a browser that finishes launching
after timeout. Current source and resource authorities are checked before
rendering, capture and persistence. The SQL review/dependency checks still gate
activation; successful JavaScript execution grants no approval.

`approved-browser-routes.node.test.mjs` exercises byte replay and denial cases.
After `npm run build:api`, run the SDK/process harness with
`node --experimental-test-module-mocks --test tools/ingestion/worker/approved-playwright-extractor.node.test.mjs`.
It mocks SDK/process boundaries and is not real-browser evidence. The real
`approved-playwright-linux.node.test.mjs` uses actual Crawlee/Chromium with
synthetic in-memory JS/JSON and refuses unregistered requests. It is skipped by
default. A nonroot Linux operator must independently install the fixed wrapper,
bwrap/rootfs and root-owned `/etc/hufs-one/source-browser-runtime.json`, then run
with `HUFS_SOURCE_BROWSER_LINUX=1`. No runtime image, source rights, account or
NCP installation is manufactured by that test. Real Linux execution is NOT_RUN
in this Windows development session.

Focused verification uses `tests/api/source-acquisition.test.ts`, the actual
pinned SDK in `approved-cheerio-acquisition.node.test.mjs`, and the compiled
executor in `durable-acquisition.integration.mjs`. The integration test has
synthetic HTTPS/SQL ports and makes no real source request. CI builds the API
from a sparse code/synthetic-only checkout before running it.

## Durable HWP/HWPX ingestion port

The NCP-private operator factory can pass
`documentExtractor: createApprovedKoreanDocumentExtractor()` (exported by
`native-worker.mjs`) to `createOperatorApprovedSource` or directly to
`createApprovedDurableSourceExecutor`. Keep its existing
current rights resolver, exact canonical URL/pinned egress, reader and immutable
writer pools. Do not pass the legacy paragraph-only wrappers as the binary
`extractor` fallback. No new provider, OCR, network request or root process is
created by this adapter.

Apply the separately approved `infra/sql/20261111_source_korean_document_media.sql`
before enabling document collection. Deploy compatible readers together: older
readers reject the added `HWP`/`HWPX` media kinds. The migration preserves originals,
privileges, RLS and independent review; do not narrow its constraint on rollback
while HWP/HWPX rows remain. Operational NCP application is **NOT_RUN**.

The executor advertises only explicit HWP/HWPX MIME types when this optional
adapter is present, checks the parser's source/revision IDs, format, original SHA,
review-only state and unique bounded paragraphs, and rechecks COLLECT/STORE rights.
It stores exact original bytes plus candidate paragraphs, keeps the true media
kind, and cannot insert a self-approved revision. These local parsers do not
require EXTERNAL_TRANSFER rights because no external processor is called.

The existing **256 KiB fetch** and **500,000-byte writer** bounds remain. Generic
`application/octet-stream`, encrypted/unsupported containers and unconfigured
adapters are rejected. Text-only extraction omits or rejects unsupported layout,
images and controls; independent reviewers must compare the retained original
before approving individual source claims. This is not complete HWP fidelity or
real-school-data acceptance. All tests use synthetic inputs.

This is a separate Node package under `tools/ingestion/worker`, **not** a
second crawler engine or a new root dependency. Install with
`npm ci --omit=dev --ignore-scripts --no-audit --no-fund` from this directory
after verifying the committed `package-lock.json` against the approved commit.

Only the NCP-private root-owned operator factory imports
`createNativeApprovedQueueWorker({queue,maxJobs})`; the `queue` is an already
configured `PostgresSourceIngestionQueue` with private rights/approved egress.
The worker exits closed if it is root, on non-Linux, without a private
`CRAWLEE_STORAGE_DIR=/var/lib/hufs-one-crawler/crawlee`, or without an operator
SQL queue. It never discovers/unlocks real URLs. The one-shot CLI calls
`runOnce` and `close`, and the generated RequestQueue is always removed
through the close hook.

`collectCandidatesFromApprovedBytes` delegates HTML/RSS/Atom/sitemap DOM
parsing to the actual `cheerio` dependency, but accepts **only already
fetched, authorized** content; returns REVIEW_REQUIRED link proposals,
not new jobs or approved publications. This code deliberately cannot
create a production rights registry, migration approval, backup or live NCP
credential.

Run `npm ci --ignore-scripts --no-audit --no-fund` from this folder and execute `node synthetic-smoke.mjs`. CI always uses this committed dependency lockfile, not temporary `npm install`. NCP server installation,
private operator factory, credentials, rights and live source approval remain
NOT_CONNECTED/NOT_RUN.

## Offline approved HTML5 notice detail

`notice-html-extractor.mjs` consumes *already authorized/fetched* UTF-8 HTML
only (max 256KiB) and uses pinned Cheerio to parse h1-h3, paragraphs,
lists and table rows into immutable, ordered paragraph IDs. It strips
script/form/iframe content, rejects DTD/entity declarations, invalid UTF-8,
ambiguous section selectors, more than 200 paragraphs and 20k-char lines.
A NCP-private operator must choose a reviewed root selector (simple body/main/
article/id/class only), verify current source/permission and preserve the
original-bytes SHA before calling this plugin as a SourceContentExtractor.
The result remains `NEEDS_REVIEW`; it cannot declare official deadlines,
student eligibility or publication rights without the independent source review.

The synthetic real-Cheerio regression runs in the pinned worker CI and covers
Korean public notice dates/table cells/active content rejection. No live site,
attachment, CAPTCHA/login or network request is exercised. HWP/HWPX use
the separate review-only document adapters documented here; this HTML parser
does not infer binary formats as TEXT from file names or extensions. PDF
processing still requires its separately approved renderer/OCR port.

## Public board layout adapters (offline only, #445)

`site-adapters.mjs` provides two deliberately **synthetic layout families**,
`TABLE_BOARD_V1` and `CARD_BOARD_V1`, for institutional notice listing pages.
An NCP-private policy supplies the exact verified canonical HTTPS listing URL,
approved origin, allowed path prefixes/query keys, section root and bounded
Cheerio selectors. Only already-authorized HTML bytes are parsed; no HTTP
requests, browser navigation, credentials, site registry or automatic
pagination/attachment download.

The result contains bounded `REVIEW_REQUIRED` detail URLs, attachment
candidates (HWP/HWPX/PDF/Office) and page-link proposals. No item is
automatically registered, fetched, published or marked ACTIVE. Source/date
display strings are **candidates**, never independently verified facts.
Unknown HUFS site selectors, robots/terms, permission receipts and anti-bot/
authentication restrictions must be independently reviewed before use.
`node --test tools/ingestion/worker/site-adapters.node.test.mjs` exercises
Cheerio with synthetic table/card HTML, same-origin redirects, paging and
malicious inputs. A real NCP site adapter is NOT_CONNECTED.

`reconcileReviewedBoardPages` additionally joins at most 40 independently
captured listing page drafts while retaining each page's byte SHA and unique
listing URL. Duplicate documents with changed titles or attachment lists,
foreign pagination targets and duplicate page captures fail closed. The returned
`unfetchedPageCandidates` are **review proposals**, not crawler jobs; rights,
site-specific robots/terms, NCP original bytes and SourceRevision alignment
must still be rechecked separately.

## Binary Korean documents — offline prototype (#445)

`korean-documents.mjs` implements a bounded HWPX ZIP central-directory reader:
CRC-32, entry/path de-duplication, encryption/ZIP64 rejection, deflate size and
total limits, XML DTD/ENTITY denial, manifest/spine order, and **hp:p → hp:t**
paragraph text with stable IDs. It accepts **already permission-verified
bytes**; the HWPX adapter returns `NEEDS_REVIEW` source candidate paragraphs.
It skips drawings, footnotes, revision controls and layout interpretation;
original SHA-256 is bound to the archive bytes. Never claim approved eligibility
or published official rules from extracted text.

Legacy HWP 5 is a **different OLE2/CFB format**. The HWP5 section-record
decoder in the same module accepts FileHeader and BodyText/SectionN streams
provided by an independently reviewed CFB reader. It supports uncompressed
and raw-deflated records, rejects encryption/distribution-only flags and
unrecognized embedded control text. **Raw .hwp container parsing is now implemented as a bounded offline
CFB/OLE2 reader** in `hwp-cfb.mjs` including FAT, MiniFAT, explicit directory
parenting, sector-chain cycle/alias detection and generic errors. The bytes
flow through `parseApprovedLegacyHwpDraft` for the existing HWP5 text-record
decoder. This is **text-only draft parsing**, not a claim of full real-world
HWP compatibility. Rich binary controls/tables, encrypted/distribution-only
formats, actual user documents and independent human Gold remain unsupported.
The raw CFB parser has synthetic sector corruption and mini-stream tests only.

Tests construct only fictional in-memory HWPX ZIP and HWP record fixtures.
No personal data, actual NCP source inventory, real web fetching, file writes,
or third-party document converter is used.
