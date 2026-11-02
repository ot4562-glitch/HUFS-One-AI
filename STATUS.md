# HUFS One AI | 현재 작업 상태

> 기준: **2026-11-03 KST**, GitHub `ot4562-glitch/HUFS-One-AI`의 기본 브랜치 `main`. 이 문서는 **현재 확인된 범위만** 기록한다. 과거 PR별 실험·리뷰·측정 영수증은 [Git 커밋 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/STATUS.md), 각 PR 및 이슈에서 확인한다. 과거 날짜의 수치를 현재 상태로 재사용하지 않는다.

## 요약

| 항목 | 현재 판정 |
| --- | --- |
| 코드 | React/Vite + Fastify + TypeScript/Zod + 순수 추천/학업 코어·합성 시험 구현 진행 |
| 통합 | #137의 합성 독립 계정/인가/자료 검수 게이트는 main. #139·#140 테스트-only 회귀 병합 |
| 열려 있는 PR | **4개**: 기능 #131·#134·#138(병합 차단), 유지관리 [#142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142)(리뷰·CI 대기) |
| 이슈 | **OPEN 32 / CLOSED 7**(이번 감사 기준). 일반 기능/실자료/출시의 전체 완료 판정 아님 |
| UI | #129 메뉴 셸 main. 전체 HUFSAbility IA/독립 리디자인 #124·#141 OPEN |
| 실제 운영 | **RELEASE_BLOCKED** — #46, #89 외부·개인정보 검증 미완료 |

## 최근 병합의 정확한 증거

