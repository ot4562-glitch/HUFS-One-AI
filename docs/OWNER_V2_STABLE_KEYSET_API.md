# #447 — verified PostgreSQL keysets to signed owner V2 API (pre-NCP)

**Operator opt-in only.** This stacked PR depends on #465. Do not migrate,
activate, release or merge until both PRs have current independent human review
and the actual database's source/rights/role permissions are separately approved.

## Trust and execution boundary

The existing `GET /api/owner/features/v2/catalog` checks the authenticated
BETA actor, a short server `asOf` window, durable per-actor quota, current
session and server-only HMAC cursor. A private operator may inject
`PostgresOwnerV2StableKeysetSource` into that **existing trusted source port**.

Every request:

1. Obtain up to 50 `V2_CATALOG` projections per SQL keyset iteration from
   `PostgresApprovedOwnerReader.readV2KeysetPage` and reject any view beyond
   5,000 currently authorized rows. Include the 51st lookahead row in rights
   and integrity checks; it can influence `hasMore` only if approved.
2. In the same read-only transaction verify actor/consent, current scope,
   independent review, projection SHA256, exact source revision/HEAD, origin
   and review hashes, active SEARCH right, no rights/projection revocation,
   source purpose, and independently reviewed canonical URL. Require the
   current payload source URL to match its rights receipt **exactly**.
3. Bind actor, `asOf`, consentVersion, number of rows and **all keyset
   fingerprints** into one SHA256 whole-catalog epoch. The per-page SQL
   fingerprint is never misrepresented as a stable global version.
4. Pass the *whole verified bounded snapshot* to the existing pure TypeScript
   search engine, which defines `normalize('NFKC')`, Korean string ordering,
   timestamp tie breaks, filters and `totalInAuthorizedScope`. Do NOT replace
   `localeCompare('ko')` with PostgreSQL `COLLATE "C"` or arbitrary ILIKE.
   The keyset SQL only covers rows, it does not claim ordered search results.
5. Before responding, re-read every authorized keyset page and compare the
   **complete** epoch under freshly checked grants and rights. A mismatch,
   withdrawal, changed HEAD, changed user consent or invalid receipt fails
   closed. The existing signer separately binds actor, filters, asOf,
   consent and epoch to the opaque browser cursor. The cursor cannot pin
   historical rights; withdrawn material must not be returned.

## Limits and remaining work

This is a correctness baseline, **not high-scale server-side filtered SQL**.
The 5,000-row cap and up-to-two full verified scans **per HTTP request** are
intentional and may be costly; they cannot return a partial or misleading
count when exceeded. The normal unpaged reader's 500-row cap remains.
Every **single complete scan** now holds a read-only PostgreSQL
`REPEATABLE READ` exporter transaction and imports its opaque `pg_export_snapshot()`
identifier **before the first query of every keyset page transaction**.
Thus the HEAD and rights row visibility cannot drift between pages even when a
publisher commits concurrently; the exporter is rolled back and its connection
released after the scan, including failure paths. The response gate starts
an entirely **fresh** exported snapshot and compares all verified page hashes
and current rights again before returning a result. A snapshot never serves as
an authorization grant.

This still does **not** pin one MVCC snapshot **across HTTP requests** or
provide a durable global catalog publication/authorization epoch. A page
scan may fail closed if concurrent changes invalidate current grants. Long
scans remain costly; actual NCP runtime/replica/timeout acceptance is pending.

Next release gate: independent read-only PostgreSQL RLS/role verification,
source/rights/consent epoch schema and publisher transaction design, a stable
whole-catalog manifest, measured query plans and SQL-side exact filter/locale
equivalence for more than 5,000 rows, multi-process receipts, rate/timeout
testing and real licensed-source Gold review. **NCP NOT_CONNECTED, all real
school documents NOT_RUN, RELEASE_BLOCKED.**

Run synthetic unit/e2e: `npm run typecheck` and
`npx vitest run tests/api/owner-v2-catalog-keyset-http.test.ts`.
Real SQL approved reader keyset 1,250 rows/25 pages, index probe and revocation
remain under the isolated opt-in PostgreSQL CI in dependent PR #465.
The new synthetic and **real disposable PostgreSQL** tests additionally prove
that a concurrent V2 HEAD insertion after page 1 cannot become visible within
the same exported snapshot, while a freshly exported snapshot sees it.
No actual institution records or credentials are involved.
