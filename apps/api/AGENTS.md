# API·DB·AI 기능 개발 규칙

**신규 추가 기능 인계:** 기능 이슈 최초 assignee는 **심민성 `ot4562-glitch`**이며 Core·Contracts·API·DB·보안 구조를 설계한다. 구조와 기본 코어 인수가 가능해지면 **박준영 `taewangim-alt` 또는 이의상 `uisang2004-maker`을 실제 기능 구현 주담당**으로 배정한다. 심민성은 계약·DB/RLS·보안과 전체 개발 과정을 계속 검수한다. [루트 AGENTS](../../AGENTS.md) · [팀 역할](../../docs/WORKSTREAMS.md).

이의상·박준영은 HCX-007·CLOVA OCR·규칙/비LLM 처리를 모두 사용할 수 있으며 모델/코드 결과를 **양방향 교차검증**한다. 박준영은 AI 제품 기술 QA·정량 정확도·결함 재시험, 김채윤은 원장/독립 Gold·전 과정 가벼운 사용자 시연, 이서연은 실제 웹 UI·API 소비/디자인을 담당한다. 기능별 구체 코어 작성자·리뷰어는 해당 기능 이슈의 최신 인계 댓글로 정한다.

운영의 기본 프로젝트 승인은 `OWNER_CONFIRMED_APPROVED`([승인](../../docs/AUTHORIZATION.md))이다. 실제 서비스는 명시적 production 구성과 현재 actor/세션·역할·SourceRevision·동의/권리·DB 최소권한으로 동작한다. 익명/타인 사칭·CSRF·삭제/철회·비밀 노출·데이터 품질 오류를 안전하게 처리한다.

공통 계약/DB 변경은 실제 소비자 리뷰와 정확한 HEAD 테스트로 검증한다. 승인된 실데이터와 합성 fixture, 합성 CI와 독립 사람/운영 인수를 구분하며 미실시 결과는 `NOT_RUN`으로 기록한다.

[운영 API](../../docs/PRODUCTION_RUNTIME.md) · [경험 API](../../docs/EXPERIENCE_API.md).