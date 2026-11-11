# #445 Crawlee native worker package (NCP deployment pending)

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
