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
unrecognized embedded control text. **This does NOT yet parse a raw .hwp
container end-to-end.** A bounded audited OLE/CFB stream reader (including
MiniFAT, sector-chain cycle checks and signature validation), more binary
controls/tables, and independent real-file Gold review are pending.

Tests construct only fictional in-memory HWPX ZIP and HWP record fixtures.
No personal data, actual NCP source inventory, real web fetching, file writes,
or third-party document converter is used.
