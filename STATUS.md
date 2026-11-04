# HUFS One AI | 현재 작업 상태

> **2026-11-04 KST · 최신 GitHub PR/이슈/HEAD/CI 점검.** 과거 CI 성공이나 작성자 코멘트는 현재 HEAD 승인/실서비스 검증의 대체 증거가 아닙니다.

## 한눈에 보기

| 구분 | 현재 확인된 상태 |
| --- | --- |
| 제품 | Private 저장소, 독립 HUFS One AI 팀 프로젝트. 한국외대 공식 HUFSAbility 개편/운영 서비스 아님 |
| GitHub | **열린 PR 23건 / 열린 일반 이슈 34건** (2026-11-04 조회 시점) |
| 합성 코드 | React/TypeScript/Zod/Fastify, 학업·추천/일정 코어, 일부 Owner API·PostgreSQL, 오프라인 Provider/비용/Laya 하위 구현을 main에 병합. 전체 실서비스 종단 완료 아님 |
| 신규 오류 수정 | 작성자 PR #175, #177, #178에 실제 CI 실패 원인 대응 커밋 제출. 수정 후 최신 HEAD CI SUCCESS는 아직 확인되지 않음 |
| 독립 코드 리뷰 | 협업자 #152, #189 최신 HEAD 코드 리뷰 APPROVED 등록. CI·실학칙·사용자 수락 조건은 별개 |
| 출시 | **RELEASE_BLOCKED**: 개인정보 #46, 독립 gold #61, 실제 Google/학교메일·TLS/NCP/운영 DB·권한 E2E #89 |

## 열린 PR · 병합 가능성별 분류

