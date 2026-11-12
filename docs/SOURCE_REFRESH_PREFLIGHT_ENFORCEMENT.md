# #445 — Native Crawlee preflight admission (pre-NCP)

This opt-in code is stacked on the native Cheerio acquisition PR #477 and
the integration-review branch #476. It **does not authorize** collection,
create an NCP source registry, reserve provider budget, install Playwright,
change live robots/terms policies, or connect to any real network/database.

## Policy / execution ordering

The independent NCP-private factory supplies:
- the exact source/permission/canonical URL and currently reviewed immutable
  source policy, retained in NCP only;
- four restricted PostgreSQL pools and the current, revocation-aware rights
  authority;
- `acquisition: createApprovedCheerioAcquisition()`;
- **`preflight: {loadCurrent(...)}`** returning the NCP-private current
  `NcpIngestionDraft.SourceRefreshPreflightDraftSchema` record, including
  source registration, reviewed robots/terms, URL path scope, observed timestamp,
  current TTL/retry-after/attempt and remaining request/byte budgets.

The executor requires that preflight provider whenever an optional native
acquisition is configured and checks:
1. Before querying the current source HEAD: sourceId, permissionRef, exact
   canonical URL, reviewed same-origin/path scope, current timestamp, rights,
   robots, terms, retry-after and remaining budgets.
2. **Again after address resolution immediately before the pinned GET**:
   the same independently loaded current preflight record (not the prior
   admission result). The existing fresh COLLECT/STORE rights, A/AAAA
   double-check, pinned IP, SNI, TLS, no-cookie/no-redirect and one-use fetch
   checks remain mandatory. Refused preflight does not perform network IO.
3. Original bytes are retained and stored only as review-needed evidence by
   the original durable executor; approval and active serving remain separate.

The pure preflight evaluator's `READY_FOR_OPERATOR_RECHECK` means "not
obviously blocked", **not a durable reservation or authoritative permission**.
A single read of `remainingRequests` is not enough to prevent concurrent
operators from exceeding a daily or per-domain budget. A separately reviewed
NCP-private **atomic PostgreSQL reservation/settlement ledger**, TTL
coordination and budget reconciliation are still required before enabling
concurrent scheduling or claiming production completion.

## Tests / runtime gates

`tests/api/source-refresh-operator-preflight.test.ts` covers negative
source ID, permission, exact URL, robots/terms, path scope, 401/403,
Retry-After, exhausted byte/request budget, attempts and timestamp.
The native compiled-source integration uses synthetic preflight records and
real pinned Crawlee SDK **without external requests**.

Production source URLs, review identifiers, origin snapshots, credentials,
raw responses, genuine student records and NCP costs must not appear in GitHub,
CI logs or browser code. No real site, rights, load test, budget ledger or
backup/recovery has been exercised: `NOT_CONNECTED / NOT_RUN /
RELEASE_BLOCKED`. #476 → #477 → this PR need independent latest-HEAD
human review; do not merge automatically.
