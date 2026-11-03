# HUFS One AI | 현재 작업 상태

> **2026-11-03 KST GitHub 검증본.** #157 Provider 사전권한 독립 승인·CI 3/3 후 **main `7ac5a06c` 병합**, #159 Laya OFF 스케줄러 독립 승인·CI 3/3 후 **main `638ed77a` 병합**. 이 문서는 현재 상태만 기록하며 이후 docs main 커밋으로 SHA는 바뀝니다. PR별 상세 검사는 [Git 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/STATUS.md)과 Actions를 확인합니다.

## 한눈에 보기

| 구분 | 현재 수락/차단 |
| --- | --- |
| 저장소 | **Private**, 독립 HUFS One AI 학생 정보 탐색·개인화 팀 프로젝트. 공식 HUFSAbility 개편/학교 운영 아님 |
| 코드 | TypeScript/Zod·Fastify/API·React/Vite·추천/학업 순수 코어·합성 데모/권한 검증, 오프라인 CLOVA wire와 AI 비용 원장 main |
| PR | **OPEN 14**: #150/#166 Draft; UI #151/#152/#154/#155 충돌(#152 P2 REQUEST_CHANGES); #160~#165·#167·#168 리뷰/통합 대기. **#156/#157/#158/#159 MERGED**. #168 현 HEAD CI 3/3 PASS; 최신 HEAD 비작성자 승인·필수 CI·스택 검증 후만 코드 병합. [GitHub](https://github.com/ot4562-glitch/HUFS-One-AI/pulls) 우선 |
| 이슈 | **OPEN 34 / CLOSED 7** (기능 전체 게이트 미완료이므로 상위 이슈 임의 종료 없음) |
| 담당자별 전수 | [WORKSTREAMS의 34건 원장](docs/WORKSTREAMS.md): **심민성 17 · 이의상 11 · 김채윤 2 · 박준영 2 · 이서연 2**. 주관 정확히 1명/이슈, 미배정·중복 0. 공동 담당 11건은 기존 assignees 보존하고 GitHub 본문에 주관/협업 분리 |
| 공개·운영 | **RELEASE_BLOCKED** — [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) Private Git 자료 게시/권한 감사 및 [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 실제 OIDC/TLS/PG/NCP/권한 E2E 미완료 |

## 2026-11-03 최신 PR 리뷰·병합 (최신 HEAD 기준)

| PR | 검증·리뷰·병합 판정 |
| --- | --- |
| [#153 메뉴 매니페스트](https://github.com/ot4562-glitch/HUFS-One-AI/pull/153) | **MERGED `9b5cb81a`**. 이의상 HEAD `959dc302`의 비작성자 심민성 APPROVED·합성/일회용 PG/Chrome CI **3/3 SUCCESS**. 중앙 매니페스트 소비·원래 HUFSAbility 메뉴 오활성화 제거·360px 키보드 합성 범위만 완료. [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)·[#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) 하위 [x], 상위 OPEN |
| [#151 정정 비교 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/151) | **COMMENT 리뷰 / merge conflict / 미병합**. 기존 HEAD CI 3/3 성공; #153 뒤 공통 UI/e2e 충돌 재기반 후 최신 HEAD 재검증 필요. 실제 revision 발견·비합성 API #119 미연동 |
| [#152 이중전공 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/152) | **REQUEST_CHANGES (P2)**. `doubleMajorView`가 `overlap.rowImpacts`의 원소 구조를 검증하지 않아 잘못된 null/비객체 응답이 런타임 오류를 일으킬 수 있음. Zod/원소 검증·음성회귀와 #153 후 충돌 재기반/새 HEAD CI·재리뷰 필수 |
| [#154 수강계획 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/154), [#155 What-if UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/155) | **COMMENT 리뷰 / merge conflict / 미병합**. 각각 기존 HEAD CI 3/3 성공. `App.tsx`·`main.tsx`·`graduationPage.tsx`·e2e·styles 중복 수정, #152의 P2 해결 포함한 **동시 UI 통합** 후 재리뷰 필요. 실 owner API/RulePack 연결은 별도 |
| [#156 NCP 설치·미리보기](https://github.com/ot4562-glitch/HUFS-One-AI/pull/156) | **MERGED `2e39c86a`** — HEAD `6a26e8f`의 qamarrchae 새 독립 APPROVED·CI 3/3 SUCCESS·미해결 요청 없음 후 squash. SSH-only 합성 Preview 도구만 수락; PowerShell plan-only 실행 PASS, 실 SSH/UFW/NCP 운영은 NOT_RUN |
| [#157 P0 provider 권한 선행](https://github.com/ot4562-glitch/HUFS-One-AI/pull/157) | **MERGED `7ac5a06c`**. HEAD `93817f24` 김채윤 새 독립 APPROVED + 합성 계약/일회용 PG/Chrome CI 3/3 PASS 뒤 squash main. 승인된 입력·동의·rights 재조회 RLS만 수락, 실 Provider/운영 자료권리·인증 종단/배포 아님 |
| [#158 SETTLED 결과](https://github.com/ot4562-glitch/HUFS-One-AI/pull/158) | **MERGED `6e2b57de`** — HEAD `fb135017`의 qamarrchae 새 독립 APPROVED·CI 3/3 SUCCESS·미해결 요청 없음 후 squash. SETTLED 결과 저장/RLS·철회 제거 하위만 수락; 실 source rights·현재 세션은 executor에서 재검증 필요 |
| [#159 Laya 스케줄러](https://github.com/ot4562-glitch/HUFS-One-AI/pull/159) → [#161 별도 프로세스](https://github.com/ot4562-glitch/HUFS-One-AI/pull/161) | #159 **MERGED `638ed77a`** (김채윤 독립 승인·3/3 CI). #161 **OPEN, base main, HEAD `a7ea62a`**, 비강제 2-parent merge로 #159 중복 없이 고유 9파일만 남김, [TASK-00 #41608060598](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41608060598)·[Chrome #41608060548](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41608060548) **3/3 PASS**, 새 HEAD 독립 승인 대기. Windows Ollama GGUF 421M 합성 분류 3/3은 Linux ONNX 322M/cgroup 실증 아님 |
| [#160 Raster/OCR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/160) → [#165 Provider 실행](https://github.com/ot4562-glitch/HUFS-One-AI/pull/165) → [#167 BETA HTTP DI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/167) | #160의 이전 `af844271` qamarrchae 승인 후 #156/main과 CI sparse allowlist 충돌 발견. **새 HEAD `a741e5b`로 비강제 merge**, `/infra/ai/`와 `/infra/ncp/` 모두 보존; 원래 raster/worker/OCR 소스·테스트·lockfile 변경 0줄, 고유 11파일 유지. Windows raster **79 PASS**·CI allowlist **12 PASS**, 동일 새 HEAD [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41619213173)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41619213197) **필수 CI 3/3 SUCCESS**, 새 HEAD 독립 재승인 대기. 부모 main 병합 후만 #165 재정렬/CI/승인, 이후 #167. 실제 권한·PG·Provider HTTP 종단 미연결 |
| [#162 Owner 이중전공](https://github.com/ot4562-glitch/HUFS-One-AI/pull/162) | **HEAD `4699269` / 13파일 / 미병합**. 기존 11개 API·DTO·시험 파일은 `02268e9` 승인본 그대로, CI 2파일만 보완해 기존 opt-in PG 4시험을 필수 job에서 실제 실행. **Owner SQL 4/4·전체 PG 46/46 PASS**, [PG job](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41620772715/job/125865599676); 동일 HEAD [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41620772715)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41620772727) **필수 CI 3/3 SUCCESS**. Windows typecheck·owner 단위/계약 20 PASS·CI 정책 12 PASS. qamarrchae 승인은 이전 `02268e9` 기준이라 새 HEAD 재승인 요청. 실 RulePack/학교 원본/운영 인증·API 등록 수락 아님 |
| [#163 빈 시연 프로필](https://github.com/ot4562-glitch/HUFS-One-AI/pull/163)·[#164 정정 원문 claim](https://github.com/ot4562-glitch/HUFS-One-AI/pull/164) | 독립 리뷰/필수 CI·PG 수락 범위 확인 후만 병합. 기존 일반 PG CI 성공을 각 별도 opt-in PG 시험의 실행 증거로 대신하지 않음. 운영·실자료·브라우저 종단 미완료 |
| [#166 비공개 배포 템플릿](https://github.com/ot4562-glitch/HUFS-One-AI/pull/166) | **Draft/RELEASE_BLOCKED 유지**, Nginx deny default/Loopback Compose/정적 security tests, synthetic·PG·Chrome **3/3 PASS**. 실제 Docker image build/서버/TLS/실 Google/NCP/자료권한 **NOT_RUN** |
| [#150 원본 provider/PG/Laya/owner 통합](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150) | **Draft / merge conflict / 미병합**. 83파일 복합 WIP `28128066`의 고유 기능을 #157~#167 독립/스택 PR로 분리. #145/#148 기존 main 중복은 이식하지 않음. 남은 provider concrete PG/platform composition·실 세션/OIDC·운영 배포를 #150 원본에서 직접 가져와 병합 금지 |
| [#134 빈 프로필 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134) | **CLOSED / 미병합**. 기존 합성 테스트는 main 기능 수락으로 승격하지 않음. #132의 고유 기능/권한 종단 별도 |
| [#145](https://github.com/ot4562-glitch/HUFS-One-AI/pull/145)·[#148](https://github.com/ot4562-glitch/HUFS-One-AI/pull/148)·[#131](https://github.com/ot4562-glitch/HUFS-One-AI/pull/131)·[#149](https://github.com/ot4562-glitch/HUFS-One-AI/pull/149) | **이전 main 병합 유지**. 오프라인 OCR wire·PG 비용 원장·합성 설정·WIS 로컬 CSV, 실자료/클라우드 서비스 수락 아님 |

**#149 이후에도 필요한 권리·연동:** [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) 실제 4인 학업/원본 권리와 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27) 파일별 WIS `(sourceUrl, savedArtifactSha256)` 승인 receipt·`.handoff.json` 안전 전달/인적 검증이 선행돼야 합니다. #149의 CSV 결과가 **학교 수집 허가나 실사용 인증을 만들지는 않습니다**.

**기존 main CI 증거:** #153의 원래 HEAD에서는 합성·일회용 PG·Chrome 3/3 SUCCESS였고 기존 #145/#148/#131/#149 병합 시점에도 통과 기록이 있다. 최신 문서 커밋의 CI 및 통합 실환경 시험은 별도 HEAD 확인. 이 결과는 합성 및 일회용 PG/Chrome 검증이고 실제 학교/클라우드 인증·과금·배포 실증이 아니다.

**기타 선행 하위 완료:** [#138](https://github.com/ot4562-glitch/HUFS-One-AI/pull/138) 사람 저장 WIS HTML 로컬 변환, [#147](https://github.com/ot4562-glitch/HUFS-One-AI/pull/147) 주·이중전공 구분/중복 인정 보류 학업 pure core, [#146](https://github.com/ot4562-glitch/HUFS-One-AI/pull/146) AI 인용 1글자 차단, [#142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142) 원격 브랜치 안전 분류 도구. 각각 main 병합됐으나 실제 원본 권리·졸업/지원/운영까지 완료 아님. 브랜치 실제 삭제 증거 0건.

**2026-11-03 현재 병합·승인:** #158 HEAD `fb135017`→main `6e2b57de`, #156 HEAD `6a26e8f`→main `2e39c86a`는 각각 **새 현 HEAD qamarrchae APPROVED·필수 CI 3/3·clean** 확인 후 squash 병합했다. #158은 SETTLED 결과 저장 하위, #156은 SSH-only 합성 Preview 도구만 수락. **OPEN PR 14 / 일반 이슈 OPEN 34·CLOSED 7**, #160→#165→#167·Owner/Laya 및 #168은 독립 승인/통합 대기, #150/#166 Draft·UI #152 P2/충돌 유지. #46/#61/#89와 고정 수락률 불변.

**운영 API 선행 구현:** [#168 인증 PG 조립](https://github.com/ot4562-glitch/HUFS-One-AI/pull/168) HEAD `dd2c205`은 서버 전용 `createPostgresGoogleAuth`로 기존 세션 저장·공유 시도 제한·BETA 승인/철회 정책을 연결한 **3파일 미병합 선행 구현**이다. 명시적 pool/key/code-exchange만 받으며 production 진입점·통합 차단은 유지한다. 합성 서명 JWT→HTTP→일회용 PG→새 factory 세션 복원·replay·만료/철회·CSRF/logout·공유 제한 시험은 [PG CI](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41618576582/job/125858129068) **43/43 PASS**. 같은 HEAD의 합성 계약·PG·Chrome 필수 CI **3/3 SUCCESS**. qamarrchae 현 HEAD 독립 승인 대기이며 실 Google/OTP 발송·운영 PG/TLS/NCP/Provider 종단 수락 아님.

**이전 HEAD `0eceae7`의 로컬 실패 보존:** Windows Node 24.14.0 `npm run check`는 2,006 PASS / 42 SKIP / 1 FAIL(변경하지 않은 Linux cgroup 경로 fixture `laya-pressure.test.ts:17`); typecheck·API/web build·auth 26 tests PASS. 기존 보존 checkout privacy는 **163/165 PASS·2 FAIL, 보호 경로 6개**; 원문 열람/복사 없음. 이 수치는 해당 로컬 checkout 검사이며 현재 main 전체 성공으로 이월하지 않는다. #158 병합에 해당하는 #20/#27/#88 하위 항목만 새 [x]; 상위 종결 0, 고정 수락률 불변.

## 역할과 고정 수락 게이트

[TEAM_PROGRESS](docs/TEAM_PROGRESS.md)의 **고정 12칸(4명)·운영 5칸(이서연)** 분모에 맞는 증거 수락률이다. 코드량·PR 개수·개인 성과·제품 완성률과 같지 않으며 이번 오프라인/합성 PR 병합만으로 출시/실데이터 게이트를 [x]로 바꾸지 않는다.

| 담당 | 게이트 | 현재 주 병목 |
| --- | --- | --- |
| **심민성** `ot4562-glitch` | **7/12 · 58.3%** | 실 Google OIDC/학교메일, 운영 TLS·PG·NCP, #46 원본 Git 게시권리, 실 UI·provider 종단, 독립 평가 #61 |
| **이의상** `uisang2004-maker` | **9/12 · 75.0%** | #153 하위 메뉴 main 수락; #152 P2·#151/#154/#155 충돌 통합, #124/#141 11영역 대응·실 스크린리더/4인 검증 |
| **김채윤** `qamarrchae` | **7/12 · 58.3%** | 독립 사람 gold **확인 0/200**(#61), 기관 원본 권리/자격/실출처 추천·정책 승인 |
| **박준영** `taewangim-alt` | **8/12 · 66.7%** | #138/#147/#149 합성·로컬 코드 병합 완료; 공식 RulePack/중복 인정·동의된 실수강·소유자별 검수와 학업 UI 종단 미완료 |
| **이서연** `lhh42001` | **NCP 운영 1/5 · 20.0%** | 계정·크레딧·IAM/VPC/TLS/quota·실호스트 CPU/비용/반납 실증(코딩 업무 **0건**) |

**담당 범위 불변:** 모든 NCP 관련 OCR/HCX SDK, HTTP·예산·Laya/worker/OS·CI·Docker/IaC **코드 소유 심민성**([#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88), [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)); **이서연은 NCP 비코드 운영 #12/#22만**. 실자료 제공 4인 범위와 코드 담당 배정은 별개.

## 즉시 풀어야 할 진척 병목 (코드·외부증거 구분)

1. **코드 통합/P0:** #157/#148/#158 권한·원장·결과 하위는 main. **#160 최신 HEAD 독립 승인 후 main 병합 → #165 고유 diff 보존 재정렬·새 HEAD CI/승인 → #167 순서**, 이후 최소 PG 연결 어댑터/합성 Provider 종단 검증. #161~#164·#168도 각 독립 승인 필요. #150 83파일 Draft 직접 병합 금지.
2. **UI 통합/P1:** [#152](https://github.com/ot4562-glitch/HUFS-One-AI/pull/152) `rowImpacts` 원소 타입 미검증 P2 REQUEST_CHANGES 해소. 이의상이 최신 main과 #151/#154/#155의 공통 App/main/graduationPage/e2e/styles를 누락 없이 안전 통합, 새로운 HEAD CI+승인.
3. **운영 진입점/P0:** [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27) 현재 `APP_ENV=production` fail-closed. 실 OIDC/JWKS·외대메일 소유/OTP·초대/CSRF·영속 PG/RLS·동의 철회·direct IP/익명 정적 asset 차단·비합성 Owner API consumer 연결 전 throw 제거 금지.
4. **사람·외부근거/P0:** [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 보호 원본 6경로/기존 privacy 2 FAIL, [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61) 독립 인간 gold 0/200, [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)/[#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22) 별도 승인된 NCP 비용/호스트 실측은 코드 PR로 완료할 수 없음.
5. **출시 보안/P0:** [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 실 Google·학교메일·TLS/CDN/direct IP/KR Geo/동의 철회/실자료 권리 전 RELEASE_BLOCKED 유지. #156은 SSH-only 합성 Preview, #166은 실행 불가 Draft ingress.

**완료 마킹 기준:** 일반 이슈 OPEN 34 / CLOSED 7. #157의 Provider 권한/RLS 및 #159의 Laya OFF scheduler/pressure **하위 완료만** #20/#88/#143/#23/#27에 [x]로 기록. #153 메뉴 정본화 하위는 #124/#141에 계속 [x]. 고정 게이트 7/12 등 수치는 변경하지 않음.

## 풀리지 않은 보안·실증 게이트

- **Private Git #46:** 과거 Git 이력 보호 감사 **178/180 PASS·2 FAIL** 보고, 별도 `check:privacy`는 WIP 체크포인트에서 **146/148 PASS·2 FAIL**. 분모 다른 검사이며 **두 검사 모두 2개 실패 해소 안 됨**. 추적 보호 원본 6경로의 최초 게시·팀 공유/재배포·현재 동의와 기관 권리를 확인하지 않았다. 원문 열람/재게시/이력 rewrite 없음.
- **추천 #61:** 40×5 = 200 합성 초안/담당자 자체 검토가 있다고 해서 **독립 사람 gold 200/200은 아니다**. 확인된 독립 수락 **0/200**.
- **출시 #89:** 실 Google OIDC/JWKS·학교메일 소유확인·권한 철회·HTTPS/직접 IP/preview/CDN·영속 운영 PG, NCP 원가/서비스 이용권·실기기·기관 원본 권리 **NOT_RUN/미확정**. `RELEASE_BLOCKED` 불변.
- **모든 유료/실데이터:** 실제 NCP 서버 생성·과금 AI 호출·모델 다운로드·실학생/학교 자료 외부 전송·공개 배포는 별도 사용자 승인 전 금지. 결함 있는 Draft PR을 운영 코드로 승격하지 않는다.

현재 PR 작업/병합 규칙은 [PR_WORKFLOW](docs/PR_WORKFLOW.md), **34개 열린 이슈와 7개 닫힌 이슈 전수·주관 책임 원장**은 [WORKSTREAMS](docs/WORKSTREAMS.md), 상세 고정 게이트는 [TEAM_PROGRESS](docs/TEAM_PROGRESS.md)에서 확인한다.
