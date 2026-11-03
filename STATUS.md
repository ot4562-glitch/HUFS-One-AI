# HUFS One AI | 현재 작업 상태

> **2026-11-03 KST, 최신 GitHub 검증본 · 기준 main `b7acd949`.** 원본 #150은 83개 변경 경로를 보존·분리한 뒤 CLOSED/NOT MERGED. #156/#157/#158/#159/#160/#162/#163/#164/#168은 각 독립 수락 범위만 main에 병합됐습니다. 협업자 의사결정은 아래와 이슈 댓글이 정본이며, 실제 적용 코드·CI/리뷰는 항상 현재 PR HEAD로 다시 판단합니다. 이 문서 자체의 SHA 변경은 운영·출시 승인과 무관합니다.

## 한눈에 보기

| 구분 | 현재 수락/차단 |
| --- | --- |
| 저장소 | **Private**, 독립 HUFS One AI 학생 정보 탐색·개인화 팀 프로젝트. 공식 HUFSAbility 개편/학교 운영 아님 |
| 코드 | TypeScript/Zod·Fastify/API·React/Vite·추천/학업 순수 코어·합성 데모/권한 검증, 오프라인 CLOVA wire와 AI 비용 원장 main |
| PR | **OPEN 11**: 기술 #161/#165/#167/#169/#170/#171, 비공개 ingress Draft #166, UI #151/#152/#154/#155. #165→#167→#169 종속; #161 최신 main 충돌; UI #152 P2. #170 CI **4/4**(실 PG 6/6), #171 CI **3/3**(합성 2,153 PASS)이나 독립 승인 대기. #150은 CLOSED/NOT MERGED. [실시간 PR](https://github.com/ot4562-glitch/HUFS-One-AI/pulls) |
| 이슈 | **OPEN 34 / CLOSED 7** (기능 전체 게이트 미완료이므로 상위 이슈 임의 종료 없음) |
| 담당자별 전수 | [WORKSTREAMS의 34건 원장](docs/WORKSTREAMS.md): **심민성 17 · 이의상 11 · 김채윤 2 · 박준영 2 · 이서연 2**. 주관 정확히 1명/이슈, 미배정·중복 0. 공동 담당 11건은 기존 assignees 보존하고 GitHub 본문에 주관/협업 분리 |
| 공개·운영 | **RELEASE_BLOCKED** — [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) Private Git 자료 게시/권한 감사 및 [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 실제 OIDC/TLS/PG/NCP/권한 E2E 미완료 |

## 현재 PR·실제 병합 상태 (2026-11-03)

| 구분 | 확인된 결과 · 남은 게이트 |
| --- | --- |
| **main 병합·합성 하위 완료** | #156 SSH-only Preview `2e39c86a`, #157 Provider 권한 `7ac5a06c`, #158 SETTLED 결과 `6e2b57de`, #159 Laya OFF scheduler `638ed77a`, #160 Raster/OCR `60ba5f60`, #162 Owner double-major `46f11efa`, #163 EMPTY_DEMO `b7acd949`, #164 승인된 revision reader `f420c4e6`, #168 인증 PG 팩토리 `809c26fd`. **실 서비스/NCP 완료는 아님** |
| [#150 원본](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150) | **CLOSED/NOT MERGED**. 83경로 = 65 exact + 12 강화된 후속 + 6잔여 인수. 원본 HEAD/브랜치 보존; 미검증 고유 코드 무단 복제 금지 |
| [#165 Provider runtime](https://github.com/ot4562-glitch/HUFS-One-AI/pull/165) | OPEN, HEAD `e3e51d2`, CI 3/3 PASS; 비작성자 APPROVED는 이전 `1f23f27` 기준. 현재 HEAD 재승인/고유 diff 확인 후 검토 |
| [#167 HTTP DI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/167) | OPEN, HEAD `4fb29bf`, CI 3/3 PASS; 이전 P2 'PENDING인데 LIVE'를 코드·음성시험에서 수정. 과거 `CHANGES_REQUESTED`는 해결/새 리뷰 전 수락 아님. #165 이후 안전한 재정렬 필요 |
| [#169 Provider PG 종단](https://github.com/ot4562-glitch/HUFS-One-AI/pull/169) | OPEN, HEAD `3faaac2`, CI 3/3·격리 PG **56/56 PASS**, 별도 HTTP 프로세스·재시작/권한 철회 합성 시험 9건. default OFF·유료 호출 없음; **#165→#167→#169** 순차 수락 필요 |
| [#170 실제 SQL CI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/170) | OPEN, HEAD `6eb7c965`, CI **4/4 PASS**. 별도 PostgreSQL 18 loopback 서버에서 revision 승인/권리 철회 3건 + EMPTY_DEMO RLS/CAS 3건 = **6/6 실제 SQL PASS**. 최신 비작성자 승인/병합 대기 |
| [#171 Owner PG DI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/171) | OPEN, HEAD `1132c1fe`, CI **3/3 PASS**, 합성 2,153 PASS/53 SKIP 및 owner 통합 11/11 PASS. doubleMajor/demoProfile/revisionComparison 서버 선택적 주입; 최신 비작성자 승인/병합 대기 |
| [#161 Laya child](https://github.com/ot4562-glitch/HUFS-One-AI/pull/161) | OPEN, HEAD `a7ea62a`, 당시 승인·CI 3/3이나 **최신 main merge conflict**, 실 Linux cgroup/ONNX/호스트 CPU/RSS NOT_RUN |
| [#151/#152/#154/#155 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pulls?q=is%3Apr+is%3Aopen+author%3Auisang2004-maker) | UI 작성자 소유, 최신 main 충돌. #152 `rowImpacts` 원소 검증 **P2 REQUEST_CHANGES**; strict 입력/다중탭·현 owner API 소비·새 HEAD CI/승인 전 병합 금지 |
| [#166 배포 템플릿](https://github.com/ot4562-glitch/HUFS-One-AI/pull/166) | Draft/비공개 ingress 검토용. 실제 NCP·TLS·host/공개 서비스는 NOT_RUN; `RELEASE_BLOCKED` |

## 협업자 결정 및 인계 (이슈 댓글에 확정·코드 미완료는 별개)

- [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133): 학업 `degreePath/track`은 `curriculumVersion`과 분리하는 **additive vNext 계약**으로 설계. 다중 sourceDocument/조항 SHA·권리 연결, `AREA_SPREAD`/묶음 K-of-N/언어조건은 공식 조항·검증 전 **NEEDS_REVIEW**, 임의 자동판정 금지. 7+2 학수번호/교시 시각은 근거 미확정. 64개 로컬 저장본/2,499분반 **Git 밖 승인된 제한 전달**만.
- [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61): 레거시 `demo-snapshot.json`은 교체하지 않고 합성 5인 `demo-corpus-snapshots.json` 별도 버전 유지. 독립 사람 gold **0/200**; @uisang2004-maker 독립 라벨 검토·총괄 증거 수락 필요.
- [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141)·[#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124): 공개 5/24/4 메뉴 변경 금지. 로그인 관찰 6개는 별도 `observedAreas` 비활성/UNVERIFIED로 계약 검토 후만 UI 노출.
- [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119)·[#144](https://github.com/ot4562-glitch/HUFS-One-AI/issues/144)·[#81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81)·[#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82)·[#132](https://github.com/ot4562-glitch/HUFS-One-AI/issues/132): 이미 존재하는 `HufsOwnerApiClient`의 compare/checkStudyPlan/checkMajorWhatIf와 doubleMajor/EMPTY_DEMO PG 포트는 BETA owner `liveServices`에서만 명시적으로 소비. 공고의 두 **권한 승인 revision ID를 찾는 서버 경계는 미구현**; UI 강제 추정 금지. #152 strict negative fix 필수.
- [#123](https://github.com/ot4562-glitch/HUFS-One-AI/issues/123)·[#52](https://github.com/ot4562-glitch/HUFS-One-AI/issues/52)·[#86](https://github.com/ot4562-glitch/HUFS-One-AI/issues/86): 합성 동아리 API/캘린더 ID·확인필요/검증된 추천 이유 계약은 main 기반 사용; 권한·실자료·UI/운영 종단은 별도 수락.

**위 결정은 GitHub 댓글로 전달했으며 기존 API/계약에 없는 기능을 구현 완료로 취급하지 않습니다.**

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

## 다음 서비스 종단 병목 — 승인 대기와 독립 개발 분리

1. **P0 Provider 종단:** #165 runtime → #167 BETA HTTP → #169 PostgreSQL 세션·권한·원자 비용·SETTLED 결과·재시작 검증 스택을 각 최신 HEAD 승인/CI 후 순차 main 수락. 원격 NCP 호출·실 요금 없이 fake Provider만.
2. **P0 Owner UI↔API↔DB:** #170 실제 SQL CI와 #171 선택적 DI는 HEAD CI 완료·비작성자 리뷰 대기. 합성 브라우저 클라이언트와 실 owner 권한·학업 source를 연결하되, #119 두 revision 발견·#152 strict DTO·#151/#154/#155 UI 충돌은 분리하여 해결.
3. **P0 학업 계약:** #133의 `degreePath/track`·원문 다중 근거/복합 요건은 공식 검수 전 DRAFT/NEEDS_REVIEW만. 학업 RulePack·수강 코드/교시 근거를 근사해 READY로 만들지 않는다.
4. **P1 Laya와 UX:** #161 충돌 해결/새 CI/재승인 및 실 Linux cgroup/ONNX 실측은 별도 승인된 환경에서만. #141 observedAreas는 비활성 계약 PR, UI #152 P2 방어/작성자 통합이 선행.
5. **운영·인적 차단:** #46 보호 원본 6경로·privacy 2 FAIL, #61 독립 gold 0/200, #89 실 OIDC·학교메일·TLS/direct IP/PG/NCP 및 데이터 권리. 운영 배포/유료 호출/실자료 반입은 별도 사용자 승인 전 금지.

**완료 기준:** 일반 이슈 OPEN 34 / CLOSED 7, 부분 코드 병합과 공개 서비스/기관자료·인적 수락은 분리. `RELEASE_BLOCKED` 및 고정 팀 수락률은 변경하지 않는다.

## 풀리지 않은 보안·실증 게이트

- **Private Git #46:** 과거 Git 이력 보호 감사 **178/180 PASS·2 FAIL** 보고, 별도 `check:privacy`는 WIP 체크포인트에서 **146/148 PASS·2 FAIL**. 분모 다른 검사이며 **두 검사 모두 2개 실패 해소 안 됨**. 추적 보호 원본 6경로의 최초 게시·팀 공유/재배포·현재 동의와 기관 권리를 확인하지 않았다. 원문 열람/재게시/이력 rewrite 없음.
- **추천 #61:** 40×5 = 200 합성 초안/담당자 자체 검토가 있다고 해서 **독립 사람 gold 200/200은 아니다**. 확인된 독립 수락 **0/200**.
- **출시 #89:** 실 Google OIDC/JWKS·학교메일 소유확인·권한 철회·HTTPS/직접 IP/preview/CDN·영속 운영 PG, NCP 원가/서비스 이용권·실기기·기관 원본 권리 **NOT_RUN/미확정**. `RELEASE_BLOCKED` 불변.
- **모든 유료/실데이터:** 실제 NCP 서버 생성·과금 AI 호출·모델 다운로드·실학생/학교 자료 외부 전송·공개 배포는 별도 사용자 승인 전 금지. 결함 있는 Draft PR을 운영 코드로 승격하지 않는다.

현재 PR 작업/병합 규칙은 [PR_WORKFLOW](docs/PR_WORKFLOW.md), **34개 열린 이슈와 7개 닫힌 이슈 전수·주관 책임 원장**은 [WORKSTREAMS](docs/WORKSTREAMS.md), 상세 고정 게이트는 [TEAM_PROGRESS](docs/TEAM_PROGRESS.md)에서 확인한다.
