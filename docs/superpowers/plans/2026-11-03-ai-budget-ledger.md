# Durable AI budget ledger implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; request one independent review before publishing.

**Goal:** Implement #20/#88 atomic global/actor cost reservation and idempotent dispatch/settlement without enabling external requests.

**Architecture:** Operator-owned phase caps and private job/counter tables, accessed only by constrained PostgreSQL SECURITY DEFINER functions. Phase row locks serialize reservations across workers. A typed server adapter binds the authenticated actor transaction-locally; no browser endpoint or provider transport is added.

**Tech Stack:** Existing PostgreSQL, TypeScript/Zod, ReviewerSqlPool, Vitest; no new dependencies.

**Spec:** Architecture A06.7; issues #20/#88; apps/api/AGENTS.md and infra/AGENTS.md.

## Global constraints

- Default phase enabled=false; caps/attempt limits zero until explicit operator provisioning. No auto migration, keys, cloud or paid/model calls.
- Use integer micro-KRW, no inferred provider price. A trusted future quote service must calculate each attempt's worst-case units from verified model/policy/token limits.
- RESERVED may be released before dispatch. DISPATCHED/UNKNOWN_BILLING cannot be released; verified settlement is required. Crashes/timeouts retain reservation.
- Phase/actor/idempotency/task plus request SHA identify a reservation. Changed inputs fail closed; replay never grants a second dispatch.
- Record actual verified over-reservation cost and disable the phase; never clamp actual spend or conceal overrun.
- Existing grant/consent/source authorization remains mandatory before reservation/transmission and after result. This ledger is not an authorization service.

## Review focus

- Concurrent twenty requests must not oversubscribe either shared or actor cap.
- Same idempotency key with changed hash or quote must not reuse another reservation.
- Wrong actor cannot transition/read another job, including guessed job IDs.
- Timeout/unknown billing cannot become free retry or quota release.
- Disabled/expired phase blocks new dispatch but must still allow accounting for requests already sent.

## Task: database ledger + server adapter

Files: `infra/sql/20261103_ai_budget.sql`, `apps/api/src/modules/ai/budget-postgres.ts`, `tests/api/ai-budget-postgres.test.ts`; extend existing disposable PG full suite and document setup in `apps/api/README.md`.

- [x] Write focused adapter tests and observe RED before implementation.
- [x] Add operator-only phase table, actor totals/jobs and narrow reserve/transition functions with explicit actor checks, FORCE RLS, no PUBLIC execution, fixed search_path.
- [x] Implement bounded input/output validation, BEGIN/set_config/COMMIT/ROLLBACK and opaque errors. No network or runtime activation.
- [x] Extend real disposable PG proof: concurrency20, idempotency/conflicts, actor isolation, unknown hold/verified settlement, disable/expiry and overrun.
- [ ] Run focused unit/type/build/policy checks and actual GitHub PG CI. Preserve failures and skips accurately.
- [ ] Independent review; publish a dedicated PR based on main, request actual current-HEAD nonauthor approval. Keep #20/#88/#143 open until full criteria are met.

## Ledger

Starting main `3959a66` (fresh fetch), PR145 is independent pending current-head nonauthor approval. This budget implementation does not depend on its unmerged serializers and does not change collaborator core/UI.

Adapter tests RED on missing module, then 11 PASS; initial typecheck found test-only union construction error, corrected explicitly. Independent review reproduced actual cost above 10^12 rejected by quote cap: added RED regression, separated actual safe-integer range and numeric aggregate totals; local12 PASS/29 opt-in PG SKIP. Added eight real PG cases, including independent attempt-count and large-charge scenarios. Focused reviewer recheck found no remaining actionable issue; actual PG CI still pending.
