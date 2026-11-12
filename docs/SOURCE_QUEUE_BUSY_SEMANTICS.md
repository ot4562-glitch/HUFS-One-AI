# #445 Source ingestion queue: busy is not empty

**Pre-NCP code review only.** No real source inventory, HTTP activity,
operator credentials, or live refresh are created by this change.

`PostgresSourceIngestionQueue.runOne()` returns two distinct, wire-local
states for the durable one-shot worker:

- `IDLE` — under the transaction lock a SELECT EXISTS query proves that
  **no PENDING job** is visible, and no live lease blocks execution.
- `LOCK_BUSY` — the process-wide PostgreSQL session advisory lock, claim
  transaction guard, a live leased worker, or `FOR UPDATE SKIP LOCKED`
  prevents a reliable claim. An unexecuted refresh **must not** claim
  successful completion, even if a previous timer tick was successful.

Crawlee's `dispatchApprovedCrawleeQueue` accepts only a verified `IDLE`
as an empty batch and treats `LOCK_BUSY` as a failed one-shot operation.
It immediately stops additional durable SQL dispatches, never retries the
potentially active external action, and redacts source/SQL/actor details.
`runApprovedRefreshWorker` catches this failure, closes the private queue
and exits unsuccessfully. NCP operator monitoring must report this generic
failure without exposing private sources.

An expired lease is already moved into durable `NEEDS_REVIEW` quarantine by
the queue: operator review is mandatory, not automatic resume or replay.

Synthetic tests: `tests/api/source-ingestion-global-lease.test.ts` and
`tools/ingestion/crawlee-approved-dispatch.node.test.mjs`.
The pinned Crawlee 3.18.2 synthetic smoke runs in the dedicated
`.github/workflows/crawlee-real-smoke.yml` workflow.

Real NCP cron/systemd execution, provider requests, worker restart after host
power loss, source rights and operator-alert acceptance remain `NOT_RUN`
and release remains `RELEASE_BLOCKED`.
