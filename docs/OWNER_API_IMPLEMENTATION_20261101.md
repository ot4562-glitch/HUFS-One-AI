# Owner API implementation and provider handoff — 2026-11-01

> **2026-11-04 통합 후 현재 판단:** 2026-11-04 현재: 이 문서는 2026-11-01 Owner API 구현/인계의 **과거 작업 기록**. owner/feed/source rights/PG/React #183/#185/#187/#213 등은 [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216) 통합 main f23b86bb에 반영, OPEN PR 0. 실 OIDC/학교메일·학칙 RulePack·운영 PG/TLS/실원본 인수는 NOT_RUN/RELEASE_BLOCKED. [STATUS](../STATUS.md)·[잔여 구현](REMAINING_IMPLEMENTATION_20261104.md).

User request: implement all remaining Sim Minseong issue-owned code and submit a PR.
Scope is the current main and issues #119, #86, #82, #81; existing #80/#85
API milestones are present. UI/core/provider ownership and release blocks remain.

Design: extend the existing strict contracts, authenticated Fastify integration
and session-scoped browser clients. Use independent server rights and approval
authorities before private reads and revalidate after awaited work. Missing
approved providers fail closed. Do not add production resources or real data.
Reusing these ports avoids a second authentication system and unauthorized
imports of unmerged core PR #117. No new third-party dependency is needed.

- [x] #119: strict same-opportunity revision comparison request/response, reviewed
  claims and citation refs only, asOf validation, per-revision independent rights,
  no unapproved/withdrawn content or predecessor fallback. Test corrected deadlines,
  cancellation, unknown/conflict, equal hashes, replay and revoked/late results.
- [x] #86: strict single visible opportunity explanation, safe reason enums and
  evidence refs with source/rank/asOf dependencies. Authorize existence before
  evaluation; omit personal facts/scores/hidden candidates. Test malformed,
  unavailable, forbidden and changed rights/results.
- [x] #82: register read-only hypothetical calculation HTTP API around #107 DTO,
  independent consent/rights/approval before READY, exact scenario/current-version
  binding, final source/session rechecks. No current-major or ledger mutation.
- [x] #81: register existing study-plan checker with explicit trusted dependencies
  and keep absent dependencies unavailable; add browser request/result binding.
- [x] Add all four browser consumers using existing transport and owner-session
  operation guards. Test 401/403/409, actor/tab invalidation and late responses.
- [x] Focused red/green tests, typecheck, API/web builds, synthetic regression and
  independent agent code review. Eligibility set-order false differences fixed.
- [x] Privacy boundary run: two pre-existing protected-index failures remain (#46).
Review boundary: [additive contracts PR #120](https://github.com/ot4562-glitch/HUFS-One-AI/pull/120)
first, then the stacked API/browser implementation. Neither is a production launch.

Validation is synthetic only. Human source rights, independently reviewed real
RulePacks, actual Google/mail/TLS/PG deployment, UI/browser accessibility, #46 data
audit and RELEASE_BLOCKED are not fulfilled by these changes. Keep parent issues
open and state provider prerequisites and tests not run in the PR.

## Server and browser interfaces

`createIntegratedApi` registers all four read-only POST routes with existing
Origin/CSRF/session hooks. No trusted dependencies means HTTP 503 after
authentication. All responses are no-store. No state or academic ledger is written.

- `POST /api/opportunities/:opportunityId/revisions/compare`: dependency
  `revisionComparison: {source, rights}`; browser
  `owner.compareOpportunityRevisions(id, {beforeRevisionId, afterRevisionId, asOf}, signal)`.
  Source binds the authoritative head at asOf and current withdrawals; independent
  rights verifies exact claims, refs, timestamps, hashes and review metadata for
  both versions. READY has CHANGED/UNCHANGED/UNKNOWN fields; pending/conflict results
  contain only a reason. Original URLs/paragraphs are excluded. Future checkedAt on
  a historical pair conservatively returns 503 instead of rewriting history.
- `POST /api/opportunities/:opportunityId/explanation`: dependency
  `opportunityExplanation: {source, rights, approval}`; browser
  `owner.explainOpportunity(id, {asOf, sourceRevisionId, rankConfigVersion}, signal)`.
  `projectOpportunityExplanation(report, binding)` maps the #117 internal shape to
  one safe decision, discarding text, personal fields, scores and other candidates.
  Source must bind it to approved code and current scoped feed inputs. The unmerged
  #117 engine is not imported or activated here.
- `POST /api/academics/major-what-if`: dependency
  `majorWhatIf: {source, rights, approvalGate}`; browser
  `owner.checkMajorWhatIf({scenario, expectedCurrentVersion?}, signal)`.
  Expected version is checked against the server aggregate receipt, including
  BLOCKED_DEPENDENCY. READY requires independent approval of both RulePacks,
  cohort/overlap/transcript/core/consent and exact evidence links. No What-if
  calculation engine or live snapshot loader is supplied.
- `POST /api/study-plans/check`: dependency
  `studyPlanCheck: {source, rights, approvalGate}`; browser
  `owner.checkStudyPlan({term, expectedPlanVersion?}, signal)`.
  `createTrustedOwnerStudyPlanSource({snapshots})` invokes merged `simulateStudyPlan`
  on an atomic approved owner snapshot. Loader must load/revalidate owner, term,
  asOf, plan/catalog/transcript/rule heads. Its embedded approval never replaces
  independent rights or the current approval gate.

The route-local source/rights/approval interfaces specify mandatory server
integration contracts; none supplies automatic approval or real data. UI consumers
must use `OwnerSessionController.runLatest` and clear rendered results on its
epoch/status changes. No React components are modified. Existing #80 bookmark and
#85 overlay APIs remain those features' consumption points.

## Verification and recovery

Focused regressions cover substitution, missing authority, future data,
withdrawal, CSRF, 401/403/409, logout during preauthorization, approval withdrawn
during final reads, eligibility ordering and all four late browser results.
Agent review is not GitHub non-author APPROVED or human source review.

Final local code verification: TypeScript PASS; 1,530 synthetic tests PASS and
32 disposable-PG opt-in tests SKIP; API/web builds PASS; 12 offline HTTP/session
security regressions PASS. Remote CI and human approvals are tracked on the PRs.

Reproduce with `npm ci --ignore-scripts --no-audit --no-fund`, `npm run check`,
`npm run build:api`, `npm run build:web`. Disposable PG is opt-in/CI. No SQL migration
or new dependency is needed. `py tools/verify_release_boundary.py` still reports
two pre-existing failures for six protected tracked paths; their contents were not
read. Release stays blocked.

Recovery: revert API/browser commit first, then additive contracts once no consumer
imports them. There are no data writes to undo.
