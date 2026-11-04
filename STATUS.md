# HUFS One AI | 현재 작업 상태

> **2026-11-04 KST · GitHub 현재 HEAD/PR/리뷰/CI 및 이슈 수락 조건 대조.** 이 페이지는 변경 가능한 상태의 스냅샷이다. 최종 판정은 GitHub 현재 HEAD, 해당 PR 리뷰, Actions와 이슈 본문을 다시 조회한다.

## 2026-11-04 API·PostgreSQL·NCP 우선 구현 PR + 사람 검증 인수

- **API/영속 DB:** [#213](https://github.com/minseong-hufs/HUFS-One-AI/pull/213) 운영자 내부 API launcher, PostgreSQL 7개 별도 ROLE/TLS/준비/종료; **#183 선행**, 최신 HEAD `e33df5ac` TASK-00/Chrome **2/2 SUCCESS**, 비작성자 승인 대기. 실제 OIDC·DB·운영 HTTPS는 **NOT_RUN**이며 production guard 해제 없음.
- **NCP 서버 생성 코드:** [#214](https://github.com/minseong-hufs/HUFS-One-AI/pull/214) 별도 host Terraform 승인·NIC/ACG·Ubuntu VM·Public IP 계획/오프라인 mock; **#207 → #208 → #211 → #214** 선행. 최신 HEAD `07afcaf2` TASK-00/Chrome/NCP IaC 오프라인 **3/3 SUCCESS**, 비작성자 리뷰 대기, 실제 NCP `apply`/요금 **NOT_RUN**.
- **NCP 설치/배포·복구 코드:** [#215](https://github.com/minseong-hufs/HUFS-One-AI/pull/215) 승인형 Ubuntu bootstrap, 고정 SSH 지문 Windows 미리보기 deploy/verify/rollback, 기존 release lock 사용. **#197 → #209 → #215** 선행 및 호스트 #214 필요. 최신 HEAD `dc453a2c` TASK-00/Chrome **2/2 SUCCESS**, 독립 리뷰 대기, 실호스트 SSH/설치·복구 **NOT_RUN**.
- **사람이 해야 할 검증 17개와 간단 피드백:** [HUMAN_ACCEPTANCE_GATE_20261104](docs/HUMAN_ACCEPTANCE_GATE_20261104.md) (A01-D03: 코드 검토, OAuth/DB, 데이터, NCP 계정·요금/현장 복구, 독립 gold, 공개 출시). 항목별 승인/수정 요청/보류/미실행 + 증거 URL/ID로 피드백. 동료 리뷰 요청: #213/#215 박준영, #214 김채윤.
- **결론:** 현재 열린 PR **36건**, 일반 이슈 **40건**(GitHub 조회시점). 신규 3건은 코드·합성/모의 테스트 PR일 뿐 미병합. 사용자 사전 승인 없는 유료 리소스/외부 서비스/학생 자료 전송·공개 배포 없음. [#46](https://github.com/minseong-hufs/HUFS-One-AI/issues/46) Git 원본, [#61](https://github.com/minseong-hufs/HUFS-One-AI/issues/61) gold 0/200, [#89](https://github.com/minseong-hufs/HUFS-One-AI/issues/89) 실서비스 검증 전 **RELEASE_BLOCKED**.

## 2026-11-04 공모전·수집 허가 정정과 개인정보 Git 기술 결함

- **사용자 확인 완료:** 공모전 참여자 **5명 전원 동의**, HUFSAbility의 자료 수집 **허가 확보**. 실제 개인 수강/Forms 원본 제출 대상 **4명**과 구별. 이 확인을 '동의 자체 미확보/학교 수집 허가 전무'로 다시 집계하지 않는다. 허가 목적·이용·재배포/외부전송의 정확한 범위는 제한된 증빙에서 별도로 유지.
- **교수 자료:** 공식 강의시간표에 공개된 교수명·강의명(수업 직무정보)만 수집. 허가 범위 내 안내 정보에 대해 교수 이름 일괄 마스킹은 **필수 출시 차단으로 산정하지 않음**. 비공개 연락처·교수 평가/사생활은 수집하지 않으며, 필요한 최소 항목·저장·노출 제어 유지.
- **기술 결함 #46:** 현재 main Git 트리에 보호 원본 경로 **6개가 추적**돼, full checkout privacy의 기존 두 검사 실패와 연결된다. [PR #212](https://github.com/minseong-hufs/HUFS-One-AI/pull/212)에서 원본 바이트를 열지 않고 **PR HEAD 보호 경로 0개**로 만들고, `.gitignore`/full Git tree metadata·sparse CI 회귀를 보강. **최신 HEAD f2605803의 TASK-00/Chrome CI 2/2 SUCCESS**, 비작성자 독립 APPROVED·main 병합·실제 full checkout privacy PASS 미확인, 기존 Git history/clone 남음. 검사 우회/동의 없는 외부 재게시/force push 없음.
- **출시 별도 판단:** 공모전 동의·자료 수집 허가와 무관하게 #61 사람 독립 평가 0/200, #89 실 OIDC·HTTPS/TLS·직접 IP·운영 PostgreSQL·NCP/실호스트 검증이 남아 `RELEASE_BLOCKED` 유지. [자료 권한 정본](docs/DATA_GOVERNANCE.md).

## 한눈에 보기

| 구분 | 확인한 상태 |
| --- | --- |
| 프로젝트 | 독립 Private HUFS One AI 팀 프로젝트. 한국외대 공식 HUFSAbility 개편/운영 서비스 아님 |
| GitHub | **열린 PR 36건 / 열린 일반 이슈 40건** (2026-11-04 코드 PR #213~#215 추가) |
| main에 구현된 범위 | 계약/Zod, 합성 React, 학업·추천·일정 코어, 인가된 API/일회용 PostgreSQL, SourceRevision, OCR/Provider 비용·Laya 스케줄러의 **하위 코드**. 운영 서비스 조립·인적 수락은 별개 |
| 최신 하위 병합 | **#189** 동일교과 승인 규칙 pure core → main 5718fd2; **#152** 현재 선택한 이중전공 합성 UI → main 28d4827. 두 PR 모두 HEAD 비작성자 APPROVED, 필수 TASK-00/Chrome 2/2 SUCCESS, 미해결 review thread 없음, mergeable 확인 후 squash 병합 |
| 기존 개발 병합 | #169 Provider PostgreSQL 연결 main 045f2478, #179 Laya Linux 경로 main ef289537 등. 실 NCP/Provider 실행 승인으로 해석 금지 |
| 코드 리뷰 | #151/#154/#155 UI, #191 WIS, #205 학업 속성, #210 정규화 benchmark에 GitHub **COMMENT 리뷰** 등록. AI 검토 의견은 비작성자 **사람의 APPROVED를 대신하지 않음** |
| 출시 | **RELEASE_BLOCKED** (#46 Git 추적 6경로의 PR 미병합/이력 감사, #61 독립 gold, #89 실제 인증/TLS/DB/NCP/권한 검증 미완료). 5명 참여 동의와 HUFSAbility 수집 허가는 사용자 확인 완료 |

## PR 병합 및 대기 분류

### 병합 완료(이번 회차)

- [#189](https://github.com/minseong-hufs/HUFS-One-AI/pull/189): 박준영 담당 승인된 동일교과 규칙만 학점 원장 앞에서 매핑. 합성 pure core. 공식 학칙 승인 아님. HEAD d33bae8 → main 5718fd2.
- [#152](https://github.com/minseong-hufs/HUFS-One-AI/pull/152): 이의상 담당 현재 주전공/선택 이중전공을 함께 표시. malformed rowImpacts 엄격 거부·360px E2E 등 합성 UI. HEAD 2f0c0ed → main 28d4827. 실학생/실 RulePack 브라우저 수락 아님.
- 두 병합 뒤 main의 새 CI는 원래 PR HEAD CI와 **별도 실행**된다. main의 새 검증은 해당 Actions 결과 확인 전 PASS로 미리 적지 않는다.

### 리뷰/선행 PR 대기

- **현재 작성자 PR:** #161 Laya child/격리(HEAD 변경 후 과거 승인 재사용 금지), #166 private ingress **Draft**, #175/#177 Provider 웹/카오스(과거 #169 스택에서 main으로 retarget), #176 Owner 브라우저, #178 학교메일, #180~#188 Source·PG·Owner, #190 PG 복원 등. 각 HEAD/CI/mergeable과 타인 리뷰를 별도 확인한다.
- **#193~#198 감사 결함 수정:** SSRF IP 분류, 브랜치 삭제 lease, 컨텍스트 용량, 중복 키/이력 성능, preview rollback, Node engine. PR HEAD CI 통과 기록은 **리뷰/병합 완료가 아님**.
- **개인정보 Git 수정:** #212 6개 보호 경로 HEAD untrack·sparse/full-tree 감사 CI PR. 리뷰·병합·full checkout 재검증 미완료. **NCP/품질 후속:** #204(선행 #195), #206(#199), #207(CRLF), #208(선행 #207), #209(선행 #197), #211(선행 #208) — 합성/오프라인 검증과 현재 리뷰·병합 의존을 추적. 실서버 자원 생성·운영 공개 아님.
- **팀원 대기:** #151 공고 정정 UI, #154 수강계획 UI, #155 What-if UI는 #152를 보존하며 최신 main과 재통합한 HEAD 검증이 필요. #191 WIS 기초 탭, #205 학업 seeded 속성, #210 정규화 benchmark(선행 #196)는 코드 검토 COMMENT·CI 성공, 비작성자 인적 승인 및 병합 대기. 다른 팀원의 고유 diff/브랜치를 임의 덮어쓰지 않는다.

**합병 규칙:** [PR_WORKFLOW](docs/PR_WORKFLOW.md) — 현재 HEAD 비작성자 APPROVED, 같은 HEAD의 필수 CI, CHANGES_REQUESTED 해소, 리뷰 thread/선행 스택 충돌 없음, 보안·권리 경계. 작성자 자체 검토나 AI COMMENT로 승인 대체 불가. 병합 후 새 main CI 실패가 발생하면 별도 원인 해결 전 추가 위험 병합 금지.

## 일반 이슈 40건 점검

- **현재 전부 OPEN**: 체크리스트 또는 실제 운영/기관/인적 수락 중 미완료가 남아 있어 전체 완료로 닫을 수 있는 이슈를 확인하지 못함. 단순 PR 병합 건수나 CI 수치로 완료 상태를 변경하지 않는다.
- **하위 완료 표시:** [#133](https://github.com/minseong-hufs/HUFS-One-AI/issues/133)에는 #189 pure core 병합을, [#144](https://github.com/minseong-hufs/HUFS-One-AI/issues/144)에는 #152 합성 UI 병합을 명시하고 각각 남은 공식 RulePack/실학생/권한 수락을 보류.
- **미병합 코드 진행:** [#192](https://github.com/minseong-hufs/HUFS-One-AI/issues/192) NCP 설치·매뉴얼(#207/#208/#209/#211), [#199](https://github.com/minseong-hufs/HUFS-One-AI/issues/199) 진입점 원장(#206), [#201](https://github.com/minseong-hufs/HUFS-One-AI/issues/201) benchmark(#210), [#202](https://github.com/minseong-hufs/HUFS-One-AI/issues/202) 학업 속성(#205), [#203](https://github.com/minseong-hufs/HUFS-One-AI/issues/203) quota(#204)를 PR 의존과 함께 갱신. 미병합이므로 완료 체크 X.
- **다른 주관 업무:** UI 이의상, 순수 추천 김채윤, 학업 박준영, 비코드 NCP 운영 이서연. [WORKSTREAMS](docs/WORKSTREAMS.md) 주관 변경 없음.

## 완성도와 출시 차단은 다른 지표

- [TEAM_PROGRESS](docs/TEAM_PROGRESS.md)의 고정 인적 수락 게이트는 **심민성 7/12, 이의상 9/12, 김채윤 7/12, 박준영 8/12, 이서연 비코드 NCP 1/5**로 유지한다. 합성 하위 코드 병합이 그 게이트의 모든 항목을 충족하지 않는다.
- #46: 보호 수강 CSV/Forms 원문 Git 최초 게시·공유 권리/철회 및 이전 검사 **2 FAIL** 미해결. 원문을 열람·외부 반출하거나 강제 이력 재작성하지 않는다.
- #61: **독립 인간 gold 0/200 확인**. 생성자 자체 200 라벨은 최종 gold가 아니다.
- #89: 실 Google OIDC/학교메일·권한 철회, NCP/HTTPS/TLS/직접 IP·Geo 원본 차단, 실 PostgreSQL·실단말·기관 자료권리 NOT_RUN. 사용자 과금/운영 공개 승인 없음.
- 초기 API 실행기는 생산 모드를 기본 차단한다. 오프라인 타입/PG/Chrome 성공은 실서비스 공개 승인 아님.

**다음:** 독립 리뷰 대기 PR의 HEAD·선행 base와 최신 main CI를 재확인 → 승인된 작은 PR 단위 병합 → 정확한 하위 이슈 체크 → 승인 필요한 실운영/인간 수락은 별도 OPEN/RELEASE_BLOCKED 유지. 과거 세부 이력은 GitHub PR·이슈 댓글과 문서 Git 이력에 보존한다.
