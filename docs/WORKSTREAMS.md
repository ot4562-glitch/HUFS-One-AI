# 다섯 명 협업: 에이전트 작업 범위 고정

**정본** Architecture.md A01·A13·A16~A18. 아래 팀원 이름은 아직 배정되지 않았으며 실제 Claude/GPT 구독 및 역할은 본선 진출 후 확인한다.

| 담당 | 에이전트 가중치 | 편집 소유 경로 | TASK |
| --- | --- | --- | --- |
| 팀장·통합 **ot4562-glitch** | GPT+Claude 교차 검증 | packages/contracts, packages/fixtures, tests, .github, docs, 루트 설계/설정 | TASK-00,09,12,16 |
| UI·모바일 | Claude 우선 | apps/web, packages/ui, assets/synthetic | TASK-04 및 05/09/15의 화면 |
| 개인화 추천·공지 | GPT 우선 | packages/core/src/normalization, opportunities, notices | TASK-06,14 |
| 졸업·미래 개설 전망 | GPT 우선(Claude 사용 가능) | packages/core/src/academics, forecast | TASK-01,02,03,17 |
| API·CLOVA·NCP | GPT 우선 | apps/api, packages/ai, packages/core/src/privacy, infra | TASK-07,08,11 및 05/10/15의 서버 |

모델은 강점에 따른 **우선 배정**이지 절대적인 능력 판정이 아니다. 각 담당은 타 팀 소스를 읽고 리뷰할 수 있지만 동시에 수정하지 않는다.

**학업 자료 후보 경계:** [Course Compass 팀원 보고](../sandbox/taewangim-alt/academics-readiness.md)는 선행 연구 기록이지 이식 승인·공식 학사 검증이 아니다. 학업 트랙은 소유권·학교 자료 사용조건을 확인하고, 누락 예외/재수강·세 원장, 과거 강의 목록 완전성·정보누출 없는 전망 검증을 맡는다. Claude 사용은 허용하되 팀원 배정·구현 시작은 별도 합의 후다. 제품 AI 4작업과 유료 NCP 정책은 변경하지 않는다.

## 충돌을 막는 개발 순서
1. **통합 담당자 선작업:** 24 TopicCode, Forms 26열, 과목 CSV 6열, Actor/DemoContext, FeedResult, AI Provider, RulePack, API 오류·버전의 계약을 먼저 고정. 계약 변경은 통합 담당자 소유의 별도 PR.
2. **병렬 트랙:** UI는 계약을 mock으로 사용, 추천·학업은 순수 코어/합성 fixture, 백엔드는 API·권한을 맡는다. 브랜치·worktree·테스트 DB·포트 분리.
3. **교차검토:** contracts, lockfile, DB migration, 공유 타입, TopicCode, 루트 설정은 팀장이 검토하고 소비자 트랙의 동의를 받은 후 변경. 소비자는 먼저 계약 PR 병합을 기다림.
4. **통합:** 기능 PR은 정해진 경로만 수정하고 자동검사·독립검토 결과를 남긴다. 팀장만 main 병합.

모든 PR에는 TASK 번호, 담당자/에이전트, 변경 가능 경로, 의존 입력/출력, 수행한 검사, 미완료가 있어야 한다. [공통 계약](CONTRACT_BOUNDARIES.md) · [데이터 정책](DATA_GOVERNANCE.md) · [작업 절차](PR_WORKFLOW.md).
