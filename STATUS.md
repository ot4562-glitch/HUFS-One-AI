# HUFS One AI | 현재 작업 상태

> **2026-11-04 KST · 최신 GitHub PR/이슈/HEAD/CI 점검.** 과거 CI 성공이나 작성자 코멘트는 현재 HEAD 승인/실서비스 검증의 대체 증거가 아닙니다.

## 한눈에 보기

| 구분 | 현재 확인된 상태 |
| --- | --- |
| 제품 | Private 저장소, 독립 HUFS One AI 팀 프로젝트. 한국외대 공식 HUFSAbility 개편/운영 서비스 아님 |
| GitHub | **열린 PR 34건 / 열린 일반 이슈 40건** (2026-11-04 조회 시점) |
| 합성 코드 | React/TypeScript/Zod/Fastify, 학업·추천/일정 코어, 일부 Owner API·PostgreSQL, 오프라인 Provider/비용/Laya 하위 구현을 main에 병합. 전체 실서비스 종단 완료 아님 |
| 본인 신규/정상화 | #169/#179 조건 충족 병합, #204/#206/#207/#208/#209 독립 PR 제출·현재 CI 성공. #186/#188/#190 새 HEAD 재리뷰, NCP 후속 코드 계속 구현 |
| 독립 코드 리뷰 | 현재 HEAD 비작성자 GitHub 승인과 동일 HEAD CI가 병합 게이트. 별도 에이전트 검토는 이 승인을 대체하지 않음 |
| 출시 | **RELEASE_BLOCKED**: 개인정보 #46, 독립 gold #61, 실제 Google/학교메일·TLS/NCP/운영 DB·권한 E2E #89 |

## 열린 PR · 병합 가능성별 분류

