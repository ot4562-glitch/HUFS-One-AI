# Issue 133 Academic Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Connect the missing scoped academic rules and exact private source authority to the existing academic core and owner consumers.

**Architecture:** Extend the opt-in vNext academic contract, preserving legacy single-document packs when no new scope axes are present. Keep computation pure and require the existing private owner/permission adapters to bind every new scoped fact and document to current authority. Saved WIS artifacts and restricted intake use exact content bindings; no browser or live collection path is introduced.

**Tech Stack:** TypeScript, Zod, Vitest, existing PostgreSQL ports; Node 22.22.2.

**Spec:** GitHub issue #133 and all seven comments, particularly lead decision 6603484094 and synthetic counterexamples 6619014407; Architecture A08. Issue evidence was read on 2026-11-05. The user authorized local implementation and integration by the root agent.

## Global Constraints

- Only synthetic data and local tests. Existing participant consent is acknowledged but does not fabricate specific input, official RulePack approval, external transfer rights, or owner operation evidence.
- Original dirty checkout is untouched. Work in the existing isolated worktree on `feat/issue-133-academic-20261105`, based on `8f79b84df1ea761f65da56d06dfe62f7c40cc193`.
- Focused tests use Node 22.22.2 and `--maxWorkers=1`; the root agent runs the full suite/build and owns push, PR and issues.
- Actual PostgreSQL, school RulePack review, private inputs and live identity integrations remain NOT_RUN / not evidenced.
- No implicit language, course-name equivalence, 7+2 course code split, or WIS period-to-time conversion.

## Review Focus

- A scoped candidate plus an unselected degree/track, or matching legacy/scoped candidates, must not select an arbitrary pack.
- A correct first document must not conceal a missing, altered, revoked or stale second document.
- A course spanning two areas must not count twice; partial groups must not combine into a completed group.
- New owner scope values must survive strict parsing and participate in current-authority/replay checks; absent old fields remain valid only for legacy packs.
- Two saved artifacts at one URL and two raw files for one subject must not inherit each other's permissions.

## Task 1: Scoped contracts and pure calculation

**Files:** Modify `packages/contracts/src/academics/vnext.ts` and `packages/core/src/academics/{ledger,rule-approval,rule-diff,double-major}.ts`; create focused synthetic contract/core tests.

**Interfaces:** Concrete degree paths are DOUBLE_MAJOR, ADVANCED_SINGLE and ADVANCED_PLUS_MINOR; owner choices may be UNSELECTED, and track may be UNDECIDED. RulePack sourceDocuments is bounded to 10 with per-clause document IDs and independent per-document hashes. AREA_SPREAD requires distinct earned areas and unique credit units; GROUP_CHOICE requires all earned courses of at least k disjoint groups. No new language inference is added.

- [x] Write and observe failing A/B/C1/C2 regressions, plus C3 hold and legacy compatibility controls.
- [x] Implement additive schemas, exact selector, coverage, activation and diff support.
- [x] Implement the two ledger kinds and overlap dependencies.
- [x] Run focused contracts/core tests and typecheck (139 cases, then the additional selector counterexample; 8 property cases).

## Task 2: Current owner and source authority

**Files:** Modify `packages/contracts/src/academics/double-major.ts`, `packages/contracts/src/evidence/index.ts`, `apps/api/src/modules/academics/owner-double-major-{source,postgres}.ts`, `apps/api/src/modules/opportunities/{rights-postgres,temporal-gateway}.ts`, and focused owner/rights tests. Additional equivalence consumer changes are bounded to the private owner input and existing pure approved equivalence function.

**Interfaces:** New scope facts live in current private scope receipts, not browser claims. Scoped packs require matching current facts. New missingInputs DEGREE_PATH and TRACK represent unselected scoped axes. Every source document maps to an exact current sourceId/revisionId/permissionRef and original hash.

- [x] Write and observe failing owner unselected/mismatch, document-binding and authority-change regressions.
- [x] Connect the contracts/core to current owner validation and PostgreSQL-port checks.
- [x] Keep public responses free of raw originals, transcript rows and full private inputs.
- [x] Run focused owner/rights tests and typecheck (42 cases; 10 existing HTTP/browser boundary cases).

