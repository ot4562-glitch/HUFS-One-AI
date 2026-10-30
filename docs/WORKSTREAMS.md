# HUFS One AI | 확정 5인 분업과 에이전트 작업 경계

기준: **2026-10-30 사용자가 직접 알려준 팀 구성**. 이서연은 **팀 결성·기획을 이끈 리드**, 심민성은 **기술 총괄·GitHub 저장소 소유자·공통 계약과 최종 통합 담당자**다. 사람의 구독 현황은 보고 당시 기준이며, GPT·Claude·Gemini 개발도구와 **제품이 사용하는 CLOVA**를 혼동하지 않는다.

| 담당자 | 확정 기술 책임 | 보고된 AI 구독 | 소유 경로 | TASK |
| --- | --- | --- | --- | --- |
| **심민성** | 기술 총괄, TASK-00, 4개 트랙 지원·충돌 중재·QA·최종 PR 병합 | GPT | `packages/contracts`, `packages/fixtures`, `tests`, `.github`, `docs`, 루트 설정 | 00·09·12·16 및 트랙 사이 지원 |
| **이의상** | UI·모바일·UX·접근성 | Claude, Gemini | `apps/web`, `packages/ui`, `assets/synthetic` | 04 및 05·09·15의 화면 |
| **김채윤** | 개인화 추천·중요공지 | GPT, Claude, Gemini | `packages/core/src/normalization`, `opportunities`, `notices` | 06·14 |
| **박준영** | 졸업요건·학점·수강계획·미래 개설 전망 | GPT, Claude | `packages/core/src/academics`, `forecast` | 01·02·03·17 |
| **이서연** | 팀 결성·기획 리드 + API·CLOVA·NCP 기술 책임 | **확인되지 않음** | `apps/api`, `packages/ai`, `packages/core/src/privacy`, `infra` | 07·08·11 및 05·10·15의 서버 |

**GitHub ID 확인 필요:** 현재 저장소 소유자 `ot4562-glitch` 외 팀원별 GitHub 계정의 실명 대응은 검증되지 않았다. 과거 PR 작성자 닉네임만으로 사람을 연결하거나 자동 리뷰어/권한을 지정하지 않는다. 이서연의 구독 '미확인'을 '없음'으로 바꾸지 않는다.

## 충돌 방지와 교차 검토

- **UI ↔ API:** 이의상은 `DemoContext`·`DemoSnapshot`을 합성 mock으로 사용하고, 이서연은 실제 권한/403/409/503 응답을 구현한다. 화면의 임의 타입·보안 판정·가짜 실제 데이터를 API에 강요하지 않는다.
- **추천 ↔ API:** 김채윤은 순수 정규화·매칭·점수·공지 코어, 이서연은 인증·DB·안전한 CLOVA 작업/비용·요청 경계를 담당한다. `TopicCode` 등 공통 타입 변경은 심민성에게 계약 변경을 먼저 제안한다.
- **학업 ↔ API/UI:** 박준영은 공식 RulePack·세 원장·전망 및 합성 시험을 구현한다. 이서연은 권한·저장·API를, 이의상은 **공유 승인된 요약**만 표시한다. `RulePackDraft`를 공식 졸업 확정으로 다루지 않는다.
- **최종 중재:** 심민성은 4개 트랙 산출물의 계약·데이터·UX/API 충돌을 해결하고, CI·독립 리뷰·실제 실패와 미실행 항목을 확인한 후에만 최종 병합한다. 일방적인 main 직접 push나 자동 병합은 금지한다.
- **검토 매트릭스:** UI는 API+통합, 추천은 API+통합, 학업은 API+통합, API는 UI/추천 중 한 트랙+통합의 교차 검토를 받는다. 모델/사람의 검증은 실제 수행한 경우만 기록한다.

## 5명 개발팀 ≠ 5명 실학생 입력

- **학생 과목 CSV 4명 + Google Forms 통합 CSV 4명:** 김채윤·이의상·이서연·심민성. **박준영은 CSV/Forms 제출 대상이 아니다.**
- 현재 Private 저장소 `csv/`의 세 파일 중 이름이 명단에 일치하는 것은 심민성·이의상 두 파일이다. **`까마르` 파일은 동일인/alias·접근권한 확인 전 4명 중 누구에게도 자동 연결하지 않는다.** 김채윤·이서연의 CSV 제출은 미확인; 이서연의 Forms 미제출은 사용자 확인 사실이다.
- 5개 `S01`~`S05` 시연 슬롯을 유지하더라도 실제 자료 대상은 최대4명이다. 한 슬롯은 `PENDING` 또는 명시적 `SYNTHETIC`으로만 표현한다. 사람별 원본과 공유 projection은 별도의 동의를 요구한다.

## 독립 개발 시작 순서

1. **TASK-00부터:** [공통 계약 게이트](CONTRACT_BOUNDARIES.md) 및 `Architecture.md` A02~A04·A06·A08~A09·A13의 타입·오류·버전·합성 fixture를 기술 총괄이 별도 PR로 작성한다. 현재는 계약 잠금 후보이며 타입 구현·CI 완료가 아니다.
2. 4개 트랙이 자신의 API/타입 소비·실패 상태를 승인한 뒤 TASK-00을 병합하고, **그 커밋을 각 브랜치/worktree의 기준점으로 사용**한다.
3. 각 트랙은 해당 소유 경로만 변경한다. 독립 에이전트라도 공유 타입/DB migration/root lockfile을 임의 수정할 수 없다. 실제 원장·키·CLOVA/NCP 유료호출은 별도 승인 전 사용 금지.
4. 매 PR에서 `ownedPaths`, `input/outputContract`, 합성 fixture, `testsRun/testsFailed/notTested`, `privacyImpact`, rollback과 쉬운 설명을 제출한다.

상세 권한·입력 검증: [DATA_GOVERNANCE.md](DATA_GOVERNANCE.md) · [계약 경계](CONTRACT_BOUNDARIES.md) · [PR 방식](PR_WORKFLOW.md).
