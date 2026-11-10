# #445 — Crawlee + PostgreSQL durable job queue (pre-NCP)

**Corrected architecture:** Crawlee's `BasicCrawler` only schedules bounded, synthetic
**virtual ticks**. It does not call `createApprovedDurableSourceExecutor` directly.
For each tick it invokes the existing `PostgresSourceIngestionQueue.runOne()`,
which owns global PostgreSQL advisory locks, 30-second leases, permission
rechecks, DRAFT/unchanged outcomes, quarantine on ambiguous failures and durable
idempotence. The old source/URL-dispatch path was removed because it bypassed
`source_ingest_jobs` and could repeat external work.

NCP's private operator factory must:
1. Install a tested, locked stable version of [Crawlee](https://github.com/apify/crawlee)
   (candidate 3.18.2; v4 beta/RC not yet adopted), without copying actual source
   registry or credentials into the public repo or CI.
2. Build the existing `createOperatorApprovedSource` from NCP-private
   rights-scoped source policies, independent read/write SQL pools, reviewed
   `ApprovedPinnedEgress` and `SourceContentExtractor`.
3. Create `PostgresSourceIngestionQueue` using the restricted queue pool,
   returned operator `authority` and `executor` from that composition.
4. Open a **fresh empty NCP-private Crawlee RequestQueue for each run**.
   Set `CRAWLEE_STORAGE_DIR=/var/lib/hufs-one-crawler/crawlee`.
5. Return `createApprovedCrawleeRefreshWorker({BasicCrawler,requestQueue,
   queue,maxJobs,closeQueue})` from `createRefreshWorker` for
   `tools/ingestion/refresh-cli.mjs`.
6. Use the existing operator-only HTTP/queue controls for job enqueue,
   **not** URL discovery by Crawlee. Jobs are matched and rights checked by
   the durable queue. `IDLE` can mean another worker owns its global lock, not
   that the backlog is empty; timer runs remain bounded.

The adapter never issues HTTP requests, accesses real source URLs, renders pages,
automatically requeues a job, or marks a DRAFT as ACTIVE. The service exits
nonzero on blocked/ambiguous/skipped work and does not leak original text/IDs
in stdout. A private factory, real pinned Crawlee dependency, operator source
registry, rights/robots validation and NCP SQL credentials are still missing.

**Verification:** `node --test tools/ingestion/refresh-cli.node.test.mjs
tools/ingestion/crawlee-approved-dispatch.node.test.mjs` runs with fake Crawlee
and fake queue. This is an **offline interface test, not a real Crawlee npm
integration or an NCP deployment**. No network or actual data is used.

Refs #445, #447, #449.

## Real package smoke (without NCP)

The separate GitHub Actions workflow `.github/workflows/crawlee-real-smoke.yml`
installs an exact `crawlee@3.18.2` into a disposable runner directory
(no repository lockfile or browser download) and executes a BasicCrawler and
RequestQueue against a synthetic `runOne()` stub. This checks actual library
API compatibility **only**. Production installation still requires a reviewed
lockfile, operator-provided NCP storage and a current rights registry.
