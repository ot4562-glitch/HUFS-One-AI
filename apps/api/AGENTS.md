# API·DB·AI 개발 규칙

심민성 `ot4562-glitch` 소유: Fastify/OIDC·학교메일·PG/RLS·Source/RAG·AI 예산/worker·CI/운영 조립. 프로젝트 문서상의 자료·정보/기관·외부 전송·운영 승인은 **OWNER_CONFIRMED_APPROVED**이며 동일 승인 대기를 다시 만들지 않습니다. [승인 정본](../../docs/AUTHORIZATION.md).

실제 서비스는 명시적 production 구성과 현재 actor/세션·역할·source/version·DB 최소권한으로 동작합니다. 익명 요청/다른 사용자 사칭·CSRF·삭제/철회·비밀 노출 방지는 유지합니다. 잘못된 데이터나 없는 자격증명은 승인 문제로 오분류하지 않고 오류/CONFIGURATION_REQUIRED를 반환합니다.

UI·추천·학업 순수 코어 소유는 각 협업자에게 유지합니다. 공통 계약/DB 변경은 소비자 리뷰·정확한 HEAD 테스트로 확인합니다. 승인된 실제 데이터 사용과 테스트용 합성 fixture를 구별하고, 실제 시험하지 않은 결과는 NOT_RUN입니다.

[운영 진입점](../../docs/PRODUCTION_RUNTIME.md) · [경험 API](../../docs/EXPERIENCE_API.md) · #253/#257.