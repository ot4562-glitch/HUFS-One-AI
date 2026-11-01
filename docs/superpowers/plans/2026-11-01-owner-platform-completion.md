# Owner platform completion implementation plan

> For agentic workers: execute bounded tasks with red/green tests and independent review. The owner's current instruction authorizes continuing through all implementable owner work without intermediate approval prompts.

**Goal:** Complete the remaining implementable 심민성 platform paths against the current GitHub code; record external dependencies without claiming operational readiness.

**Architecture:** Retain Fastify, strict Zod contracts, current authenticated actor/grant/source receipts, PostgreSQL transactions and separate owner/demo namespaces. Never activate production, collect student originals, provision infrastructure or invoke paid providers.

**Tech stack:** Existing TypeScript/React/Fastify/PostgreSQL/Vitest dependencies only.

**Spec:** Architecture.md A02/A03/A06/A10/A13/A14/A15/A17; docs/WORKSTREAMS.md; docs/TRUSTED_RAG_MEDIA_VERSIONING.md; latest GitHub owner issues #8/#18/#19/#21/#25/#27/#39/#52/#61/#71.

## Global constraints

- Preserve the provided ZIP checkout; work inside `implementation/` on a feature branch.
- Preserve unrelated changes; shared files use hash checks before edits.
- Real Google/SMTP/TLS/NCP/provider setup, student/source permissions and independent human gold labels remain external gates.
- Changes to collaborator UI, recommendation and academic algorithms require their ownership; use existing ports/contracts.
- Code is proposed through a PR; no main merge without independent current-HEAD approval and required CI.

## Review focus

- In-flight session/grant/source revocation must discard all derived results.
- Actor, tab/run, subject and dataset versions must never share overlay state.
- Edited/deleted experience or changed consent must invalidate approved topics.
- Source review must preserve original bytes and real fetch times; a later approval cannot leak into past asOf.
- OTP admission failures must prevent actual sends and retain bounded durable counters.

## Tasks

- [x] Read all repository Markdown through parent plus two read-only document audits; reconcile latest GitHub owner issues/PRs with the stale ZIP copy.
- [x] Establish latest main baseline: `npm ci --ignore-scripts --no-audit --no-fund`; `npm run check`: 1053 PASS / 26 opt-in PG SKIP.
- [ ] Reuse existing PR #77 calendar client commits and verify transport tests locally.
- [ ] Replace obsolete browser evidence-search stub with strict current-envelope transport; test malformed/private wire, encoded query, historical asOf, errors and cancellation. Recheck authenticated session after asynchronous server retrieval.
- [ ] Add durable account/IP/global school-mail admission (auth worker owns auth limiter/service/SQL/tests; parent wires HTTP IP).
- [ ] Preserve source originals and implement independent review attestations with current-head/hash/rights checks, temporal selection and conservative HTML5 extraction (source worker owns source/SQL/tests).
- [ ] Implement explicit local experience-topic approval bound to owner/content/consent versions and invalidated by edits/revocation (experience worker owns contracts/profile/SQL/tests; parent wires integration).
- [ ] Implement bounded actor/run/subject demo overlay CAS/reset and recomputation using existing scoped input/core ports; preserve immutable originals.
- [ ] Generate shared synthetic snapshots from the existing 40+10 corpus, keeping independent human gold review pending.
- [ ] Add read-only ADMIN preflight metadata with PASS/FAIL/NOT_RUN and fail-closed aggregate readiness.
- [ ] Run focused regressions, typecheck, API/web builds and privacy boundary; run disposable PG tests if local tooling is available, otherwise report skips honestly.
- [ ] Obtain fresh independent code review, address material findings, record results and remaining external gates; prepare feature PR without merging main.

## Execution ledger

- User paused development and requested PR publication then waiting. Implemented code is submitted as a draft; additional browser overlay/experience convenience methods are deferred, with test draft preserved under ignored `local_only/pending/`.
- Final local Node24.15.0 verification: check 1148 PASS/30 real-PG opt-in SKIP, API+web builds PASS, generated artifact check PASS, privacy146/146 PASS. First full run found one stale SQL-source assertion; updated for effective view and reran the whole check successfully.
- Independent bounded agent review found no material blocker in reviewed paths; actual human current-HEAD approval and real operational gates remain pending.

- Initial GitHub main: `51c3c11`; ZIP source has no `.git`. Fresh checkout has an EOL-only `apps/api/README.md` diff; preserve until deliberately normalizing documentation.
- Runtime is Node 24.14.0; installed jsdom dependencies warn their supported floor is 24.15.0 (or supported 22/26). Baseline tests nevertheless pass; use an isolated supported runtime for final evidence if available.