- [#137](https://github.com/ot4562-glitch/HUFS-One-AI/pull/137): 합성 독립 빈 계정·권한/수정판본/코스 입력 수집 게이트와 owner API의 안전한 경계. `main f593b61`. **실제 4인 로그인·학교 승인 수집·운영 배포가 아님**.
- [#139](https://github.com/ot4562-glitch/HUFS-One-AI/pull/139): 합성 EMPTY→A→B→RESET 및 주전공/이중전공 변경·제거에 따른 재계산 baseline 회귀. HEAD `6f7496e`, 비작성자 승인, 해당 HEAD synthetic/PG/Chrome CI **3/3 SUCCESS**, `main 26c559e` 병합.
- [#140](https://github.com/ot4562-glitch/HUFS-One-AI/pull/140): 정정/취소 공고의 DEADLINE·STATUS·ELIGIBILITY와 현재 검수 피드·공지 판본 합성 일치 회귀. HEAD `e4e8599`, 비작성자 승인, 해당 HEAD synthetic/PG/Chrome CI **3/3 SUCCESS**, `main 41de619` 병합.
- #139·#140은 **테스트-only**. 운영 DB, 실학생·실공고, UI 실제 기능, 독립 추천 평가 성능의 완료 증거로 승격하지 않는다.

## 열린 PR — 수정·재검증 전 병합 금지

| PR | 담당/현 상태 | 반드시 해결할 문제 |
| --- | --- | --- |
| [#131](https://github.com/ot4562-glitch/HUFS-One-AI/pull/131) | 이의상, CHANGES_REQUESTED | route unmount/remount 중 overlay GET 지연 응답·재진입 로딩 문제, REVIEWER capability 장애를 BETA로 오인하는 fail-open 위험. 최신 HEAD 재검토 필요 |
| [#134](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134) | 이의상, COMMENT/선행 대기 | #131 위의 stacked PR. 선행 수정·병합 뒤 main 기준 새 diff/CI/독립 승인, #137 실제 API 연동과 시연 매뉴얼 검증 |
| [#138](https://github.com/ot4562-glitch/HUFS-One-AI/pull/138) | 박준영, DRAFT+CHANGES_REQUESTED | 시간표 저장 HTML 손상 마지막 행 조용한 누락, 행별 학기 근거. 무단 크롤링/원문 외부 업로드 없음 |
| [#142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142) | 유지관리 도구, 비작성자 리뷰·CI 대기 | 병합 PR 브랜치만 보수적으로 분류하는 **dry-run 기본** CLI. 적용은 별도 명시 및 원격 재검증, 실제 삭제 전 작업자 worktree/복구 확인 |

CI 성공이나 PR 리뷰 작성은 미해결 결함을 무효화하지 않는다. 최신 상태는 각 PR 화면에서 재확인한다.

## 지금 필요한 일

1. **UI/디자인:** [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)의 공개 5분류·24기능+비로그인 4영역과 [텍스트 UI 조사](docs/HUFSABILITY_UI_COMPONENT_ATLAS.md)의 학생 계정 관찰 11개 그룹·76화면(1경로 미검증)을 빠짐없이 IA에 대응. [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141)에서 원본과 같은 화면을 복제하지 않고 더 좋은 **독립 반응형 UI/UX** 설계. 기존 메뉴는 미지원이어도 `🚫 미지원/검증 전`으로 보존, 실제 동작은 중앙 capability manifest에서만 허용. 학교의 공식 업데이트로 주장 금지.
2. **계정·시연:** [#132](https://github.com/ot4562-glitch/HUFS-One-AI/issues/132) 독립 빈 합성 계정 UI 및 [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) 별도 실 4인 권한/교육과정 검증. 둘을 한 사용자 집합으로 혼동하지 않기.
3. **추천·학업:** [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) 두 판본 비교 React/권리, [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61) 독립 인적 골드 200건(확인된 완료 0/200), [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) 공식 RulePack·출처·재수강·전공 검수.
4. **실제 출시 게이트:** [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 기존 Private Git 보호 원본 최초 게시/접근/이력 감사 및 개인정보 경계 **2 FAIL**(이전 검사 영수증, 이 정리 회차 재실행 안 함). [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) Google OIDC/외대 이메일 증명·TLS·CDN/direct IP/preview·영속 PG·NCP·권한 철회·학교 기관 자료 이용권의 실제 검증까지 `RELEASE_BLOCKED`. 목적별 확인된 4/4 응답은 보존하되 Git 게시·실서비스 이용권 확대를 추정하지 않는다.

## GitHub 저장소 유지관리 감사

- 2026-11-03 재조회 원격 브랜치 **106개 = main 1 + 열린 PR 헤드 4(#131/#134/#138/#142) + 병합 PR 연계 86 + 미병합 종료 PR 연계 11 + PR 없는 백업/준비 4**. 병합 PR 86개는 **조건부 dry-run 후보**일 뿐, 작업자 worktree/후속 사용/복구 검증 전 자동 삭제를 허용하지 않는다.
- **미병합 종료 11개**는 단순 병합 브랜치로 간주하지 않는다. 이전 조사에서 main 대비 고유 커밋 0개 5개, 별도 고유 커밋이 있는 6개를 확인했으므로 대체 구현/참조 검증 전 보존. 백업·준비 4개도 검수 전 보존.
- 실제 원격 브랜치 **삭제 0건**. [PR #142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142)에 안전한 후보 분류/명시적 삭제 CLI와 Node 독립 단위 테스트 **4/4 PASS(격리본)**를 제출했고, GitHub PR CI/비작성자 리뷰·실 Private 원격 dry-run은 별도 검증 대기. **main의 제품 코드·CI 변경 없음**. 현재 GitHub 연결에는 refs 삭제 기능이 없어 원격 삭제를 실행했다고 주장하지 않는다.

## 검증·재현

- 합성 및 타입 검사: `npm ci --ignore-scripts --no-audit --no-fund` → `npm run check`. 선택적 PG와 실제 Chromium 시험은 별도; CI 필수 작업은 `.github/workflows/` 확인.
- 개인정보 경계: `npm run check:privacy`. **이 문서 갱신 과정에서 테스트/실 PG·NCP·브라우저를 새로 실행하지 않았음(NOT_RUN)**. 기존 성공 CI 기록은 위 명시한 PR HEAD 기준.
- 당사자 동의·기록/권리·기관 승인·유료 실행·정식 서비스 개통은 이 문서나 CI 합격으로 충족되지 않는다.

**정본:** [README](README.md) 안내, [Architecture](Architecture.md) 기술 계약, [PR_WORKFLOW](docs/PR_WORKFLOW.md) 리뷰·병합, [WORKSTREAMS](docs/WORKSTREAMS.md) 담당, [DATA_GOVERNANCE](docs/DATA_GOVERNANCE.md) 자료 권한, GitHub 이슈/PR의 최신 HEAD 증거.
