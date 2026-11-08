# 독립 검증과 정직한 결과

> **새 이슈 제목 접두어 (모든 에이전트 필수, 2026-11-08):** 이슈/결함을 작성하기 **전** [루트 AGENTS](../AGENTS.md)·[최초 방문 이슈 배정 플레이북](../docs/ISSUE_ASSIGNMENT_PLAYBOOK.md)을 읽고 제목 첫머리에 `[추가 기능]`, `[데이터 요청]`, `[웹 구현]`, `[AI 구현]`, `[AI QA]`, `[기술 통합]`, `[분류 검토]` 중 정확한 것을 사용한다. `[TASK-xx]`·`[코드 전수조사]`는 **뒤에** 둔다. 자동 라벨·배정은 PR #382가 `main`에 병합된 뒤부터 적용된다. 팀 고정 역할 이슈 #355–#359는 어떠한 쓰기도 금지한다. [봇 규칙](../docs/ISSUE_ROUTING_BOT.md).


> **최신 에이전트 공통 규칙(2026-11-08):** `[본선 진출 이후]`/`[본선진출이후]` 고정 역할 #355–#359는 **절대 쓰기 금지**(본문·댓글·담당·상태 포함). 새 `[추가 기능]`은 **심민성 먼저 배정·가능한 일반 Core/API/DB/통합 코드 직접 구현** 후 **규칙/코드 기반 추천·랭킹/예측 등 AI와 OCR/HCX-007/NLP/RAG 부분은 박준영 또는 이의상에게 반드시 구현 인계**한다. 자료/포스터·공식 문서/Gold가 필요한 경우 **별도의 `[데이터 요청]` 이슈를 김채윤 담당으로 생성하고 원 기능에도 김채윤을 공동 assignee로 추가**한다. 현재 13개 기능의 공통 자료는 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360). 박준영 AI 제품 기술 QA, 이의상·박준영 양방향 교차검증, 김채윤 실제 데이터 입력/가벼운 시연, 이서연 웹 UI/디자인, 심민성 전 과정 검수를 수행한다. [상세 의사결정 절차](../docs/ISSUE_ASSIGNMENT_PLAYBOOK.md).


**현행 QA 협업:** 박준영 `taewangim-alt`([#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356))은 **AI 제품 기술 QA·독립 Gold 정량 평가·결함 재현/재시험**을 주도하고, 이의상 `uisang2004-maker`([#355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355))과 AI 코드/모델 결과를 양방향 교차검증한다. 김채윤 `qamarrchae`([#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358))은 실데이터·Gold와 전체 사용자 동선의 가벼운 시연·간단 이슈 제보를 제공한다. 이서연은 웹 UI 구현/접근성 코드를 작성하고 심민성은 테스트 계약·보안·전 과정 코드/릴리스 검수를 수행한다. 새 `[추가 기능]`은 심민성이 최초 구조/기본 테스트를 설계한 뒤 박준영 또는 이의상에게 구현을 인계한다. [루트 AGENTS](../AGENTS.md).

테스트는 **합성/일회용 PostgreSQL/Chrome/NCP offline mock**과 별도 실제 사람/실학교/운영 환경을 구분한다. Zod/공통 API 소비자 4트랙·SourceRevision/AI·학점/공지·actor/SharingGrant·20개 전환·동시성/철회·401/403/409/429/503/비밀·배포 산출물 부정시험을 재현한다.

`npm run check`, `npm run check:privacy`, `npm run audit:api-contracts`와 실제 HEAD Actions 명시. 실패·SKIP·NOT_RUN을 숨기지 않고, 테스트가 PASS해도 인적 Gold/공식 RulePack·실 NCP/PG/Google/학교메일/스린리더 승인으로 승격 금지. 개인 CSV/실원문/키·실명↔SID는 어떤 fixture/CI에도 포함하지 않는다.
