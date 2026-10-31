# CLOVA 게이트

- **주 소유자: 이서연 (NCP·CLOVA/OCR/Vision·Laya provider·키·worker·과금 전체)**. 일반 웹/외부 Fastify API·인증·DTO/Zod는 심민성 `apps/api` 소유. 관련 [이슈 #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22).
- 구조화 출력, evidence/enum 검증, quota. 실제 토큰·비밀키·개인 원본 전송 금지.
- 다른 담당 경로는 교차 리뷰를 우선하며 NCP provider 및 모델 실행 구현은 이서연 담당 이슈를 따른다.

## 2026-10-31 신뢰형 RAG·Laya·OCR/Vision 제안 (아직 구현 전)

기존 네 제품 AI 작업은 유지한다. 오픈 가중치 **Laya multilingual 322M**은 High Memory-g3 4vCPU·32GB (+ 별도 CB 50GB) CPU에서 승인된 공개 공고의 문서분류/검수 우선순위만 판정하는 비동기 옵트인 서비스다. CLOVA **General OCR**은 이미지의 글자·좌표를 추출하고 **HCX-005 Vision**은 OCR이 애매한 포스터에만 추가 후보를 제공하며, **HCX-007**은 허용된 인용을 구조화한다. **Temporal RAG**는 권한·문서 revision·유효기간·`asOf` 검사를 통과한 근거만 검색한다. LLM output과 Laya confidence는 독립 검증 전 사실이 아니며 학생 raw/비승인 자료 전송 금지. 모델 다운로드·비용·실서비스 배포는 별도 승인 후. 상세: `Architecture.md` A06.9 및 `docs/TRUSTED_RAG_MEDIA_VERSIONING.md`.

## 2026-10-31 권고안 및 API 소유 분리

CLOVA Studio HCX·General OCR·Vision API, NCP 인증/SDK·로그/재시도/키/요금·Laya ONNX worker 실행은 **이서연** 단독 소유. 심민성의 웹·외부 REST/Fastify/OIDC·DB/RAG·provider-neutral packet validation은 `apps/api`에 남는다. 승인 모델 자체를 학생 자격 판정·안전성 검증 없이 직접 화면에 쓰지 않는다. 기준 Linux High Memory-g3 4vCPU/32GB, CB 50GB 별도; 11/16 본선 확인 및 승인 전 클라우드 유료 호출/VM/모델 다운로드 없음. [공식 근거·816h/576h 요금](../../docs/NCP_OPERATIONS_2026.md).
