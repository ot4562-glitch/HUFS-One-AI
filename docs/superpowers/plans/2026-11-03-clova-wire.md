# CLOVA wire validation implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; final independent review uses superpowers:requesting-code-review.

**Goal:** Implement the typed, offline request/response portion of #20 without enabling provider calls.

**Architecture:** Pure server-side serializers and parsers in `packages/ai/src/`. Request-local OCR contexts bind responses to image bytes/hash, dimensions and request ID. HCX accepts existing SafeLlmPacket and validates exact citations, task, allowed topics and object tokens. Candidate state remains NEEDS_REVIEW.

**Tech Stack:** Existing TypeScript, Zod, node:crypto, Vitest; no dependency or public contract changes.

**Spec:** Architecture A06, #20/#88, packages/ai/AGENTS.md. Official API references are linked in packages/ai/README.md. Existing user instruction authorizes implementation through PRs; no further design questions required.

## Global constraints

- No network, secrets, model downloads, real student/source data, production registration or paid requests.
- No fabricated VERIFIED, official eligibility, graduation or deadline claims.
- Default provider remains OFF. This task does not implement atomic billing, worker scheduling, grant revalidation or a live transport; those are required before activation.
- PNG/JPEG single-page OCR first. PDF/TIFF and transformed/cropped/rotated pages require a reviewed transform adapter and are rejected here.
- Tests under tests/api are already included by Vitest. Imported package source is typechecked through the test import.

## Review focus

- A correct-shaped response from the wrong request/image must be refused.
- Invalid/nonfinite/outside/degenerate geometry must not be clamped into plausible evidence.
- Missing OCR fields must not disappear silently; entire response fails closed.
- HCX malformed/truncated/tool responses or unsupported evidence must be refused.
- No provider confidence value grants authority or changes source truth.

## Task 1: request-local OCR and HCX adapters

**Files:** create `packages/ai/src/clova-wire.ts`, `tests/api/clova-wire.test.ts`, `packages/ai/README.md`.

- [x] Write request/response regression cases and run them RED before production code.
- [x] Implement OCR V2 request serialization and response binding; normalized quadrilateral envelope retains the actual vertices and source provenance.
- [x] Implement HCX-007 text and HCX-005 image request serializers, strict candidate parser with quote/topic/object checks and usage accounting. Do not send arbitrary schemas/tools or claim Vision structured outputs support.
- [x] Run focused tests, typecheck and API build; inspect diff and privacy boundary.
- [ ] Request fresh independent agent review, correct actionable findings, publish a code PR and request actual nonauthor review. Never self-approve.
- [ ] Reconcile current GitHub PR status in README/STATUS and post exact implementation/remaining scope to #20. Keep #20/#88/#143 open.

## Execution ledger

Base main `605144c`: #138/#139/#140/#142 already merged; only #131/#134 open at initial refresh. main Actions 41552895276/41552895286 SUCCESS. No assumptions from older PR state are carried into this task.

Independent review reproduced blank quote and impossible usage. Four new regression cases failed before the nonblank/positive-usage/128000 total-cap fixes; focused suite then passed 59/59. Typecheck and API build succeeded. Privacy gate remains 146/148 PASS, 2 existing failures on 6 protected tracked files. Reviewer recheck found no remaining actionable issue in this protocol-only scope. Actual nonauthor GitHub approval is still separate.

PR #145 initial CI 41554809100 failed TS2307 because the new package source was absent from sparse checkout. Add only `/packages/ai/src/` to both backend jobs and the reviewed path allowlist. New workflow regression failed before the fix; production source and privacy exclusions unchanged. This required CI integration belongs to this task.
