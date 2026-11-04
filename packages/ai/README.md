# CLOVA protocol adapters

> 2026-11-04 모듈 경계: 이 패키지의 clova-wire.ts는 오프라인 프로토콜 계약이다. 하지만 앱의 별도 apps/api Provider HTTP/PG/권한·예산·취소 및 Laya supervisor 구현은 통합 [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216)을 통해 main에 존재한다. 이 패키지 설명의 'HTTP transport 없음'은 **이 패키지 자체**에 한정한다. 실제 NCP/CLOVA/HCX 계정·요금·자료전송 권한/실호출은 NOT_RUN, 기본 OFF/RELEASE_BLOCKED. [STATUS](../../STATUS.md).

`src/clova-wire.ts` implements **offline serialization/validation**, first part of #20. There is no HTTP transport, key lookup, provider registration, environment activation or model download. Existing API behavior is unchanged; `AI_ENABLED=false` remains the operating policy.

- `buildOcrRequest` / `parseOcrResponse`: V2 single PNG/JPEG, bytes/SHA check, opaque request-local context, response request/name/version binding, one page, bounded fields, finite convex in-bounds quadrilateral. Output preserves field text/order/lineBreak, pixel vertices and enclosing normalized box, source revision/asset/hash/transform. It is OCR **field** evidence, not reconstructed lines/table semantics. PDF/TIFF/conversions, checkbox/multibox, empty or malformed responses fail closed.
- `buildHcxRequest` / `parseHcxResponse`: existing SafeLlmPacket, HCX-007 fixed JSON schema or HCX-005 one raster image; no remote image URL, tools, caller schema or image in HCX-007. Enforces output token ceiling, usage consistency, task, exact source/paragraph quotes, allowed topic/object tokens. Outputs only NEEDS_REVIEW candidates. A matching quote does not establish its semantic interpretation or official truth.
- Raster dimensions/format must come from a **trusted decoder** before these functions. Bytes hash binding does not prove that caller-supplied dimensions or privacy/rights assertions are true. No image decoder, PDF transform or privacy classifier is provided here.
- Contexts are private WeakMap bindings, not authorization receipts. They do not cross process boundaries and do not validate a network response's actor or rights by themselves. HCX v3 JSON does not echo a request ID; the future transport must retain the response/context pair for each HTTP operation. Do not mix them in queues/caches.

Before any live activation, implement and review the server-side transport: current actor/grant/consent/source revision/asOf and original hash verification before reservation/transmission and after response; tokenizer and provider policy; global+actor atomic worst-case billing/idempotency; timeout UNKNOWN_BILLING; cancellation/retry/late result discard; endpoint/header/secret policy and bounded streaming response; #88 offline chaos. #143 isolated Laya worker and actual NCP operation remain separate. No raw provider payloads or image bytes belong in logs.

Synthetic response tests are not an OCR accuracy benchmark or the required independent 20-poster evaluation.

Official references checked 2026-11-03: [General OCR](https://api.ncloud-docs.com/docs/en/ai-application-service-ocr-ocr), [HCX-005 text/image](https://api.ncloud-docs.com/docs/en/clovastudio-chatcompletionsv3), [HCX-007 structured output](https://api.ncloud-docs.com/docs/en/clovastudio-chatcompletionsv3-so). These documents specify the provider wire shape; model/entitlement/cost and actual responses still require independent operational verification before use.

Reproduce: `npm test -- tests/api/clova-wire.test.ts tests/api/ai-task-results.test.ts --maxWorkers=2` and `npm run typecheck`. All inputs are synthetic; no live provider is used.

## Versioned results for the four product tasks

A server-reviewed packet with `schemaVersion: "ai-task-result-v1"` requests a strict
`result` in addition to the existing citation envelope. Legacy packet versions and
their stored citation-only results remain readable; a new result cannot be silently
accepted under a legacy or unknown task-result version.

| Task | Candidate result |
| --- | --- |
| `experience_skills` | Up to six allowed topic/skill/role suggestions with citation indexes |
| `opportunity_terms` | One to five allowed topics; separate eligibility, priority and completion conditions, date kinds and role steps |
| `personal_action_brief` | An evidence-backed headline and explanations in the exact supplied action order (at most three) |
| `graduation_explanation` | Explanations for supplied requirement tokens and references to their approved fact keys (at most three per packet) |

This first result version is extractive: every displayed phrase must occur verbatim
in each referenced quote. Ambiguous source/paragraph IDs, duplicate fact keys,
invented objects, changed action order and ungrounded phrases are rejected. Graduation
explanations reject Unicode numeric characters; actual numeric facts/tables remain
code-owned. This is not a semantic classifier for all spelled-out numbers, conditions
or quote-to-requirement associations. All accepted output remains `NEEDS_REVIEW`;
the user must still approve experience tags and an independent reviewer must verify
official conditions/evidence.

The API executor revalidates the result against a fresh authorized packet on cache
reads. The owner panel renders the four result shapes, keeps action order, and erases
them when its current session becomes invalid. The feature neither creates approved
inputs nor activates a provider. `tests/api/ai-task-results.test.ts` exercises the
wire, stored DTO, synthetic validator and authenticated API/executor with fake
transport; the owner-panel tests cover display, revocation and 100 input switches
without additional provider submissions. These are offline contract tests, not
real PostgreSQL/NCP or independent media-quality acceptance.