- **합성 CI 성공, 작성자 PR 독립 승인 미확인:** #176, #179, #180, #181, #182, #183, #184, #185. 기록된 두 워크플로는 SUCCESS이나 최신 HEAD 비작성자 APPROVED·선행 스택/고유 diff가 없으면 병합 금지.
- **승인·CI 성공이나 현재 main 충돌:** [#161 Laya child](https://github.com/ot4562-glitch/HUFS-One-AI/pull/161)은 비작성자 APPROVED와 CI SUCCESS를 확인했으나 mergeable=false. 작성자/타인 dirty 작업트리 손실 없는 고유 diff 통합·새 HEAD 재검증이 먼저.
- **비작성자 코드 리뷰 승인·CI 실패:** [#152 이중전공 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/152)는 malformed rowImpacts 부정 검증의 P2 수정 확인; [#189 교과목 동일성](https://github.com/ot4562-glitch/HUFS-One-AI/pull/189)은 승인된 동일성만 사용하는 순수 로직 확인. 그러나 둘 다 최신 Actions 실패, 공식 RulePack/원본/Owner 종단 인수 미완료.
- **실제 실패 테스트의 코드 수정 커밋 등록:** [#175 Provider UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/175) 마지막 커밋 ddc285d — JSON 필드 순서 비의존 테스트, 엄격한 REVIEWER fixture, 인라인 citation React 검사, 권한 철회 시 401/403을 503으로 위장하던 오류 범위 분리. [#177 동시성/재시작](https://github.com/ot4562-glitch/HUFS-One-AI/pull/177) e2dc952 — 별도 합성 프로세스 사이 OAuth 시도 digest 격리(운영 rate limit 완화 없음). [#178 학교메일 OTP](https://github.com/ot4562-glitch/HUFS-One-AI/pull/178) e9150be — 허용된 Google 세션이 REVIEWER 초대 없이도 CSRF와 사전 승인 학교메일 OTP를 처리하며, 실제 심사자료는 승인 없는 조회 계속 거부. **수정 후 테스트 PASS 미확인**.
- **CI 시작/실행 장애와 기타 실패:** #186/#187/#188/#189/#190은 TASK-00·Chrome 최신 워크플로가 모두 FAILURE; #190 실패 작업을 재실행해도 job steps/log가 비어 있어 정확한 원인 미확정. #169와 UI #151/#152/#154/#155에서도 최신 HEAD 실패. #155는 main 충돌. 실패한 CI를 과거 성공으로 덮지 않음.
- **Draft:** [#166](https://github.com/ot4562-glitch/HUFS-One-AI/pull/166) 비공개 ingress/배포 프리뷰 템플릿은 Draft. 운영 NCP/공개 서비스 배포 승인 아님.

**필수 병합 게이트:** [PR_WORKFLOW](docs/PR_WORKFLOW.md) — 최신 HEAD 독립 비작성자 GitHub APPROVED, 필수 CI 성공, 기존 CHANGES_REQUESTED 해소, 스택/base 충돌 없음, 보안·학생 자료 보호. 이 조건을 충족하지 않는 PR을 작성자 자가검토만으로 병합하거나 완료 처리하지 않음.

## 사용자·협업자 결정

- [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133): degreePath/track은 기존 curriculumVersion과 분리한 additive vNext, cohort·K-of-N·중복인정 및 근거가 미확정이면 NEEDS_REVIEW. #189 코드 검토 승인은 공식 학칙 승인이 아님.
- [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61): 합성 40공고×5프로필 200개 중 **독립 사람 gold 확인 0/200**. 작성자 자체 검수를 사람 독립 검수로 오인하지 않음.
- [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141)/[#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124): 기존 공개 5분류·24기능·비로그인 4영역은 보존; 로그인 계정에서 관찰한 별도 6영역은 UNVERIFIED 비활성 계약과 360px/키보드/스크린리더 검증 필요.
- [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#144](https://github.com/ot4562-glitch/HUFS-One-AI/issues/144), [#81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81), [#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82): 실제 승인된 revision 두 개 탐색·owner scope/권한/동의·학업 rules와 UI 계약을 연결하기 전 전체 수락 금지.

## 팀별 고정 수락 기준 (본일 코드 수정만으로 변경되지 않음)

| 주관 | 수락 증거 | 실제 남은 차단 |
| --- | --- | --- |
| 심민성 ot4562-glitch | **7/12 · 58.3%** | 실 인증·서비스 종단, #46 권리, PostgreSQL/NCP, 비용 |
| 이의상 uisang2004-maker | **9/12 · 75.0%** | UI 11영역·360px/키보드/접근성·현재 HEAD main 통합 |
| 김채윤 qamarrchae | **7/12 · 58.3%** | #61 독립 gold 0/200, 기관 출처 권리 |
| 박준영 taewangim-alt | **8/12 · 66.7%** | 공식 RulePack·중복 인정·동일 교과목·실수강 근거 |
| 이서연 lhh42001 | **NCP 비코드 운영 1/5 · 20.0%** | 비용·계정·VPC/ACG/TLS/quota·실호스트 수락 |

**책임 경계:** NCP 관련 모든 소프트웨어 코드(Provider/OCR/HCX/Laya/worker/Docker/CI)는 심민성이 담당. 이서연의 범위는 비코드 NCP 계정·원가·운영뿐이다. 실제 학생 자료 제공 대상과 코드 담당은 별개. [WORKSTREAMS](docs/WORKSTREAMS.md)의 열린 이슈 34건 주관/공동 담당 구조는 유지.

## 아직 완료할 수 없는 릴리스/인적 게이트

1. **#46:** 기존 Private Git 감사 178/180 PASS·2 FAIL 및 별도 WIP privacy 146/148 PASS·2 FAIL(서로 다른 분모), 보호 수강 CSV/Forms 6경로 최초 게시·공유·현재 동의/철회/기관 권리 미확정. 원문·비밀 외부 반출/CI·PR 첨부 및 이력 force rewrite 금지.
2. **#61:** 200 합성 예시의 독립 사람 gold 수락 0/200. 코드·자동 시험 ≠ 사람 승인.
3. **#89:** 실제 Google OIDC·외대 이메일 소유 증명·철회, TLS/직접 IP/preview/CDN 차단, NCP 네트워크/운영 영속 DB, 운영 요금/서버·원본 권리 및 실제 단말 수락 NOT_RUN. 사용자 명시적 과금/배포 승인 전 수행 금지.
4. **기능 종단:** 승인된 현재 source/permission/asOf/RulePack, owner session↔API↔PG↔UI, 401/403/409/503·권한 철회/다중탭/기기 접근성을 현재 HEAD에서 증명해야 함.

**목표:** 실제 사용 가능한 서비스 완성·수락 검증 → 별도 승인 후 NCP 배포 → 지속 운영/유지보수. 기존 main 병합 #156/#157/#158/#159/#160/#162/#163/#164/#168은 승인된 합성 하위 코드 수락이지 운영 출시 승인 아님. 현재 판단의 정본은 [열린 PR](https://github.com/ot4562-glitch/HUFS-One-AI/pulls), [이슈](https://github.com/ot4562-glitch/HUFS-One-AI/issues), [TEAM_PROGRESS](docs/TEAM_PROGRESS.md), [NCP 운영](docs/NCP_OPERATIONS_2026.md)이다.
