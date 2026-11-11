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
attachment, CAPTCHA/login or network request is exercised. HWP/HWPX and
unlicensed PDFs remain separate unsupported formats until an approved native
parser exists. Do not infer these as TEXT from file names or extensions.
