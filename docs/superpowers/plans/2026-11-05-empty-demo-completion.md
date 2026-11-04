# Issue #132: EMPTY_DEMO end-to-end completion

## Scope and decisions

Continue PR #220 from 8f79b84 (main ff93277 checked against origin). Reuse the established owner-only `DemoProfileValue/Record/Response`, `OwnerSessionController`, maintained synthetic corpus and `LocalAccountWorkspace` vocabulary. Do not restore the duplicate account model from closed/unmerged #134. Keep the original user worktree unchanged.

- Preserve the four-setting profile value and add a bounded synthetic workspace to the same actor-scoped row and version. A new workspace PUT uses the existing CSRF/BETA/RLS/CAS policy. Profile edits retain workspace; RESET clears profile, bookmarks, experiences, plan, search, notification preference and explicit synthetic experience overlay together. Legacy stored rows migrate to a blank workspace.
- Derive recommendation, notices, club summaries, details, calendar and saved items from one fixed DEMO_AS_OF and the maintained fictional corpus. Never infer official academic facts from self-reported credits/major. Academic/forecast remain UNKNOWN; external application remains disabled. Experience signals require an explicit synthetic-only overlay switch and are never official eligibility facts.
- Replace the counts-only owner UI with accessible feature panels and bounded workspace editing. Discard prior results on actor/permission/version/provider failure, cross-tab invalidation and page resume. Broadcast only an invalidation token, never identity/profile data; do not persist browser data.
- Keep 40 opportunities, 10 notices and 5 profiles as existing source truth. Add eight code-native topic cover fallbacks plus empty/initials assets and a hash/provenance/budget manifest; no external images or invented AI attribution. #123's real generated PNG has a separate authenticated asset path and provenance.
- Keep legacy demo-snapshot.json unchanged. #61 independently supplies 200-label export/signature tooling and 20 OCR/12 temporal fixtures. No generated report may count synthetic signatures as independent human acceptance.

## Implementation order

1. Add failing workspace/RESET/CAS/overlay and HTTP tests; extend contracts, service, durable PG store and migration.
2. Wire owner client and role services, implement feature UI, cross-tab/page-resume invalidation, and UI regression tests.
3. Add corpus/asset checks and the executable 60-second / 10-minute presentation runbook with explicit external acceptance requirements.
4. Integrate #61/#123/#133 isolated commits, run relevant focused tests then one full suite/build, inspect real PostgreSQL and Chrome CI, and update the same PR.

## Acceptance evidence

Record exact commands, Node 22.22.2, exit codes, counts, revision and environment. Unit/HTTP mock evidence, real disposable PostgreSQL, actual Chrome, and independent human screen-reader/reviewer evidence are separate. Automated checks do not substitute for named human sign-off. Real mail/OIDC/NCP/paid providers and real student imports require their existing runtime evidence and are not fabricated by this change.
