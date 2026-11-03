# HUFS One AI | 현재 작업 상태

> 기준: **2026-11-03 KST**, GitHub `ot4562-glitch/HUFS-One-AI`의 기본 브랜치 `main`. 이 문서는 **현재 확인된 범위만** 기록한다. 과거 PR별 실험·리뷰·측정 영수증은 [Git 커밋 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/STATUS.md), 각 PR 및 이슈에서 확인한다. 과거 날짜의 수치를 현재 상태로 재사용하지 않는다.

## 요약

| 항목 | 현재 판정 |
| --- | --- |
| 코드 | React/Vite + Fastify + TypeScript/Zod + 순수 추천/학업 코어·합성 시험 구현 진행 |
| 통합 | #137의 합성 독립 계정/인가/자료 검수 게이트는 main. #139·#140 테스트-only 회귀 병합 |
| 열려 있는 PR | UI #131 수정 요청·#134 선행 스택 대기. #20 오프라인 어댑터 후속은 현재 개발 브랜치에서 검수 중 |
| 이슈 | **OPEN 34 / CLOSED 7**(이번 감사 기준). 일반 기능/실자료/출시의 전체 완료 판정 아님 |
| **담당 범위 진척** | [2026-11-03 증거 원장](docs/TEAM_PROGRESS.md): 심민성 **7/12(58.3%)**, 이의상 **9/12(75.0%)**, 김채윤 **7/12(58.3%)**, 박준영 **8/12(66.7%)**, 이서연 **NCP 운영 전용 1/5(20.0%, 새 기준선)**. 제품/개인 성과/출시 준비율 아님; 이전 이서연 1/8과 직접 비교 금지 |
| UI | #129 메뉴 셸 main. 전체 HUFSAbility IA/독립 리디자인 #124·#141 OPEN |
| 실제 운영 | **RELEASE_BLOCKED** — #46, #89 외부·개인정보 검증 미완료 |

## 2026-11-03 진척률 병목·담당 재배정

