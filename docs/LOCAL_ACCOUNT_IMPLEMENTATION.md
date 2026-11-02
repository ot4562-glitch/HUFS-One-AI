# Local account implementation plan — #132 / #133

Spec: owner goal attachment dated 2026-11-02 and GitHub #132/#133. Local branch only; no push, PR, merge, paid calls, deployment or private data in tracked artifacts. Existing S01–S05 and the original dirty checkout remain intact.

Architecture: add an explicitly SYNTHETIC local account workbench, backed by Fastify HTTP and strict Zod contracts, alongside the existing demo shell. A separate empty account and four synthetic owner fixtures exercise isolation; verified real owners are admitted only through a restricted, explicit identity/import registry. Reuse recommendation, notice and club pure cores. Missing transcripts, approved RulePacks and verified offerings remain UNKNOWN/NEEDS_REVIEW. Confirmed 4/4 consent for selected CLOVA processing, refined private NCP storage and reviewed pseudonymous presentation stays confirmed; identity matching, source reuse permission and historical Git publication are independent gates.

## Tasks and file boundaries

- [ ] Account API/contracts: `packages/contracts/src/local-accounts/`, `apps/api/src/modules/local-accounts/`, `apps/api/src/dev/local-account-main.ts`, focused API/contracts tests. Strict nullable inputs; revision CAS; server-authorized actor; CSRF; reset only empty demo; workspace cleanup; server recomputation using existing pure cores. Provide a loopback, explicit synthetic harness, disabled in production. Send final wire interface to UI implementer before UI integration.
- [ ] Account UI: `apps/web/src/features/local-accounts/`, minimal shell/main integration, scoped CSS and UI tests. Entry next to selector; account switch and adjacent settings; save/cancel/reset confirmation; all derived views and reasons; errors/abort/epoch/revision checks; cross-tab invalidation; 360px/keyboard labels. HTTP client consumes API contract, no fixture-derived personalization fallback.
- [ ] Private intake and public curriculum: new focused modules/scripts/tests under owning API/core/tools paths. Explicit identity attestation, hashes/versions and revocation; safe restricted registry; source-permission checked collection/normalization; course identity, credits, major, category, campus, cohort, term, URL, verified time, edition and collection status. Never infer identity from filenames/order/nicknames. Synthetic tests only; real source processing writes ignored local paths and logs aggregate counts.
- [ ] Integration/verification: real HTTP and browser when available, focused tests then one integrated typecheck/API+web build/regression pass; preserve pre-existing `tsconfig.json`/`vitest.config.ts` edits. Review changed paths and checkpoint explicit files locally.
- [ ] Deliver one concise `docs/DEMO_MANUAL.md` and update the existing ignored owner acceptance ledger, with exact tested/skipped/blocked evidence.

## Review focus

Null credits versus zero; inconsistent double-major states; stale writes/reset replay; cross-account late reads; reset versus concurrent writes and multi-tab invalidation; revoked sessions and direct URL access; no confirmed offering/graduation inference; no identity mapping or personal records in Git/logs/browser assets. Tests exercise these at their owning boundary.

Ruling: follow the user's explicit implementation directive and minimal-document preference; the supplied objective is the execution specification. No additional design approval round or interim PR.

## Stopped checkpoint — explicit owner instruction

Implementation is preserved at the owner's request to finish the current scope and stop. Account API/contracts, UI and restricted intake/collector are implemented locally. Actual official curriculum collection is assigned to `taewangim-alt` in #133. Four restricted owner profiles resolve; one malformed transcript remains NEEDS_REVIEW. API/web builds passed. The final UI-focused run passed 39 tests. Real Edge exposed a fetch receiver bug; the fix and unit regressions passed, but browser rerun, full integrated regression, live PostgreSQL/auth/NCP and release/privacy gates were not completed. No claim that #132/#133 or release is 100% complete.
