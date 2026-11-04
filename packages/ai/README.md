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

Reproduce: `npx vitest run tests/api/clova-wire.test.ts --maxWorkers=1` and `npm run typecheck`. All inputs are synthetic; no network mocking is needed because the module performs no I/O.
