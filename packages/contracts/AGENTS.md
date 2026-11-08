# 공통 Contracts·Zod·타입 변경 규칙

> **최신 역할/이슈 처리 지침(2026-11-08 · 우선 적용):** 고정 `[본선 진출 이후]`/`[본선진출이후]` #355–#359는 **읽기 전용**으로 제목·본문·댓글·담당·상태 등 어떤 쓰기도 수행하지 않는다. 새 요청은 기능·데이터 이슈를 별도로 생성한다. `[추가 기능]` 최초 배정은 **심민성**, 심민성이 일반 Core/API/DB/계약/통합·테스트를 가능한 데까지 구현한다. **규칙/코드 기반 AI(추천/랭킹/예측/분류 등)·OCR·HCX-007/RAG/LLM과 겹치는 작업은 박준영 또는 이의상에게 개발 인계**하고 양방향 교차검증한다. 자료·포스터·Gold 필요 시 **독립 `[데이터 요청]` 이슈를 김채윤에게 배정**하고 추가기능에도 **김채윤 공동 assignee**를 지정한다. 기존 13개 기능 자료 요청은 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360). 박준영 AI 제품 기술 QA, 김채윤 데이터 직접 입력/가벼운 사용자 시연, 이서연 웹 디자인·실제 기능 배치, 심민성 전 과정 검수를 적용한다. 상세: [이슈 배정 플레이북](../../docs/ISSUE_ASSIGNMENT_PLAYBOOK.md).


**최초 구조 책임:** 심민성 `ot4562-glitch`([#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359))이 신규 `[추가 기능]`의 기본 DTO·Core/API/DB/권한 계약과 재사용 경계를 설계한다. 구조/계약을 인수할 수 있게 되면 박준영 `taewangim-alt` 또는 이의상 `uisang2004-maker` 중 **해당 기능 주작성자**가 후속 실제 구현을 맡고 상대방은 교차 검토한다. 이서연은 React UI 소비자, 김채윤은 실자료·Gold·디자인 콘텐츠 공급자, 박준영은 AI 기술 QA, 심민성은 전 과정 코드·계약 검수자이다. [루트 AGENTS](../../AGENTS.md) · [팀 업무](../../docs/WORKSTREAMS.md).

`src/`는 타입 정본이며 `npm run build:contracts`의 `dist/` ESM/타입 선언은 생성물이다. TopicCode 24종, Forms/CSV 헤더, actor/세션·동의·SourceRevision·AI/학업·오류/버전 계약은 실제 Fastify/React/Core/PG 소비자와 맞춰 검증한다.

변경 시 `npm run test:contracts`, `npm run test:consumers`, `npm run audit:api-contracts`, 현재 HEAD CI/권한/철회 부정 테스트를 확인한다. 공통 계약·lockfile·원문 fixture 변경은 주작성자·소비자·총괄의 리뷰와 함께 진행하며 원본 CSV 보존 규칙을 준수한다.

[공통 사용법](README.md) · [Architecture](../../Architecture.md).