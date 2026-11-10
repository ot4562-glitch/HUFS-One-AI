# #445 — Crawlee BasicCrawler + approved durable executor (pre-NCP)

This adapter does **not** replace Crawlee, implement HTTP fetching, start a browser,
or bypass a source's robots.txt/terms. It connects the official Crawlee
[BasicCrawler](https://crawlee.dev/js/api/basic-crawler/class/BasicCrawler) task
runner to HUFS One AI's **existing**
`PostgresSourceIngestionQueue` / `createApprovedDurableSourceExecutor`.

## NCP-only operator assembly (still required)

1. NCP-private registry reviews *exact* canonical HTTPS URLs and current
   purpose-scoped rights; only trusted operator jobs are accepted.
2. Install a reproducibly pinned and audited **Crawlee 3.18.x stable** package
   in the future NCP worker build (do **not** use the unstable v4 beta).
   The repository intentionally does not add an unverified npm lockfile here.
3. NCP operator factory imports `BasicCrawler` from `crawlee`, creates a
   **private requestQueue** with NCP-only storage, and supplies `authority`
   and `executor` ports already bound to reviewed PostgreSQL data and pinned
   egress. Import `dispatchApprovedCrawleeSources` from this repo.
4. Invoke one bounded batch of at most 16 **operator-supplied sources**. The
   adapter revalidates authority before enqueue, immediately before execution,
   and after the existing executor commits DRAFT/unchanged. **No direct network
   call is performed by BasicCrawler**: transport lives exclusively in the
   approved durable executor.
5. Crawlee retries are set to zero so the PostgreSQL job ledger owns
   idempotency, recovery, and ambiguous outcome decisions. Any failed/skipped
   request blocks the whole success report. No DRAFT is silently activated.

## What is not complete

- Crawlee package + pinned dependency lockfile, NCP-private queue and factory,
  installing the service, operator job scheduling from Postgres, domain-level
  robots/source rights, HTML/attachments/PDF/HWPX parsers, real data collection,
  review promotion, NCP storage, replay/recovery, source-specific TTL/quotas.
- A real source identifier or URL must not be placed in GitHub or a public CI.
- This **offline, fake-Crawlee** adapter test validates interface expectations,
  **not** integration against the genuine Crawlee npm package.

Offline command: `node --test tools/ingestion/crawlee-approved-dispatch.node.test.mjs`.
Refs #445, #449, #447.
