# HUFS One AI | 확정 5인 분업과 에이전트 작업 경계

기준: **2026-10-30 사용자가 직접 알려준 팀 구성**. 이서연은 **팀 결성·기획을 이끈 리드**, 심민성은 **기술 총괄·GitHub 저장소 소유자·공통 계약과 최종 통합 담당자**다. 사람의 구독 현황은 보고 당시 기준이며, GPT·Claude·Gemini 개발도구와 **제품이 사용하는 CLOVA**를 혼동하지 않는다.

| 담당자 | 확정 기술 책임 | 보고된 AI 구독 | 소유 경로 | TASK |
| --- | --- | --- | --- | --- |
| **심민성** | 기술 총괄, TASK-00, 4개 트랙 지원·충돌 중재·QA·최종 PR 병합 | GPT | `packages/contracts`, `packages/fixtures`, `tests`, `.github`, `docs`, 루트 설정 | 00·09·12·16 및 트랙 사이 지원 |
| **이의상** | UI·모바일·UX·접근성 | Claude, Gemini | `apps/web`, `packages/ui`, `assets/synthetic` | 04 및 05·09·15의 화면 |
| **김채윤** | 개인화 추천·중요공지 | GPT, Claude, Gemini | `packages/core/src/normalization`, `opportunities`, `notices` | 06·14 |
| **박준영** | 졸업요건·학점·수강계획·미래 개설 전망 | GPT, Claude | `packages/core/src/academics`, `forecast` | 01·02·03·17 |
| **이서연** | 팀 결성·기획 리드 + API·CLOVA·NCP 기술 책임 | **Gemini (2026-10-30 사용자 확인)** | `apps/api`, `packages/ai`, `packages/core/src/privacy`, `infra` | 07·08·11 및 05·10·15의 서버 |

**GitHub ID 확인 필요:** 현재 저장소 소유자 `ot4562-glitch` 외 팀원별 GitHub 계정의 실명 대응은 검증되지 않았다. PR 닉네임만으로 사람을 연결하거나 자동 리뷰어/권한을 지정하지 않는다. **이서연의 Gemini 사용은 사용자가 확인했으며**, 다른 AI 구독·결제 상태는 추정하지 않는다.

- **공개 웹 도메인/Google 인증 P0 협업:** 이서연(API·NCP, Gemini 사용)은 독립 Google OAuth OIDC·외대 메일 OTP 발송/검증·세션·ingress/스토리지 경계를 담당한다. 이의상(UI)은 Google 로그인·학교 메일 코드·403·재인증 UX와 민감 캐시 차단을 담당한다. 심민성은 공용 auth contract, `외대.온라인.한국` origin, `hd`/메일 OTP 우회 부정시험, CI/PR 통합 게이트를 맡는다. **공식 학교 SSO 허가는 전제하지 않으며** Google OAuth 클라이언트·메일 발송 서비스·NCP 비용·학생자료 공유는 별도 승인한다. 인증 전 앱 번들/API·directIP·preview 접근을 허용하는 PR은 병합 금지(Architecture A14.1a).

## 충돌 방지와 교차 검토

- **UI ↔ API:** 이의상은 `DemoContext`·`DemoSnapshot`을 합성 mock으로 사용하고, 이서연은 실제 권한/403/409/503 응답을 구현한다. 화면의 임의 타입·보안 판정·가짜 실제 데이터를 API에 강요하지 않는다.
- **추천 ↔ API:** 김채윤은 순수 정규화·매칭·점수·공지 코어, 이서연은 인증·DB·안전한 CLOVA 작업/비용·요청 경계를 담당한다. `TopicCode` 등 공통 타입 변경은 심민성에게 계약 변경을 먼저 제안한다.
- **학업 ↔ API/UI:** 박준영은 공식 RulePack·세 원장·전망 및 합성 시험을 구현한다. 이서연은 권한·저장·API를, 이의상은 **공유 승인된 요약**만 표시한다. `RulePackDraft`를 공식 졸업 확정으로 다루지 않는다.
- **최종 중재:** 심민성은 4개 트랙 산출물의 계약·데이터·UX/API 충돌을 해결하고, CI·독립 리뷰·실제 실패와 미실행 항목을 확인한 후에만 최종 병합한다. 일방적인 main 직접 push나 자동 병합은 금지한다.
- **검토 매트릭스:** UI는 API+통합, 추천은 API+통합, 학업은 API+통합, API는 UI/추천 중 한 트랙+통합의 교차 검토를 받는다. 모델/사람의 검증은 실제 수행한 경우만 기록한다.

## 5명 개발팀 ≠ 5명 실학생 입력

- **학생 과목 CSV 4명 + Google Forms 통합 CSV 4명:** 김채윤·이의상·이서연·심민성. **박준영은 CSV/Forms 제출 대상이 아니다.**
- **사용자가 직접 확인:** `이수과목_까마르.csv`는 김채윤의 제출 파일이다. 현재 과목 CSV **3/4명(김채윤·이의상·심민성)의 파일 소유자가 확인**됐으며, 이서연 파일은 미확인이고 Forms 응답도 아직 미제출이다. 별명 대응을 private 입력 단계에서만 사용하고, 제출은 팀 공유/공식 졸업판정/AI 전송 동의와 구분한다.
- 5개 `S01`~`S05` 시연 슬롯을 유지하더라도 실제 자료 대상은 최대4명이다. 한 슬롯은 `PENDING` 또는 명시적 `SYNTHETIC`으로만 표현한다. 사람별 원본과 공유 projection은 별도의 동의를 요구한다.

## 독립 개발 시작 순서

1. **TASK-00부터:** [공통 계약 게이트](CONTRACT_BOUNDARIES.md) 및 [실행 가능한 계약 사용법](../packages/contracts/README.md)을 사용한다. TypeScript/Zod 계약·synthetic fixture·자동 4트랙 소비 검증 코드를 별도 브랜치에서 구현했으며, **PR 병합/CI 결과/실제 팀원 승인 여부는 별도로 확인**한다.
2. 4개 트랙이 자신의 API/타입 소비·실패 상태를 승인한 뒤 TASK-00을 병합하고, **그 커밋을 각 브랜치/worktree의 기준점으로 사용**한다.
3. 각 트랙은 해당 소유 경로만 변경한다. 독립 에이전트라도 공유 타입/DB migration/root lockfile을 임의 수정할 수 없다. 실제 원장·키·CLOVA/NCP 유료호출은 별도 승인 전 사용 금지.
4. 매 PR에서 `ownedPaths`, `input/outputContract`, 합성 fixture, `testsRun/testsFailed/notTested`, `privacyImpact`, rollback과 쉬운 설명을 제출한다.

상세 권한·입력 검증: [DATA_GOVERNANCE.md](DATA_GOVERNANCE.md) · [계약 경계](CONTRACT_BOUNDARIES.md) · [PR 방식](PR_WORKFLOW.md).
