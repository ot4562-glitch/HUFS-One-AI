# Local implementation for issues #8, #19, #20, #27, #46 and #89

## Scope and source of truth

This local branch implements code gaps for the six requested issues. It does not
close GitHub issues or grant production acceptance. The original checkout and its
16 existing modified/untracked items were preserved; work is isolated in
`local_only/worktrees/issue-closure-20261105` on
`feat/issue-closure-20261105`.

The base was refreshed from origin/main before implementation and checked again
after integration: `ff9327791bf046512d6e61c5b6862eb098fa5b34`. The original
checkout's HEAD remains `1d4396054770c312c087be2ebea0169c85a3b6f5`.
The initial document review covered 73 tracked text documents and the one PDF
template, together with the six issue bodies. New implementation documents were
read during integration. Current Architecture/STATUS/workflow records take
precedence over older dated implementation notes.

## Implemented changes

| Issue | Local implementation |
| --- | --- |
| #8 | Four versioned AI task results and consumer rendering; API/DTO/design/TASK inventory with explicit unresolved coverage; compatibility and consumer tests. |
| #19 | Cancellation-aware DNS and response handling; fresh rights immediately before GET; immutable IMAGE and bounded PDF originals, page rasters, OCR geometry and temporal retrieval after independent review. |
| #20 | Evidence-bound results for experience tags, opportunity terms, personal action brief and graduation explanation; cancellation cleanup limited to the exact newly reserved unsent budget entry; bounded IMAGE/PDF OCR pipeline. |
| #27 | Private intake operator plan/preview/apply with reviewed factory path, exact preview binding, independent current authority and all-four-owner atomic CAS; authority rechecks around experience-draft writes. |
| #46 | Metadata-only inventory of current and historical protected Git paths; aggregate/hash-only reporting, publication path/symlink/read-error safeguards and regression tests. |
| #89 | Offline license evidence and deterministic CycloneDX 1.6 npm BOM; deployment publication and entrypoint provenance checks; packaged private media workers with root ownership; CI/test-policy integration. |

### AI result contracts

The new `ai-task-result-v1` result is accepted only against the current authorized
packet. It validates citations, allowed topics/objects, exact action order and
approved graduation fact keys. Displayed phrases must be extractive; accepted
results remain `NEEDS_REVIEW`. Cache reads are revalidated and the UI clears data
on authority/session invalidation. These checks do not certify semantic truth,
official academic decisions or the meaning of all numbers written in words.

Budget cleanup releases only the exact newly created, still-RESERVED entry when
reservation completion arrives after cancellation. It does not release an existing replay or a dispatched/ambiguous
charge. Crash recovery and real billing settlement remain separate acceptance.

### Original media and evidence

PNG/JPEG use the identity raster contract. The PDF path is implemented through
the native renderer, per-page OCR, durable writer, independent reviewer and
temporal reader/gateway. It retains both the original PDF and actual PNG bytes.
An OCR binding or geometry mismatch on any page rejects the entire extraction
candidate; transcription accuracy still requires independent review.

The PDF v1 limits, pinned parser/runtime identity, coordinate matrices,
composition, migration order and proof boundaries are documented in
[PDF_RUNTIME](../infra/ai/PDF_RUNTIME.md). PDF is limited to four full, unrotated,
uncropped pages with UserUnit 1 and a 256 KiB original. The full native sandbox
and actual PostgreSQL execution are not claimed from the protocol tests.

The two new migrations are review artifacts and were not applied to an operating
database:

1. `infra/sql/20261105_source_image_evidence.sql`
2. `infra/sql/20261105_source_pdf_evidence.sql`

They follow `20261101_source_review.sql`. All five existing opt-in PostgreSQL
fixture lists include them; the full fixture exercises both media slices.
Supported concurrent writers must obey the existing source-head lock protocol.

### Private intake and release evidence

The intake command has no public upload route. Its private factory must be an
approved direct child of `/etc/hufs-one/private/`; missing configuration or
production-mode preview/apply refuses before private I/O. The plan and production
refusal paths were exercised after compilation. Real four-person input was not
read or imported. A valid local preview is not consent or official academic
acceptance.

The Git history audit found zero protected paths in the current committed tree
and six in the available history. That is a local metadata result, not clearance
of every clone, unreachable object, backup or the original authors' publication
rights. The audit does not open protected historical file content.

The npm inventory contains 191 components: 161 with present local license
evidence and 30 UNKNOWN. Its status remains PARTIAL. It does not cover the
container/native PDF runtime, Python, fonts, model weights or other non-npm assets.
UNKNOWN must remain unresolved until evidence is reviewed.

