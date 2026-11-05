# Follow-up issue implementation — 2026-11-05

## Scope and integration

This change continues the original issue #8/#19/#20/#27/#46/#89 work in the single PR #220 and adds the implementable parts of #61, #123, #132 and #133. The working branch is `feat/issue-closure-20261105`. The latest inspected main, `04fb5d7aeb86cb6addd3dd63ab61373383b3c09e`, was merged before the final integration checks.

The original local checkout and its uncommitted work are preserved. These changes are developed in the isolated `local_only/worktrees/issue-closure-20261105` worktree. This document records implementation scope; the PR checks and final PR description carry the exact tested HEAD and final result.

## #61: independent review execution

- Reuse the existing canonical 40 opportunities, 10 notices, five synthetic profiles and 200 draft labels without replacing their source or the fixed 20/20 tuning/report split.
- Export recommendation and media review packages with blank judgments, exact case/source hashes, source spans, revision references and schemas. The offline editor supports explicit draft save/resume.
- Validate separately pinned reviewer authority, canonical Ed25519 signed submissions, scope, expiration, revocation and author/reviewer separation. Keep append history, exact replay and explicit corrections.
- Reuse existing ranking and metric functions. Independent quality metrics stay null / NOT_RUN until independently authorized review judgments exist.
- Add 20 actual synthetic PNG/HTML pairs and 12 temporal/correction cases with exact bytes and reference manifests, separate from recommendation labels and the AI club illustration.
- Run HTML extraction and core temporal evaluation locally. OCR/HCX observation imports retain their declared provenance; no paid provider execution is implied.
- Measure local core calculation and Map reuse at 50 samples, plus 100 switches over 20 directions. These measurements do not stand in for browser/API/NCP/Laya ON performance.

Execution: [INDEPENDENT_EVALUATION.md](INDEPENDENT_EVALUATION.md).

## #123: synthetic club publication

- Persist synthetic publication records with PostgreSQL CAS, FORCE RLS, explicit source scope and audit metadata.
- Connect ADMIN creation, approval/rejection, edit/reapproval and revocation to the BETA board, detail and authenticated poster routes.
- Bind read receipts to actor, source, profile digest, grant version, catalogue revision and asOf. Recheck after asset I/O so revoked or changed posts do not serve old bytes.
- Include a real generated PNG with byte hash, decoded dimensions, alt text and provenance. Serve it only through the authenticated current-approval route; use lazy loading on detail.
- Separate ADMIN UI capabilities from BETA owner ports and REVIEWER synthetic slots. Clear ADMIN drafts on permission failure or tab suspension.
- Extend the explicit loopback-only synthetic launcher with a fixed synthetic ADMIN bootstrap; no real identity or operational administrator authority is created.

Poster provenance: [GENERATED_CLUB_POSTER_20261105.md](GENERATED_CLUB_POSTER_20261105.md).
Local instructions: [EMPTY_DEMO_RUNBOOK.md](EMPTY_DEMO_RUNBOOK.md).
PostgreSQL proof: `tests/api/synthetic-club-live-opt-in.test.ts` and the isolated PG18 CI job.

## #132: independent EMPTY_DEMO

- Keep the independent owner namespace and four settings. Treat a literal zero credit value separately from missing information.
- Persist bookmarks, experience drafts, study-plan IDs, search, notification preference and an explicit synthetic experience overlay with the profile version.
- Recompute recommendations, notice/calendar views and evidence at the canonical fixed asOf; retain UNKNOWN / NOT_SHARED for unsupported academic/forecast claims.
- Preserve all currently visible eligible, ineligible and closed catalogue cards while excluding future publication. Display source, synthetic status, deadline semantics and disabled real application actions.
- Reset settings and all workspace state atomically with CAS; reject stale post-reset writes and old replay receipts.
- Invalidate delayed responses on actor/session changes, cross-tab updates and resume. Keyboard confirmation returns focus to its opener; reset clears transient filters.
- Add ten original synthetic SVG assets with a byte/hash manifest and accessible text.
- Provide an executable local launcher, 60-second target sequence and 10-minute presentation / five-minute Q&A guide. A written sequence is not a recorded human rehearsal.

The Chrome workflow exercises the real HTTP path at 360px, including two tabs, delayed pre-reset responses and reset/end behavior. Real PostgreSQL persistence/restart and RLS use a separate isolated suite.

## #133: academic and original-input authority

- Add explicit degreePath/track selection and bounded multi-document RulePack provenance with clause-to-document SHA coverage.
- Consume AREA_SPREAD and GROUP_CHOICE through earned-credit ledger, overlap and revision comparison. Preserve review holds for unresolved course recognition, including the What-if core newly merged from main.
- Apply only explicitly approved same-course rules; do not infer equivalence from titles or code fragments.
- Bind saved WIS processing to URL, original and CSV hashes, capture, term/campus/scope, converter version and current permission.
- Require each restricted original-input receipt to bind the exact Forms/course hashes, owner/actor, action, purpose, consent and retention. Include the receipt in the preview fingerprint and revalidate before COMMIT.

## Verification and acceptance boundaries

Meaningful regression tests accompany the changed contracts, actual HTTP/client paths, PostgreSQL protocols, UI isolation, evaluation CLI and fixture bytes. The CI checkout is limited to the exact public synthetic code, fixtures and required evaluation instructions. Dedicated PG18 databases and roles exercise persistence and permission rules without resetting existing databases.

Automated code review, synthetic credentials and test signatures are not independent human or institutional approval. The remaining acceptance facts are explicitly unchanged:

| Acceptance item | State |
|---|---|
| Independent recommendation human judgments | 0 / 200 |
| Independent media / temporal human judgments | 0 / 32 |
| D01 / D02 final independent acceptance and screen-reader/device review | PENDING |
| Four real originals: current per-file rights, matching owner receipts and actual account acceptance | NOT_RUN / awaiting verified operational inputs |
| Official school RulePack / source rights approval | Not granted by this code change |
| Real OCR/HCX, NCP service use, Laya ON cost/latency and production deployment | NOT_RUN |
| Real school / club recruitment approval | Not granted |
| Production release | RELEASE_BLOCKED |

These issues should not be automatically closed solely because the implementation or synthetic CI passes. The PR intentionally contains no automatic issue-closing keywords.