- **작성 PR 실적(문서 포함):** 심민성 `ot4562-glitch` **57건/병합 46건**, 김채윤 `qamarrchae` **16건/병합 16건**. 기존 7/12(58.3%)은 코드량 부족/개인 기여도 점수가 아니라 **고정 수락 체크 7개 완료+5개 복합 미충족**. [분리한 병목 표](docs/TEAM_PROGRESS.md) 참고.
- **심민성의 남은 5개:** 실제 Google/학교 이메일 검증, 운영 PG/TLS/NCP/직접 IP, #46 Private Git 원본 권리/2 FAIL, UI·학업 provider 실 종단, 독립 인적 골드/실출처 평가. **김채윤의 남은 5개:** #61 독립 인적 200 gold(현재 확인 0/200), 기관 공고 권리, 실출처 추천 성능 검증, 인가된 UI 소비, rank-v1.1 채택/사용자 검수. 이미 병합된 합성 코어는 유효하나 실데이터/운영 검증으로 자동 대체되지 않음.
- **이서연 `lhh42001` = NCP 비코드 운영·영수증만**([#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12) 계정/크레딧/권한/서비스 한도, [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22) 호스트 CPU/RSS/비용·중지/반납). **SDK·worker·OS 스크립트·CI/IaC 코드는 0건 배정.** UI/시연/학업 assignee에서도 해제. 실자료 제공 대상 4인 중 1명인 사실은 불변.
- **심민성 = NCP AI 소프트웨어 코드 전부**: [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20) General OCR/HCX SDK·bbox·근거, [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88) fake-provider 429/503·budget/CPU 테스트, [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143) Laya ONNX worker/queue/cgroup/systemd/Docker/IaC/CI. **3건 모두 OPEN**. #20의 오프라인 요청/응답 어댑터 구현·검증을 진행 중이며 실제 호출·비용 예약/권한 transport·#88 장애 시험·#143 worker 완료가 아님. 새 코드 백로그는 기존 기술/출시 수락 12칸의 분모와 별도.
- **최신 정본** [WORKSTREAMS](docs/WORKSTREAMS.md) 담당, [TEAM_PROGRESS](docs/TEAM_PROGRESS.md) 분모/병목, [AGENTS](AGENTS.md) 코드 자동화 경계. NCP 유료 리소스/모델 다운로드·학교/학생 원자료 전송은 사용자 별도 승인 전 금지. #46/#89 `RELEASE_BLOCKED`.

## 최근 병합의 정확한 증거

- [#137](https://github.com/ot4562-glitch/HUFS-One-AI/pull/137): 합성 독립 빈 계정·권한/수정판본/코스 입력 수집 게이트와 owner API의 안전한 경계. `main f593b61`. **실제 4인 로그인·학교 승인 수집·운영 배포가 아님**.
- [#139](https://github.com/ot4562-glitch/HUFS-One-AI/pull/139): 합성 EMPTY→A→B→RESET 및 주전공/이중전공 변경·제거에 따른 재계산 baseline 회귀. HEAD `6f7496e`, 비작성자 승인, 해당 HEAD synthetic/PG/Chrome CI **3/3 SUCCESS**, `main 26c559e` 병합.
- [#140](https://github.com/ot4562-glitch/HUFS-One-AI/pull/140): 정정/취소 공고의 DEADLINE·STATUS·ELIGIBILITY와 현재 검수 피드·공지 판본 합성 일치 회귀. HEAD `e4e8599`, 비작성자 승인, 해당 HEAD synthetic/PG/Chrome CI **3/3 SUCCESS**, `main 41de619` 병합.
- [#138](https://github.com/ot4562-glitch/HUFS-One-AI/pull/138): 저장 시간표 변환기 최종 HEAD `44afcf6`, 기존 두 변경 요청 해소·현재 HEAD 비작성자 승인 뒤 main `605144c` 병합. 실제 수업 수집·공식 학칙 승인·4인 자료 연결 완료가 아님.
- [#142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142): dry-run 기본 브랜치 감사 도구, HEAD `53039bd` 비작성자 승인 뒤 main `719c576` 병합. 도구 병합은 원격 브랜치 삭제 실행 증거가 아님. 현재 main `605144c`의 Actions [41552895276](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41552895276)·[41552895286](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41552895286) 완료 SUCCESS.
- #139·#140은 **테스트-only**. 운영 DB, 실학생·실공고, UI 실제 기능, 독립 추천 평가 성능의 완료 증거로 승격하지 않는다.

## 2026-11-03 담당별 수락 변경의 근거

- [#73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73) 초대 UI (main `3205063`), [#74](https://github.com/ot4562-glitch/HUFS-One-AI/pull/74) 졸업 화면 (`fba53ba`), [#75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75) REVIEWER 합성 샌드박스 (`1cbd771`)는 최종 HEAD 비작성자 **APPROVED**, 해당 HEAD 합성/PG 각 **2/2 SUCCESS**, main 병합 확인. **UI 고정 게이트 +3**로 6/12→9/12. [담당 게이트별 상세 증거](docs/TEAM_PROGRESS.md).
- [#76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76) Playwright는 병합됐고 [#126](https://github.com/ot4562-glitch/HUFS-One-AI/issues/126)으로 확인한 [main Chrome Actions 41463272343](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41463272343) UI 14/14·독립 합성 계정 9/9 성공. 다만 실제 **스크린리더**의 별도 수락 결과가 없어 고정 복합 게이트는 여전히 [ ].
- [#127](https://github.com/ot4562-glitch/HUFS-One-AI/pull/127) D-day, [#128](https://github.com/ot4562-glitch/HUFS-One-AI/pull/128) 지원 보드, [#129](https://github.com/ot4562-glitch/HUFS-One-AI/pull/129) 공개 메뉴 5/24/4, [#130](https://github.com/ot4562-glitch/HUFS-One-AI/pull/130) 합성 동아리 UI도 main. 새 UI/기존 메뉴/What-if 전체 범위 수락과는 구별. 다른 트랙의 새 합성 테스트/개선은 고정 분모를 늘리지 않음.

## 열린 PR — 수정·재검증 전 병합 금지

| PR | 담당/현 상태 | 반드시 해결할 문제 |
| --- | --- | --- |
| [#131](https://github.com/ot4562-glitch/HUFS-One-AI/pull/131) | 이의상, CHANGES_REQUESTED | route unmount/remount 중 overlay GET 지연 응답·재진입 로딩 문제, REVIEWER capability 장애를 BETA로 오인하는 fail-open 위험. 최신 HEAD 재검토 필요 |
| [#134](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134) | 이의상, COMMENT/선행 대기 | #131 위의 stacked PR. 선행 수정·병합 뒤 main 기준 새 diff/CI/독립 승인, #137 실제 API 연동과 시연 매뉴얼 검증 |

CI 성공이나 PR 리뷰 작성은 미해결 결함을 무효화하지 않는다. 최신 상태는 각 PR 화면에서 재확인한다.

## 지금 필요한 일

1. **UI/디자인:** [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)의 공개 5분류·24기능+비로그인 4영역과 [텍스트 UI 조사](docs/HUFSABILITY_UI_COMPONENT_ATLAS.md)의 학생 계정 관찰 11개 그룹·76화면(1경로 미검증)을 빠짐없이 IA에 대응. [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141)에서 원본과 같은 화면을 복제하지 않고 더 좋은 **독립 반응형 UI/UX** 설계. 기존 메뉴는 미지원이어도 `🚫 미지원/검증 전`으로 보존, 실제 동작은 중앙 capability manifest에서만 허용. 학교의 공식 업데이트로 주장 금지.
2. **계정·시연:** [#132](https://github.com/ot4562-glitch/HUFS-One-AI/issues/132) 독립 빈 합성 계정 UI 및 [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) 별도 실 4인 권한/교육과정 검증. 둘을 한 사용자 집합으로 혼동하지 않기.
3. **추천·학업:** [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) 두 판본 비교 React/권리, [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61) 독립 인적 골드 200건(확인된 완료 0/200), [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) 공식 RulePack·출처·재수강·전공 검수.
4. **실제 출시 게이트:** [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 기존 Private Git 보호 원본 최초 게시/접근/이력 감사 및 개인정보 경계 **2 FAIL**(이번 개발 트리 재검사 146/148 PASS, 보호 추적 파일 6개에 대한 기존 두 차단 유지). [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) Google OIDC/외대 이메일 증명·TLS·CDN/direct IP/preview·영속 PG·NCP·권한 철회·학교 기관 자료 이용권의 실제 검증까지 `RELEASE_BLOCKED`. 목적별 확인된 4/4 응답은 보존하되 Git 게시·실서비스 이용권 확대를 추정하지 않는다.

## GitHub 저장소 유지관리 감사

- 앞선 유지관리 조사 당시 원격 브랜치 **106개**(분류는 당시 기준; #138/#142는 이후 병합). 병합 PR 86개는 **조건부 dry-run 후보**일 뿐, 작업자 worktree/후속 사용/복구 검증 전 자동 삭제를 허용하지 않는다.
- **미병합 종료 11개**는 단순 병합 브랜치로 간주하지 않는다. 이전 조사에서 main 대비 고유 커밋 0개 5개, 별도 고유 커밋이 있는 6개를 확인했으므로 대체 구현/참조 검증 전 보존. 백업·준비 4개도 검수 전 보존.
- 실제 원격 브랜치 **삭제 0건**. [PR #142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142)에 안전한 후보 분류/명시적 삭제 CLI와 Node 독립 단위 테스트 **4/4 PASS(격리본)**를 제출했고, 최신 PR HEAD `53039bd`는 GitHub 합성·PG·Chrome **3/3 SUCCESS**. 독립 리뷰는 이후 현재 HEAD에서 승인됐고 main에 병합됐다. 실제 원격 삭제는 이 기록에서 실행 증거를 확인하지 못했으므로 완료로 표시하지 않는다.

## 검증·재현

- 합성 및 타입 검사: `npm ci --ignore-scripts --no-audit --no-fund` → `npm run check`. 선택적 PG와 실제 Chromium 시험은 별도; CI 필수 작업은 `.github/workflows/` 확인.
- 개인정보 경계: `npm run check:privacy`. 이번 #20 개발 트리의 CLOVA wire/기존 AI/evidence 집중 검사 **59 PASS**, 타입 검사·API 빌드 성공. 초기 모듈 부재 RED와 독립 리뷰 발견 4개 회귀 RED 후 수정·GREEN 확인. 개인정보 경계 **146/148 PASS·2 FAIL**. 실제 PG·NCP·브라우저 재실행은 NOT_RUN; 기존 main/PR CI 기록은 위 SHA 기준. #20 wire 코드는 검토 중인 제안이며 현재 main 구현 완료로 표시하지 않음.
- 당사자 동의·기록/권리·기관 승인·유료 실행·정식 서비스 개통은 이 문서나 CI 합격으로 충족되지 않는다.

**정본:** [README](README.md) 안내, [Architecture](Architecture.md) 기술 계약, [PR_WORKFLOW](docs/PR_WORKFLOW.md) 리뷰·병합, [WORKSTREAMS](docs/WORKSTREAMS.md) 담당, [DATA_GOVERNANCE](docs/DATA_GOVERNANCE.md) 자료 권한, GitHub 이슈/PR의 최신 HEAD 증거.
