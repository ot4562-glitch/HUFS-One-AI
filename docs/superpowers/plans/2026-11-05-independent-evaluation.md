# Independent evaluation and synthetic media package

Implementation baseline: 8f79b84df1ea761f65da56d06dfe62f7c40cc193.
Scope: #61 and the shared media/temporal evaluation portion of #132.

## Authority and canonical source

- Read issue #61 and all five comments, issue #132 and all six comments, Architecture A15 and D01/D02.
- Keep legacy synthetic/demo-snapshot.json unchanged. Keep demo-corpus-snapshots.json a separate existing generated artifact.
- DEMO_OPPORTUNITIES, DEMO_STUDENTS, DEMO_NOTICES, DEMO_SPLIT, DEMO_AS_OF and existing label-review metadata remain the only corpus source.
- Reuse the existing 20 TUNING / 20 REPORT split and ranker/evaluation helpers. No production rank weights or labels are changed.
- Existing 200 labels are TRACK_OWNER_SELF. Initial independent human review is 0/200.
- Human review requires detached Ed25519 signatures checked against explicitly supplied, hash-pinned reviewer authority. No public server, generated production key, synthetic human identity or automatic HUMAN_PASS.
- Signature verification proves key authority and integrity; it cannot prove actual reading, correctness, a GitHub approval or release acceptance. D01/D02 and RELEASE_BLOCKED remain separate.

## Owned files

- New packages/core/src/evaluation modules for canonical review export, strict signed submissions, append-only ledger, metrics, synthetic media/temporal references and comparison runners.
- New tools/evaluation CLI and isolated TypeScript compilation target; no package/CI/contracts edits without root integration.
- New packages/fixtures/synthetic/evaluation-v1 generated manifest/assets; unsigned review templates are exported into a selected fresh local directory. No real source/student input.
- New tests/evaluation focused regressions and docs/INDEPENDENT_EVALUATION.md.
- This plan; parent owns PR/push/issue updates, full suite, full API/web builds and shared 40/10/5 corpus.

## Task 1 — review package and signed ledger

- [x] Export all 200 recommendation pairs from the canonical corpus, with fixed split/asOf, source and profile hashes, exact synthetic source spans, separate draft relevance and blank independent relevance/eligibility.
- [x] Validate reviewer authority, role/creator separation, scope/head, periods, signature, source/span binding, required condition judgments, rationale and amendment reason.
- [x] Append immutable hash-linked records with optimistic head checking, duplicate/replay handling and amendment lineage. Test-only signatures remain separate from human counts.
- [x] Report explicit independent coverage; missing gold produces NOT_RUN rather than fabricated accuracy.
- [x] Reuse P@3, nDCG@3 and eligibilityAgreement; keep latest/rules/code-plus-enrichment candidate membership, split and rank configuration fixed.

## Task 2 — independent synthetic media and temporal fixtures

- [x] Produce 20 deterministic PNG posters with readable authored bitmap text, HTML counterparts, exact original hashes, pixel/normalized boxes, field values and synthetic-only rights metadata.
- [x] Author 12 temporal/correction cases with explicit expected heads/quarantine reasons independent of the production selector.
- [x] Validate original bytes, source spans, bbox/field identities and reference schemas.
- [x] Run HTML baseline; optional OCR/HCX comparison modes consume exact-bound offline observations and remain NOT_RUN when absent. Synthetic adapters are labelled protocol-only.
- [x] Compute field precision/recall, bbox IoU, citation support/Recall@k, future leakage, false/unsupported ELIGIBLE, UNKNOWN and coverage; record observed cost/latency or explicit unavailability.

## Task 3 — reproducible offline workflow and integration

- [x] CLI export, canonical signing payload preparation, signed import, ledger report, media comparison and >=50 iteration core benchmark.
- [x] Hash-pinned external reviewer configuration is independent of submitted packets. No signed HUMAN record or private key is shipped.
- [x] Atomic, bounded local writes; no overwrite of legacy fixtures. Demonstrate a reviewer-ready packet with blank decisions and independent 0/200.
- [x] Add byte-stability/corpus-isolation/negative signature/stale amendment/missing provider/no-gold tests.
- [x] Focused Vitest maxWorkers=1, dedicated evaluation tsc, peer review, exact owned commits. Root performs the full suite/build/PR integration.

## Acceptance record

Keep actual test commands/results, synthetic versus real-provider status, and unresolved independent human review explicit. No real institution source, paid OCR, human signature or host performance measurement is inferred from generated fixtures.

### Verified implementation, 2026-11-05

- Node 22.22.2; dedicated production evaluation tsc and evaluation test tsc: PASS.
- Five focused Vitest files with maxWorkers=1: **38 PASS**. This includes 200-case signature isolation, amendments and expired adjudication history, 20 actual PNG pixel boxes/hash bindings, 12 independently authored temporal answers, media-ledger correction consumption and no-gold/provider states.
- CLI end-to-end: **4 PASS**. Actual 200/32 export, existing legacy snapshot preservation, independent default NOT_RUN, unsigned refusal, canonical payload → ephemeral SYNTHETIC_TEST Ed25519 signature → detached assembly → separately pinned authority → append → exact replay, private-note stdout exclusion and local benchmark all executed.
- Offline editor in jsdom: **2 PASS**, covering blank decision/time preservation, unsigned draft download and same-package/case-bound draft resume. The component test uses two canonical case views; the CLI export test retains all 200/32 cases. An earlier 60-second local command timed out during loading; the final command completed (assertions approximately 225 ms and 76 ms). This is not Chrome or human accessibility acceptance.
- Generated and checked 20 PNG, 20 HTML, 19 immutable revision text assets for 12 temporal cases, manifest and exact-reference JSON Schema. PNGs are 640×360 / 230,864 bytes; first and last were visually inspected. All 20 boxes were independently scanned from decoded dark glyph pixels by the focused tests.
- Automated independent peer read: core canonical/package/authority/ledger/report files, then media reference consumption and CLI; no blocking issue reported. This is code review, not human gold, source/bbox approval or actual key custody verification.
- No existing 40/10/5 source exports, legacy snapshot, production ranker, application route, live provider, source permission or external system was changed.
- Real independent review remains **0/200 recommendation and 0/32 media/temporal**. Source acceptance, live providers, Chrome/device testing, D01/D02 and production deployment remain separately evidenced gates.
