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

This is a **partial acquisition implementation**, not the finished #445
pipeline. Playwright/browser fallback, execution of the draft source preflight,
source/domain TTL and budget accounting, alert delivery and runtime version
handshake enforcement remain unfinished. No actual source/NCP was accessed.
The development snapshot is submitted as a draft with these unfinished items
preserved for later review.

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