## Task 3: Exact saved and restricted-input permission

**Files:** Modify `apps/api/src/modules/curriculum/permitted-curriculum.ts`, `apps/api/src/modules/academics/intake-postgres.ts`, and their focused synthetic tests; change operator runtime tests only if required by the private authority contract.

**Interfaces:** Saved WIS authority is keyed by source URL, actual original and normalized CSV hashes, capture metadata, term, campus, scope and converter. Restricted intake binds authorization to the actual forms/course hashes and existing subject/actor/action/purpose. Recheck exact authorization before return/COMMIT. Existing CAS and all-or-none import stay intact.

- [x] Write and observe failing cross-artifact, stale permission and swapped-file regressions.
- [x] Implement exact authority requests without raw echo, browser override or default credentials.
- [x] Run focused intake/WIS tests and typecheck (25 saved-curriculum/WIS and 46 intake/CLI cases).
- [ ] Complete independent code review, update this ledger, and commit exact paths.

## Implemented Contract Details

- Current approved owner scope receipts may carry degreePath, track and curriculumVersion. These values participate in receipt fingerprints; scoped packs cannot borrow missing legacy facts. Matching legacy/scoped candidates remain ambiguous. Known nonmatching degree paths are excluded before testing whether a track choice is required.
- Every multi-document pack carries an exact document inventory, per-clause document IDs and independent per-document hashes. Owner input additionally binds each document to a current source/revision/permission triple and the stored original hash. Missing/revoked second documents fail even when the first document and numeric checks pass.
- AREA_SPREAD uses earned, uniquely assigned areas; ambiguous multiple-area credit stays NEEDS_REVIEW. GROUP_CHOICE requires complete disjoint groups. Existing explicit approved same-course rules now feed the owner calculation; pending mappings cannot silently count credits. C3 language uncertainty stays MANUAL/UNKNOWN_APPLICABILITY.
- Saved imports require `capture` plus `SavedCurriculumAuthority.resolveSaved(key, now)`. The key includes exact URL, actual original/CSV SHA-256, capturedAt, term, campus, scope, converterVersion, permissionRef and permissionVersion. CSV rows must match the authorized term/campus/department scope. URL-only `resolve` remains solely for the existing HTTP collector. A legacy saved receipt cannot authorize a new exact capture.
- Restricted intake requires both `mayProcess` and `resolveOriginalPermission`. The latter receives only actor/subject/action/purpose/time and actual Forms/course SHA-256, never raw source text. Its strict versioned receipt binds those hashes to permission, consent and retention references, allowed actions, review/expiry times and revocation state. Receipt fingerprints bind preview and batch hashes; changes invalidate prior confirmations.
- Input snapshots precede authority awaits. Original receipts and purpose rights are rechecked before preview return and before all-four COMMIT, preserving mixed-head CAS and idempotency. Unknown file mappings now fail before CSV interpretation. The private operator CLI requires the new authority method; `--plan` still loads no private configuration and opens no pool.
- Only the existing synthetic intake constructor in the opt-in PG fixture was adapted, with a fixed synthetic authority clock. No SQL migration or live PG run was added.

## Verification and Remaining Acceptance

All regression inputs and authority receipts are invented fixtures. The observed RED runs covered missing A/B/C1/C2 code, owner authority binding, 30 saved/intake cases, an unrelated-track false denial, and a legacy candidate with a multi-document trusted inventory that could otherwise activate. Focused suites subsequently passed; the final Node 22.22.2 typecheck passed after both review corrections. The last scoped/approval run passed 41 cases, and 10 existing HTTP/browser checks also passed. Automated core/owner peer review found the asymmetric inventory path; its regression and fix were reread with no remaining concrete blocker. The saved/intake peer review is in progress while this scoped commit is handed off for integration.

Actual four-person originals, source-specific withdrawal/retention records, official RulePack independent human approval, configured owner scope receipts, real accounts, and live PostgreSQL/RLS/session evidence remain external acceptance requirements. Existing participant consent and HUFSAbility collection permission are acknowledged; they are not substituted for those distinct proofs. Automated review and synthetic permissions do not constitute human or school approval.