- **이번에 조건 확인 후 main 병합한 본인 PR:** [#169 Provider PostgreSQL 조립](https://github.com/minseong-hufs/HUFS-One-AI/pull/169) HEAD `c9780873`의 비작성자 승인·필수 CI·선행 스택·리뷰 스레드를 확인해 merge `045f2478`; [#179 Laya 경로 파싱](https://github.com/minseong-hufs/HUFS-One-AI/pull/179) HEAD `edc1ca98`의 비작성자 승인·필수 CI·충돌 없음을 확인해 merge `ef289537`. 각각 승인된 합성 하위 코드이며 실제 외부 Provider/ONNX/NCP 운영 수락 아님.
- **기존 PR 정상화:** #161 Laya child `5f67969d`, Draft #166 private ingress `d2c29e3e`의 CI 충돌을 보존 병합으로 해소했다. #175 `18dd8be3`·#177 `5e3355e0`은 병합된 #169 뒤 main으로 retarget·동기화했고, #197 deploy recovery `693ad9fa`도 고유 2파일을 보존했다. 이 HEAD들의 두 워크플로는 SUCCESS이며 **새 HEAD의 비작성자 승인 전 병합하지 않는다**. #166 Draft/운영 차단 유지.
- **승인 뒤 새 main 충돌을 해소한 PR:** #186 Owner study-plan `1111977f`, #188 migration runner `2ba7fa2f`, #190 recovery drill `43b9b64a`. DB 생성/env·합성/실 disposable PG suites를 모두 보존하고, 중복 API 빌드 대신 postgres job 내 실제 compiled build 선행을 검사한다. #186/#188 최신 CI SUCCESS, #190 최신 필수 검증 진행 중. 이전 HEAD 승인을 재사용하지 않고 독립 재리뷰 요청.
- **새 독립 구현 PR:** [#204](https://github.com/minseong-hufs/HUFS-One-AI/pull/204) actor/session context 할당·CSRF 해제(`1f21a3a4`, base #195), [#206](https://github.com/minseong-hufs/HUFS-One-AI/pull/206) 읽기 전용 실행 진입점 원장(`3f040b16`, main), [#207](https://github.com/minseong-hufs/HUFS-One-AI/pull/207) Windows shell LF(`5b506cb0`, main), [#208](https://github.com/minseong-hufs/HUFS-One-AI/pull/208) offline NCP phase00 plan/Quickstart·에이전트 매뉴얼(`3de5af4b`, base #207), [#209](https://github.com/minseong-hufs/HUFS-One-AI/pull/209) 명시적 preview 복구·공유 잠금·readiness·과거 ZIP shell 정규화(`24c19bfd`, base #197 + #207 의존). 모두 해당 HEAD 두 워크플로 SUCCESS, 비작성자 GitHub 승인 대기.
- **실패를 보존한 검증:** #204의 초기 session10 정책은 기존 20방향 전환을 차단해 전체 CI 1FAIL이었다. 기존 회귀를 유지하고 session50/actor100/global200으로 보완해 집중 84PASS·새 CI SUCCESS. #206 Worker 생성자 누락은 새 RED 후 8회귀 PASS. #209의 초기 과거 ZIP LF PASS 서술은 실제 CRLF 3건 검사 실패로 정정했으며, 생성 ZIP만 정규화한 뒤 실제 과거 ref 재생성 LF PASS·PowerShell7/5.1 회귀 PASS. 지연 startup/recovery도 RED→GREEN. Git 이력/원본은 재작성하지 않았다.
- **협업자 PR은 보존:** #152 rowImpacts P2와 #189 승인된 동일교과 코어의 현재 코드 리뷰는 APPROVED이며 현재 두 CI도 SUCCESS다. #151/#154/#155/#191 및 신규 #205 등은 작성자의 고유 diff/역할·현재 리뷰 게이트를 따른다. 이 회차에 협업자 PR 수정/병합은 하지 않았다.
- **아직 CODE_PENDING:** #192의 신규 자원 생성 IaC·Nginx/호스트 설치의 추가 자동화·호스트 검증/반납·승인 SHA 기반 운영 Actions 등은 phase00/복구 도구만으로 완료되지 않았다. #199/#203도 PR 미병합이며, 다른 독립 소프트웨어/수락 항목을 계속 대조한다. 사람 승인 대기만 남았다고 선언하지 않는다.

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

**책임 경계:** NCP 관련 모든 소프트웨어 코드(Provider/OCR/HCX/Laya/worker/Docker/CI)는 심민성이 담당. 이서연의 범위는 비코드 NCP 계정·원가·운영뿐이다. 실제 학생 자료 제공 대상과 코드 담당은 별개. 지속되는 역할 경계는 [WORKSTREAMS](docs/WORKSTREAMS.md)를 따른다. 신규 #192/#199/#203은 심민성 소프트웨어 범위이며, 현재 열린 일반 이슈 40건의 assignee·본문/최신 코드를 함께 대조한다.

## 아직 완료할 수 없는 릴리스/인적 게이트

1. **#46:** 기존 Private Git 감사 178/180 PASS·2 FAIL 및 별도 WIP privacy 146/148 PASS·2 FAIL(서로 다른 분모), 보호 수강 CSV/Forms 6경로 최초 게시·공유·현재 동의/철회/기관 권리 미확정. 원문·비밀 외부 반출/CI·PR 첨부 및 이력 force rewrite 금지.
2. **#61:** 200 합성 예시의 독립 사람 gold 수락 0/200. 코드·자동 시험 ≠ 사람 승인.
3. **#89:** 실제 Google OIDC·외대 이메일 소유 증명·철회, TLS/직접 IP/preview/CDN 차단, NCP 네트워크/운영 영속 DB, 운영 요금/서버·원본 권리 및 실제 단말 수락 NOT_RUN. 사용자 명시적 과금/배포 승인 전 수행 금지.
4. **기능 종단:** 승인된 현재 source/permission/asOf/RulePack, owner session↔API↔PG↔UI, 401/403/409/503·권한 철회/다중탭/기기 접근성을 현재 HEAD에서 증명해야 함.

**목표:** 실제 사용 가능한 서비스 완성·수락 검증 → 별도 승인 후 NCP 배포 → 지속 운영/유지보수. 기존 main 병합 #156/#157/#158/#159/#160/#162/#163/#164/#168은 승인된 합성 하위 코드 수락이지 운영 출시 승인 아님. 현재 판단의 정본은 [열린 PR](https://github.com/ot4562-glitch/HUFS-One-AI/pulls), [이슈](https://github.com/ot4562-glitch/HUFS-One-AI/issues), [TEAM_PROGRESS](docs/TEAM_PROGRESS.md), [NCP 운영](docs/NCP_OPERATIONS_2026.md)이다.
