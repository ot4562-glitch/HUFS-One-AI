# Owner platform continuation (2026-11-01)

## Goal and authority
Continue the owner's API/contracts/browser integration work from PR #83, retaining all prior work and completing independently implementable gaps. The latest owner instruction supersedes the historical pause in #83. Do not deploy, create paid resources, process real student originals, or overwrite other collaborators' modules.

## Architecture and constraints
- Canonical product specification: Architecture.md A02/A06/A10/A13/A14/A15; source/permission and REVIEWER contracts under docs/.
- Own paths: apps/api, apps/web/src/integrations and app controllers, common contracts/tests/SQL/config and integration docs. UI screens, recommendation algorithms, academic algorithms and NCP provider execution remain with their named owners.
- Worktree: implementation/local_only/resume on feat/owner-platform-resume-20261101. Existing implementation/apps/api/README.md dirty work is untouched.
- Inherit #83 at 4cc043f; merge current main 0a8d44bd without resetting/rebasing contributor branches. Use command-local git identity only.
- No new dependencies. Runtime for verification: isolated node@24.15.0, npm ci --ignore-scripts.
- Every mutation uses current server CSRF, strict request/response schemas, CAS version checks. Never cache personal JSON or accept browser actor/role/source authority.
- Completion means code and reproduced tests; independent collaborator approval and real deployment/permissions are separate gates.

## Tasks
- [x] Preserve existing dirty checkout in an ignored independent worktree; install pinned lockfile; merge latest main.
- [x] Reproduce baseline: npm run check => 1178 passed, 30 opt-in PostgreSQL skipped. Upstream #83 GitHub Actions 41280935002: synthetic-contracts and postgres-integration SUCCESS.
- [ ] Finish complete tracked Markdown/document inventory and reconcile architecture endpoints with actual handlers and dependency boundaries. Read history as evidence, not execution authority.
- [ ] TDD: finish the pending overlay/tag-approval browser client; shared overlay response contract, request body verbs, before-network validation, context/subject/dataset/projection/consent/asOf and CAS checks. Invalid, stale or cancelled responses must not reach UI.
- [ ] TDD: expose all existing owner profile/consent/workspace/catalog endpoints through a typed browser client, including correct per-kind and item bindings, bounded paging, deletion receipts and error handling. No private caller identity in requests.
- [ ] TDD: integrate returned overlays and private owner operations with epoch/context/session invalidation; demonstrate actual Fastify-to-browser transport with synthetic data, not only fixtures of success.
- [ ] Audit remaining owner-side handlers and public metadata/readiness boundaries for missing post-await authorization and current contract gaps. Implement unblocked defects; record specific required source/provider/collaborator inputs rather than returning fabricated success.
- [ ] Full verification: check, build:api, build:web, fixtures:check, privacy boundary, diff whitespace, remote disposable PostgreSQL CI after publishing. Preserve skipped and untested gates explicitly.
- [ ] Self-review actual diff and test results; publish a scoped non-draft follow-up PR, requesting actual non-author reviews. Never self-approve or auto-merge code.
- [ ] Publish concrete nonduplicate improvement proposals as GitHub issues, with actual current collaborator assignees, acceptance tests, scoped ownership, dependencies and privacy gates.

## Review focus
1. Optional input must never coerce undefined/null/object into a valid path ID.
2. A mutation response must match context, target, expected next version and consent; a schema-valid stale/cross-target response still fails.
3. A read or body stream cancelled during/after fetch must not be turned into a user-visible provider error or success; no second CSRF-protected request after cancellation.
4. A late read/write from an old epoch cannot repopulate another subject or a logged-out owner screen. Concurrent writes must not silently regress newer state.
5. Real source/official academic approval/provider rights are not proven by structural schema parsing or synthetic tests.

## Execution ledger
- Baseline: PASS 111 files / 1178 tests, 3 files / 30 PostgreSQL opt-in tests skipped locally. Existing #83 remote PostgreSQL job succeeded; this is prior-head evidence only.
- New tests, implementation outcomes, review findings and final SHA/CI will be recorded after execution, not prefilled as passing.
