# #447 — Owner V2 approved catalog source (NCP-independent implementation)

The existing GET `/api/owner/features/v2/catalog` accepted a trusted source
port but had no PostgreSQL implementation. The opt-in
`PostgresOwnerV2CatalogSource` is now a SELECT-only adapter built on the
existing `PostgresApprovedOwnerReader`. It reads a **new independently
reviewed** `V2_CATALOG` projection kind and checks the actor, consent,
currently authorized SEARCH source/permission pairs, immutable original and
review hashes, current active source HEAD/revocation, receipt time, and
corresponding projection payload under one repeatable-read snapshot.

Each V2 item must contain the **actual independently curated**
`FeatureAdditions.OpportunityCatalogItem` including source revision ID,
verified evidence span IDs and permission state. No item, semester, deadline,
eligibility, approval or evidence is inferred from demo/legacy records. A
provided `sourceUrl` is compared **exactly** with the current private
`source_rights_receipts.canonical_url` for the source/permission pair.
Cross-site and same-domain-but-different-page citations are rejected.

### Private operator assembly (after approvals only)

1. Review and optionally apply `infra/sql/20261111_owner_v2_projection_kind.sql`
   **after** the original owner projection migration. The new kind adds no
   grants, default roles, inserts, activation or new source records.
2. Independently provision a *read-only* role and the existing trusted
   `OwnerCatalogAuthority`, source-rights and reviewed V2 projection writers.
   Insert only operator-verified V2 payloads with exact approved source
   receipts and authentic evidence spans. The API never populates these rows.
3. Construct `PostgresApprovedOwnerReader(pool,authority,clock)`, pass it to
   `new PostgresOwnerV2CatalogSource(reader,clock)`, then supply that source,
   the separately keyed `CatalogCursorSigner`, and
   `PostgresOwnerV2CatalogQuota` in `ownerV2Catalog` operator config.
   Partial three-port activation is forbidden by the existing API.
4. The new source revalidates actor consent, rights, source HEAD, canonical
   URL and the exact snapshot fingerprint on each response. 30-second
   in-process receipts are **only lookup references**, never permission
   grants; unknown/expired tickets deny. Real deployments require session
   affinity or a separately reviewed distributed receipt design.
5. The inherited **unpaged** reader still stops at 500 approved rows
   per actor and the current HTTP route has a 2,000-row input ceiling.
   As a separately callable, non-HTTP operator primitive,
   `PostgresApprovedOwnerReader.readV2KeysetPage` now pages 1–50
   `V2_CATALOG` rows at a time by actor/kind/entity_id (C collation)
   using a partial index. A **lookahead row also goes through all** current
   consent, projection hash, exact source revision, rights and independent
   attestation checks before `hasMore` is exposed. The 1,250-row disposable
   PostgreSQL regression covers 25 pages, duplicate-free order, RLS index
   metadata and revocation.
6. These individual page fingerprints are **not** stable whole-catalog
   versions and are intentionally NOT accepted as cross-page public cursors.
   A trusted whole-catalog revision/evidence epoch bound to full actor grants,
   source rights and HEAD changes, plus database-side filters matching the
   pure search semantics (including Korean normalization), are still needed
   before changing the actual HTTP `TrustedOwnerV2CatalogSource` activation.
   Never return unverified total counts or call all actor rows 'approved'
   merely because page 1 was valid.

Synthetic test: `tests/api/owner-v2-catalog-source-postgres.test.ts`.
No production PostgreSQL/NCP/real student data migration, independent Gold or
human rights approval was run. `NOT_CONNECTED / NOT_RUN / RELEASE_BLOCKED`
remains the correct status until an operator explicitly supplies the private
data, current rights, and reviewed deployment.
