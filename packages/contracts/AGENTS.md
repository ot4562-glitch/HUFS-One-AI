# 공통 Contracts·Zod·타입 변경 규칙

**최초 구조 책임:** 심민성 `ot4562-glitch`([#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359))이 신규 `[추가 기능]`의 기본 DTO·Core/API/DB/권한 계약과 재사용 경계를 설계한다. 구조/계약을 인수할 수 있게 되면 박준영 `taewangim-alt` 또는 이의상 `uisang2004-maker` 중 **해당 기능 주작성자**가 후속 실제 구현을 맡고 상대방은 교차 검토한다. 이서연은 React UI 소비자, 김채윤은 실자료·Gold·디자인 콘텐츠 공급자, 박준영은 AI 기술 QA, 심민성은 전 과정 코드·계약 검수자이다. [루트 AGENTS](../../AGENTS.md) · [팀 업무](../../docs/WORKSTREAMS.md).

`src/`는 타입 정본이며 `npm run build:contracts`의 `dist/` ESM/타입 선언은 생성물이다. TopicCode 24종, Forms/CSV 헤더, actor/세션·동의·SourceRevision·AI/학업·오류/버전 계약은 실제 Fastify/React/Core/PG 소비자와 맞춰 검증한다.

변경 시 `npm run test:contracts`, `npm run test:consumers`, `npm run audit:api-contracts`, 현재 HEAD CI/권한/철회 부정 테스트를 확인한다. 공통 계약·lockfile·원문 fixture 변경은 주작성자·소비자·총괄의 리뷰와 함께 진행하며 원본 CSV 보존 규칙을 준수한다.

[공통 사용법](README.md) · [Architecture](../../Architecture.md).