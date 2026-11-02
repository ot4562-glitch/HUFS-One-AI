# Local account implementation plan — #132 / #133

Spec: owner goal attachment dated 2026-11-02 and GitHub #132/#133. Integration proposal: `feat/owner-integrated-20261102` (review-required PR; no release or deployment). Existing S01–S05, the original dirty checkout and protected private sources remain intact.

Architecture: add an explicitly SYNTHETIC local account workbench, backed by Fastify HTTP and strict Zod contracts, alongside the existing demo shell. A separate empty account and four synthetic owner fixtures exercise isolation; verified real owners are admitted only through a restricted, explicit identity/import registry. Reuse recommendation, notice and club pure cores. Missing transcripts, approved RulePacks and verified offerings remain UNKNOWN/NEEDS_REVIEW. Confirmed 4/4 consent for selected CLOVA processing, refined private NCP storage and reviewed pseudonymous presentation stays confirmed; identity matching, source reuse permission and historical Git publication are independent gates.

## Tasks and file boundaries

- [x] Synthetic account API/contracts implemented and tested:  `packages/contracts/src/local-accounts/`, `apps/api/src/modules/local-accounts/`, `apps/api/src/dev/local-account-main.ts`, focused API/contracts tests. Strict nullable inputs; revision CAS; server-authorized actor; CSRF; reset only empty demo; workspace cleanup; server recomputation using existing pure cores. Provide a loopback, explicit synthetic harness, disabled in production. Send final wire interface to UI implementer before UI integration.
- [x] Synthetic local account UI implemented and browser-tested:  `apps/web/src/features/local-accounts/`, minimal shell/main integration, scoped CSS and UI tests. Entry next to selector; account switch and adjacent settings; save/cancel/reset confirmation; all derived views and reasons; errors/abort/epoch/revision checks; cross-tab invalidation; 360px/keyboard labels. HTTP client consumes API contract, no fixture-derived personalization fallback.
- [x] Restricted intake and permission-gated public curriculum collector **implementation only** (actual collection BLOCKED):  new focused modules/scripts/tests under owning API/core/tools paths. Explicit identity attestation, hashes/versions and revocation; safe restricted registry; source-permission checked collection/normalization; course identity, credits, major, category, campus, cohort, term, URL, verified time, edition and collection status. Never infer identity from filenames/order/nicknames. Synthetic tests only; real source processing writes ignored local paths and logs aggregate counts.
- [x] Synthetic integration and browser verification (not real auth/PG/NCP):  real HTTP and browser when available, focused tests then one integrated typecheck/API+web build/regression pass; preserve pre-existing `tsconfig.json`/`vitest.config.ts` edits. Review changed paths and checkpoint explicit files locally.
- [x] Deliver one concise `docs/DEMO_MANUAL.md` and update the existing ignored owner acceptance ledger, with exact tested/skipped/blocked evidence.

## Review focus

Null credits versus zero; inconsistent double-major states; stale writes/reset replay; cross-account late reads; reset versus concurrent writes and multi-tab invalidation; revoked sessions and direct URL access; no confirmed offering/graduation inference; no identity mapping or personal records in Git/logs/browser assets. Tests exercise these at their owning boundary.

Ruling: follow the user's explicit implementation directive and minimal-document preference; the supplied objective is the execution specification. No additional design approval round or interim PR.

## Current integration checkpoint — 2026-11-02

### Owner goal continuation

- [ ] Reproduce PR #137's approval/board clock mismatch before and after the fixed demo date in `tests/api/synthetic-club-store.test.ts`.
- [ ] Keep synthetic moderation timestamps and board `asOf` on `DEMO_AS_OF` in the owner server adapter; keep real session checks and receipt expiry on the wall clock. Do not change the collaborator's club core or UI.
- [ ] Integrate current main without discarding existing local commits, then run focused API regression, typecheck/build and the installed-browser synthetic checks. Record actual results and remaining owner/external dependencies.
- [ ] Preserve a local reviewable checkpoint; do not push, create PRs or merge main under this goal's current local-only boundary.

Integrated current `main` (reviewer invite/graduation/sandbox and #117 core) with the isolated synthetic account workbench; resolved `App.tsx`/`main.tsx` conflicts. Repaired select accessible names and restored `packages/ui` typecheck/Vitest coverage. Typecheck, API/web builds, 429 focused Vitest tests and Chromium loopback E2E 9/9 PASS; the prior owner checkpoint also recorded API 796 PASS/32 optional live tests skipped. Actual official curriculum collection remains assigned to `taewangim-alt` in #133, pending reuse permission; one malformed original course ledger remains quarantined `NEEDS_REVIEW`. Four restricted real-owner profiles are distinct from four **invented** synthetic UI fixtures. `check:privacy` still blocks 2/173 checks due to six historically tracked protected files. Reviewer CI/approval and real Google/mail/NCP/PG are independent gates; neither #132 nor #133 nor release is 100% complete.
