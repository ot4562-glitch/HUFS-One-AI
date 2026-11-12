# #447 — V2 owner catalog durable quota (pre-NCP)

> **2026-11-12 현행 문서 동기화:** [PR 36개·Issue 31개 감사 및 33/30 OPEN 스냅샷](REVIEW_AND_ISSUE_AUDIT_20261112.md). 이전 완료/PR 수치·운영 상태는 과거 시점 기록입니다. NCP 실운영·기관 권리/실원문·독립 Gold는 별도 인수이며 `NOT_CONNECTED / NOT_RUN / RELEASE_BLOCKED`를 유지합니다.

`PostgresOwnerV2CatalogQuota` provides the **existing**
`TrustedOwnerV2SearchQuota` interface for the private owner V2 search route.
It is replica-shared via a PostgreSQL security-definer function with a
purpose-separated, 32-byte minimum HMAC key. Only digests, minute buckets
and counts are stored, never actor IDs, student details or search text.

**Fail-closed deployment:** the migration creates an **empty** quota policy
table. Until the owner approves a per-minute limit between 1 and 120 and an
independent operator enters it, every call is DENIED. The SQL file does not
automatically grant EXECUTE, create roles, or enable catalog data sources.
Only a reviewed operator role can call the function. DB time, rather than an
untrusted browser clock, is authoritative, and one UPSERT arbitrates concurrent
requests across replicas. Retention cleanup, separate SQL roles, backup and
release-time quotas require approved NCP operations.

After migration review, provide the port as
`ownerV2Catalog:{source,signer,quota:new PostgresOwnerV2CatalogQuota(pool,key)}`
in the existing operator application configuration. The `source` must still
recheck **current consent, actor/source rights and publication HEAD** and
the `signer` must be a secret server-held cursor signer. This quota does
**not** turn on a real catalog or grant rights.

**Verification:** `tests/api/owner-v2-catalog-quota-postgres.test.ts`
uses synthetic SQL fake and tests invalid input, fail-closed responses,
digest separation and no DB connection during construction. NCP SQL apply,
operator grants/policy, real load, backup/restore and rates are **NOT_RUN**.