## Verification record

The task-local `local_only/verification/` directory holds command/exit records and
logs. These are local evidence, not public release attestations.

The final four-worker run finished with exit 0: **2,793 tests passed and 83
PostgreSQL opt-in tests skipped**, across 260 passed and eight skipped files.
The integrated no-emit typecheck also exited 0. The Python release suite reported
`Ran 136 tests` and `OK (skipped=2)`: PowerShell execution was unavailable, and
the local native-Poppler test class was skipped. Its three native tests were
included in the separate 11-test worker run described below.

The eight sequential post-test checks all passed: API build, web build, 33 Node
security regressions, anonymous HTTP, publication, browser static boundary and
the compiled intake plan/production-refusal paths. The anonymous check exercised
122 requests on seven routes. Publication checked 297 files and found no server
source maps or map references. These offline checks intentionally retain
`RELEASE_BLOCKED` and the unexecuted operating gates. The web build emitted its
586.06 kB minified-chunk warning; this is not a real-host performance measurement.

The API inventory validates 115 API TypeScript files, 89 registrations, 39 design
contracts and 19 TASKs mapped to 15 canonical issues. Validation is PASS, while
coverage remains UNKNOWN: 29 design rows are statically INTEGRATED and ten remain
UNKNOWN, with two dynamic imports. This is not a runtime acceptance certificate.


- `pdf-final-full-tests-green.json/.log`: complete Vitest suite under Node 22.22.2
  with four workers. The earlier eight-worker command in
  `pdf-final-full-tests.json/.log` had 2,792 passing tests and 83 skipped tests,
  but failed because the React smoke worker did not start before its deadline.
  That unchanged file passed separately (`pdf-react-worker-retry.json/.log`);
  the complete suite was then rerun instead of treating the failed command as PASS.
- `pdf-final-typecheck.json/.log`: final integrated TypeScript no-emit check.
- `pdf-final-release-python-green.json/.log`: release Python regressions using
  the isolated, hash-pinned pypdf package. Native-dependent skips are explicit.
- `pdf-final-build-gates.json/.log` and `pdf-build-gates-results.json`: API/web
  builds, security regressions, anonymous/publication/browser static gates and
  compiled private-intake plan/refusal checks.
- Native worker verification: all 11 synthetic tests ran in an isolated test
  environment with pypdf 6.21.4 and actual native Poppler; details and limitations
  are in PDF_RUNTIME. Full bubblewrap setup was unavailable and remains NOT_RUN.

The PDF extractor -> durable -> actual writer/reviewer/reader classes -> gateway
integration regression uses synthetic renderer/OCR and SQL protocol fixtures.
It proves the component wiring and assertions; it does not execute PostgreSQL
triggers, RLS or role grants.

Reproduce the main local checks with the repository's supported Node version:

```bash
npm exec --yes --package=node@22.22.2 -- npm test -- --maxWorkers=4 --testTimeout=15000
npm exec --yes --package=node@22.22.2 -- npm run typecheck
npm exec --yes --package=node@22.22.2 -- npm run build:api
npm exec --yes --package=node@22.22.2 -- npm run build:web
python3 -m unittest discover -s tests/release
```

The last Python command reports dependency-related skips when the reviewed
parser/native prerequisites are absent. Do not silently interpret skips as PASS
for those native operations.

## Conditions still required for issue closure

| Issue | Acceptance not established by this local code |
| --- | --- |
| #8 | Independent consumer/design acceptance and actual configured runtime behavior; unresolved design mappings and official-rule approvals. |
| #19 | Source and processing/display/external-AI rights, actual PG-to-UI temporal checks and independent authorized poster/PDF/bbox evaluation. |
| #20 | Real provider quota/tokenizer/usage/billing evidence, native sandbox deployment, required host resource/performance acceptance and crash billing reconciliation. |
| #27 | Actual auth/mail and least-privilege PG roles/TLS/RLS, restart/browser/reviewer acceptance, approved real four-owner intake. |
| #46 | Field/purpose/revocation/Git/cloud/model rights and review of historical distribution; prior consent records alone do not establish every purpose. |
| #89 | Real NCP/DNS/TLS/ingress/restore checks, complete runtime/model/asset license and NOTICE evidence, current-head independent human acceptance and handoff. |

`AI_ENABLED=false`, Laya OFF and `RELEASE_BLOCKED` remain. No push, PR, issue
closure, real student-data upload, paid provider call, production migration or
deployment was performed. Independent automated code review is recorded
separately from human acceptance.
