# HUFS One AI | 현재 상태 (2026-11-05 검증)

> 현황 정본. 정확한 코드 검증 SHA와 PR/CI 근거는 아래 표를 따른다. 이후 문서 전용 커밋은 코드 검증 대상과 구분한다. [PR](https://github.com/minseong-hufs/HUFS-One-AI/pulls) · [정본 이슈](https://github.com/minseong-hufs/HUFS-One-AI/issues) · [인적 인수](docs/HUMAN_ACCEPTANCE_GATE_20261104.md) · [고정 게이트](docs/TEAM_PROGRESS.md).

## 2026-11-05 구현분 종결·실인수 승계 (최신 상태)

- **정본 GitHub 이슈 13건 OPEN** 확인: 기존 #61/#123/#132/#133은 사용자의 범위 분리 요청에 따라 **PR #220의 코드·합성 검증 납품분만 CLOSED/COMPLETED** 처리했다. 이 종료는 해당 이슈의 원래 인적·원본·기기·실운영 수락 체크박스 달성을 의미하지 않는다.
- **후속 OPEN [#221](https://github.com/minseong-hufs/HUFS-One-AI/issues/221):** 추천 독립 사람 gold **0/200**·미디어/시간 **0/32**, 동아리/EMPTY 비작성자 기기·스크린리더, 실제 4인 권리·계정 대조/공식 RulePack·#46 연계. **후속 OPEN [#222](https://github.com/minseong-hufs/HUFS-One-AI/issues/222):** 승인된 실 NCP 스테이징, 실제 Google/PG/TLS·OCR/HCX·기능별 UI→API→DB·복구/요금과 #12/#89 운영 수락. 중복 체크 대신 현장 영수증을 연결한다.
- [제품 기능 활성화 런북](docs/PRODUCT_ACTIVATION_RUNBOOK_20261105.md)은 **로컬 합성 → NCP 계획 → 승인 후 비공개 프리뷰 → 추가 운영 코드/검증 → D03 출시 승인**을 구분한다. 현 main 운영 모드 보호로 **한 번의 명령만으로 전 기능 운영 서비스가 기동되지는 않는다.** 실 원본/유료 API/NCP apply·도메인·공개는 실행/승인한 적 없음. **RELEASE_BLOCKED 유지**.
- #220 병합 후 동일 보존 로컬 worktree에서 별도 AI 재실행: 평가 **38**, #123/#132/#133 API·클라이언트 **57**, 40×5 코퍼스 **21**, 합계 **116 PASS / 0 FAIL**. 원본/fixture byte 20+12 확인. 이 후속 QA의 Node 22.22.1은 package floor 22.22.2 미만으로 **공식 출시 CI 통과를 대신하지 않음**. [검증 기록](https://github.com/minseong-hufs/HUFS-One-AI/pull/220#issuecomment-6646455317); 실제 인적 서명 0은 불변.

## 1. GitHub와 CI

| 항목 | 확인한 결과와 근거 |
| --- | --- |
| main 코드 통합 기준 | [`d4d6874c6d59929cdabb6a0e74adccb9eeb1ef69`](https://github.com/minseong-hufs/HUFS-One-AI/commit/d4d6874c6d59929cdabb6a0e74adccb9eeb1ef69), #220 merge. 검증 HEAD `8eb7730a100bafe5514d1dddedd88144ed60b3e2`와 최종 파일 diff **0개**. 이후 문서 전용 커밋과 구분 |
| 열린 PR / 일반 이슈 | **기존 PR 정리 후 일반 이슈 13건 OPEN** (2026-11-05 직접 검색). #61/#123/#132/#133 CLOSED=코드 납품 완료·인수 #221/#222로 승계; 이후 새로운 PR 개수는 GitHub 현재 검색으로 확인 |
| #217 / #218 | [What-if #217](https://github.com/minseong-hufs/HUFS-One-AI/pull/217) merge `6445fc4`, [동일교과 QA #218](https://github.com/minseong-hufs/HUFS-One-AI/pull/218) merge `8e0efb5` 선행 통합 확인. 각 수정 HEAD의 3종 CI 성공 |
| #219 | [PR](https://github.com/minseong-hufs/HUFS-One-AI/pull/219), HEAD `1bcf820823ffe10829c3c64457c8e06e9f9b7787` → merge `1181d0f77fb1a05d5ffd787f4e900a4e7480f269`. [최종 자동 COMMENT](https://github.com/minseong-hufs/HUFS-One-AI/pull/219#pullrequestreview-5777800975). 병합 전 [TASK-00](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41937263215)·[Chrome](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41937263210)·[NCP](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41937263224) **3/3 SUCCESS** |
| #219 병합 후 | merge SHA의 [TASK-00](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41938792380)·[Chrome](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41938792289)·[NCP](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41938792240) **3/3 SUCCESS** |
| #220 | [PR](https://github.com/minseong-hufs/HUFS-One-AI/pull/220), HEAD `8eb7730a100bafe5514d1dddedd88144ed60b3e2` → merge `d4d6874`. [최종 자동 COMMENT](https://github.com/minseong-hufs/HUFS-One-AI/pull/220#pullrequestreview-5778026456). 같은 HEAD의 [TASK-00](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41941124556)·[Chrome](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41941124587)·[NCP](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41941124549) **3개 workflow / 5개 job SUCCESS** |
| #220 시험 범위 | 일반 Vitest **290파일 / 3003 PASS**, PG opt-in **9파일 / 89 SKIP**. 별도 실제 일회용 PG에서 **6파일/73 PASS + 3파일/16 PASS**. TypeScript·API/web build·evaluation compile/CLI/fixture·publication/익명 경계 검사 성공. Chrome 기본20 tests + 기존 demo9 checks + EMPTY/동아리8 checks 성공 |
| #220 평가 도구 | 신규 5파일 **38 PASS**, CLI/HTML **6 PASS**, PNG/HTML20쌍·시간12건 **CANONICAL_BYTES_VERIFIED**. 추천 사람 gold **0/200**, 미디어/시간 사람 판정 **0/32**. synthetic 서명·라틴 bitmap·로컬 core 측정과 실제 인적/외부 provider 수락을 구분 |
| 후속 main 실행 | #220 merge SHA의 [TASK-00](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41941973164)·[Chrome](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41941973104)·[NCP](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41941973263) 및 이후 문서 커밋별 최종 상태는 [main Actions](https://github.com/minseong-hufs/HUFS-One-AI/actions?query=branch%3Amain)에서 확인. 위 확정 PASS 표시는 명시한 검증 SHA의 결과 |
| 공개 운영 | **RELEASE_BLOCKED**. 코드 병합은 실제 로그인·운영 PG/NCP/TLS·자료별 권리·독립 사람/기기 인수 또는 유료 실행을 승인하지 않음 |

**회귀 수정:** #219의 선택 SQL pool lifecycle/TLS 검증 우회, #220의 ADMIN 신원과 학생 권한 분리, 비동기 quota를 기다리지 않고 workspace를 저장하던 통합 결함, 잘못된 테스트 옵션·철회 뒤 화면 재조회 시점을 확인했다. quota pending/거절/오류에서 저장 0, 승인 뒤 200 및 거절/오류의 429/503을 검증한다. 동아리 Chrome은 철회된 PNG 직접 URL 차단과 **명시적 새로고침 뒤** 상세 제거를 검증하며 실제 자동 focus 전환·스크린리더 인수를 대신하지 않는다.

**이번 통합 결정:** 사용자가 요청한 실패 수정·리뷰·병합 유지관리에 따라 수정된 코드를 통합했다. #217/#218의 선행 병합을 확인했고 #219/#220도 정확한 HEAD의 결함 수정·자동 독립 검토·CI를 근거로 처리했다. 자동 COMMENT는 **비작성자 사람 APPROVED가 아니다**. 일반 독립 리뷰 정책을 변경하거나 실제 배포·자료권리·유료 실행을 승인하지 않는다. **RELEASE_BLOCKED** 유지.

## 2. main에 반영된 코드와 경계

- **API/인증/DB (#219):** OIDC code-exchange/PKCE, OTP/SMTP 포트, 기본 7개와 활성 확장 SQL 역할의 TLS/role·startup/shutdown, 분산 demo quota. 검증되지 않은 선택 platform SQL 포트 13개는 런처에서 거부한다. loopback-only와 production 차단을 유지한다.
- **AI/Source (#220):** 네 AI task의 결과/근거·UI 인용, 취소 후 신규 미발송 예약 정리, 승인 egress 재확인, 이미지 및 bounded PDF 원본/페이지 근거의 불변 저장·검수/검색 연결. 실제 provider/worker host/자료 권리 인수는 별도다.
- **owner/시연 (#220):** private intake plan/preview/apply·현재 권한/preview hash·4-owner 원자 CAS, 독립 EMPTY workspace/RESET, 합성 자산·발표 가이드 및 Chrome 시나리오. ADMIN 신원 파싱과 BETA owner/REVIEWER 권한을 분리한다. 비동기 quota 거절/장애 전에 workspace 저장을 차단하는 통합 회귀를 포함한다.
- **동아리 게시 (#220):** 영속 PG CAS/FORCE RLS·ADMIN 생성/승인/수정/철회·BETA 읽기/인증 포스터와 실제 AI 생성 PNG 1개를 연결했다. [생성 기록](docs/GENERATED_CLUB_POSTER_20261105.md). 인적·실기관 승인은 별도다.
- **독립 평가 도구 (#220):** 40공고×5프로필의 200초안과 고정 split을 보존하고 검토 패키지·오프라인 HTML·Ed25519 권한/서명 검증·append 원장·비교 지표를 구현했다. 별도 PNG/HTML20쌍·시간12건과 로컬 core benchmark가 있으며 사람 판정은 추천 **0/200**, 미디어·시간 **0/32**다. [실행 가이드](docs/INDEPENDENT_EVALUATION.md).
- **학업/추천/UI:** #216의 정정/계획·학업/Provider 화면과 코어, #217 What-if 계산/보수적 검토, #218 동일교과 속성 회귀. #220은 degreePath/track·문서별 SHA·AREA_SPREAD/GROUP_CHOICE 및 보수적 What-if, WIS/원본 receipt·권한 재검증을 확장했다. 공식 RulePack·실제 원장·독립 정답/보조기기 인수는 별도다.
- **품질/릴리스:** publication·현재/과거 Git 메타데이터·API/TASK/entrypoint inventory·npm license/CycloneDX 검사. 정적 UNKNOWN과 전체 native/Python/font/model/asset 권리 수락은 남는다.
- **NCP:** IaC·plan-only·SSH preview·설치/복구 자동화와 오프라인 mock. 실제 계정·지출·VM/SSH·요금/유료 OCR/HCX·실호스트 실측은 이 유지관리에서 실행하지 않았다.
- **자료:** 사용자 확인으로 공모전 참여 **5명 전원 동의**, **HUFSAbility 수집 허가 확보**. 실제 개인 원본 제공자는 **4명**이다. 공식 강의시간표 공개 교수명·강의명은 필요한 승인 범위로 관리하며 일괄 마스킹을 새 필수 게이트로 추가하지 않는다. 원본별 용도·게시/외부 전송·철회와 과거 Git 검수는 별도다.

## 3. 남은 구현·인수

| 우선 | 미수락 조건 | 정본 이슈 |
| --- | --- | --- |
| P0 | 실제 Google/학교메일·운영 PG CA/TLS·최소권한/영속 철회·복원, proxy client-IP/신뢰 헤더·다중 인스턴스와 공개 ingress 전용 진입점 | #27 #89 |
| P0 | 실제 출처별 사용/전송/표시 권리, 공식 RulePack·문서별 SHA·4인 owner binding/손계산·실제 API/UI | #19 #11 #221(구 #133) #20 |
| P0 | full private checkout 개인정보 검사·과거 Git history/clone/backup 접근·최초 게시 권리. 현재 보호 0과 조회 가능한 과거 6경로를 구분 | #46 |
| P0 | 독립 사람 gold **0/200**·미디어/시간 **0/32**, 공식 공고·실 OCR/외부 provider·공정한 정책 비교/실성능 | #221(구 #61) #10 #222(OCR/실환경) |
| P0 | 실제 NCP 계정/SKU/크레딧·비용승인·네트워크/TLS/직접IP·호스트/복구/청구·출시 서명 | #12 #89 #222 |
| P1 | 메뉴/역할별 상태·실스크린리더·학업/정정/빈 시연 전체 인수·발표 리허설, 동아리/AI 포스터·가상 ADMIN 게시/철회 흐름의 독립 인수 | #9 #119 #221(구 #132/#123) #222 |
| P1 | API/설계의 UNKNOWN mapping, 실제 worker/rootfs·CPU/RSS/OOM/p95·provider quota/billing 및 전체 의존성/자산 라이선스 | #8 #20 #89 |

#133의 과정/track별 RulePack·문서별 SHA·AREA_SPREAD/GROUP_CHOICE는 #220에서 계약/코어/소비자와 합성 반례 회귀를 확장했다. 실제 문서의 언어 속성·예외·적용범위와 공식 학칙 승인·4인 손계산 검수는 남아 있다.

고정 복합 게이트는 심민성 **7/12**, 이의상 **9/12**, 김채윤 **7/12**, 박준영 **8/12**, 이서연 **1/5**를 유지한다. 코드 진척으로 사람/운영 인수의 분자를 올리지 않는다. [남은 구현](docs/REMAINING_IMPLEMENTATION_20261104.md)과 [작업 책임](docs/WORKSTREAMS.md)을 함께 확인한다.

## 4. 정리 결정 (기존 15 OPEN 기록은 #220 직후 시점의 영수증)

**아래 문단은 #220 직후 원래 15개 OPEN 시점의 작업 기록이다.** 이후 2026-11-05에 네 이슈를 코드 납품분으로 종결하고 #221/#222를 열어 현재 13개 OPEN으로 전환했다. 변경된 인적/운영 수락 조건은 상단 신설 절을 따른다.

15개 정본 이슈의 본문을 실제 코드/동일 SHA 검사와 대조해 갱신했다. 기존 #11의 완료 표시 **2개**를 유지하고 검증된 코드 하위 항목 **37개**를 추가해 **완료 39개**로 정리했다. 미수락 복합 조건 **127개**와 담당자/라벨을 유지한다. 상위 이슈는 실제 인적·운영·권리 조건이 남아 **15개 OPEN**, 이번에 전체 완료로 새로 닫은 이슈는 **0개**다.

README·Architecture·Proposal·STATUS·PR 운영/역할/진척/인적 인수·시연/자료권리·구현 기록 등 **19개 Markdown 문서**의 현황을 일관되게 정리했다. 새 #61 평가 패키지·#123 AI 생성 포스터/가상 ADMIN·#133 학업 계약을 반영하며 해당 코드 완료를 공식 승인으로 확대하지 않는다.

- 사용자·기관·실환경 증거가 필요한 항목은 구체적 미수락 조건으로 남긴다. 참여 동의와 HUFSAbility 수집 허가가 없다고 반복하지 않는다.
- 역사적인 PR 숫자·CI·미병합 상태를 각 문서의 현재 설명에서 정리했다. 과거 근거는 Git 이력과 원래 PR/Actions에 보존한다.
- 실제 원본·비밀키·유료 자원·운영 배포를 변경하지 않았으며 AI 유료 실행/Laya 기본 OFF와 RELEASE_BLOCKED를 유지한다.

## 5. 2026-11-04 이슈 구조 재정리 (당시 OPEN 40 → 15; 최신 13은 상단 참조)

**확인:** 일반 이슈 47개 중 원래 CLOSED 7건은 변경하지 않고, 기존 OPEN 40건에서 **25건을 중복 통합 종료**, **15건 유지**했다. 15건 모두 본문에 완료 코드와 미완료 체크리스트를 분리하고 `enhancement`(해당하는 경우) 및 `duplicate`(통합 종료) 라벨을 적용했다. **주담당 한 명 11건**, 실제 공동 작업이 불가피한 **공동 배정 4건(#61/#123/#132/#133)**.

| 2026-11-04 당시 OPEN 정본 (해당 4건은 현재 CLOSED) | 주담당 | 이관한 이전 OPEN 이슈(당시 CLOSED) |
| --- | --- | --- |
| [#8 계약·CI](https://github.com/minseong-hufs/HUFS-One-AI/issues/8) | 심민성 | #18, #52, #199 |
| [#9 UI·메뉴·접근성](https://github.com/minseong-hufs/HUFS-One-AI/issues/9) | 이의상 | #51, #85, #124, #141, #200 |
| [#10 추천·품질](https://github.com/minseong-hufs/HUFS-One-AI/issues/10) | 김채윤 | #86, #201 |
| [#11 학업·규칙](https://github.com/minseong-hufs/HUFS-One-AI/issues/11) | 박준영 | #87, #202 |
| [#12 NCP 비코드 운영](https://github.com/minseong-hufs/HUFS-One-AI/issues/12) | 이서연 | #22 |
| [#19 Source/RAG](https://github.com/minseong-hufs/HUFS-One-AI/issues/19) | 심민성 | #21 |
| [#20 AI·Laya](https://github.com/minseong-hufs/HUFS-One-AI/issues/20) | 심민성 | #23 (Epic 범위는 #19/#20/#27/#89로 분산), #88, #143 |
| [#27 API·Auth·DB](https://github.com/minseong-hufs/HUFS-One-AI/issues/27) | 심민성 | #25, #39, #203 |
| [#46 개인정보·Git 감사](https://github.com/minseong-hufs/HUFS-One-AI/issues/46) | 심민성 | — |
| [#61 독립 gold](https://github.com/minseong-hufs/HUFS-One-AI/issues/61) | 심민성·이의상 공동 | — |
| [#89 NCP 코드·릴리스 게이트](https://github.com/minseong-hufs/HUFS-One-AI/issues/89) | 심민성 | #192 |
| [#119 UI 기능 종단](https://github.com/minseong-hufs/HUFS-One-AI/issues/119) | 이의상 | #80, #81, #82, #144 |
| [#123 가상 동아리](https://github.com/minseong-hufs/HUFS-One-AI/issues/123) | 이의상·심민성·김채윤 공동 | — |
| [#132 빈 시연 계정](https://github.com/minseong-hufs/HUFS-One-AI/issues/132) | 심민성·이의상 공동 | — |
| [#133 실제 4인 인입](https://github.com/minseong-hufs/HUFS-One-AI/issues/133) | 심민성·박준영 공동 | — |

**단일 주관 집계:** 심민성 9건, 이의상 3건, 김채윤 1건, 박준영 1건, 이서연 1건. 공동 담당은 중복으로 세지 않음. 기존 PR/이슈 댓글·편집 이력은 그대로 남고, **코드 CI 통과를 사람 승인이나 RELEASE_BLOCKED 해제로 계산하지 않는다**.

## 6. 설계/문서 요구사항 → 2026-11-04 당시 15개 정본 이슈 추적

> **현재 진행중 인수/배포 대상은 #221/#222로 변경됨.** 아래 원래 이슈 번호는 2026-11-04 구조설계 이력이며 #61/#123/#132/#133은 2026-11-05 구현분만 CLOSED다. 실기능/권리의 완료를 뜻하지 않는다.

2026-11-04 [Architecture](Architecture.md) A00–A19, [Proposal](Proposal.md), [설계형 RAG/AI 운영 계약](docs/TRUSTED_RAG_MEDIA_VERSIONING.md), [데이터 권리](docs/DATA_GOVERNANCE.md), [REVIEWER 접근](docs/REVIEWER_ACCESS.md), [HUFSAbility 화면 아틀라스](docs/HUFSABILITY_UI_COMPONENT_ATLAS.md), [NCP 운영](docs/NCP_OPERATIONS_2026.md), [인적·운영 인수](docs/HUMAN_ACCEPTANCE_GATE_20261104.md)를 현행 이슈와 대조했다. 이전 15개 이슈의 소제목만으로 누락되던 **A09 개설 전망, A10 경험·보관함, A02 선택기, A03 26/6열 ingest, A06 제품 AI 4종, A12 제작 자산, A15 정확도·성능, A16 팀 인계, A19 라이선스**의 구체적인 미수락 항목을 담당 정본 이슈에 체크리스트로 추가했다. 추가 이슈 생성 없이 **15건 OPEN** 유지.

| 설계 요구사항 | 추적할 현재 열린 이슈 | 구현 판단 |
| --- | --- | --- |
| A00~A01 제품 단계·인증과 문서/모듈 책임 | #8, #27, #89 | P0/P1만 현재 인수, P2 후속 |
| A02 5슬롯 선택기·동시성/철회 | #9, #8, #27, #133 | 20방향·10연속·동시탭·실자료 분리 명시 |
| A03 Forms 26열·수강 CSV 6열/4인 | #133, #27, #8, #46 | 안전한 Preview/Apply·동의/권리 분리 |
| A04 TopicCode·SourceClass·계약 | #8, #10 | 계약/실소비자 교차검증 |
| A05 기회·추천·개인화 | #10, #61 | 결정론, 제외 설명, P@3/nDCG@3/gold |
| A06 SafeLlmPacket·제품 4종·OCR/HCX/Laya | #20, #19, #11, #61 | 내부 RulePack 도구는 별도 선택/승인, 제품 5번째 AI 아님 |
| A07 개인공지·일정/미니 캘린더 | #10, #9, #27 | 학생/행정 마감 분리·권한/원문 |
| A08 졸업·3원장·학점/RulePack/계획 | #11, #119, #133 | 학교 규정 검수 없으면 UNKNOWN |
| A09 미래 개설 전망·공식 사건·rolling-origin | #11, #119, #27 | P1 20과목/과거8학기 우선·가정 분리 |
| A10 경험·승인태그·북마크·행동계획 | #9, #27, #119 | owner CRUD·시연 overlay와 실제 행동 구분 |
| A11 학생 화면·브랜드·접근성 | #9, #119, #132 | 11영역·76화면은 미지원 표시 포함 |
| A12 40기회·10공지·이미지 10 brief·20포스터/12시간 | #132, #61, #10, #123 | 실제 제작·검증 수량과 설계 목표 구분 |
| A13 DB·전체 API·버전·세션·RLS | #27, #8, #19 | 현재 route와 설계 v1 경로 차이를 추적 |
| A14 NCP/Google/학교메일·비공개 인터넷 공개 | #89, #12, #27, #46 | 실제 운영/비용 승인 전 BLOCKED |
| A15 평가·성능·독립 정답 | #61, #10, #11, #20, #89 | 목표 수치와 실측/NOT_RUN 구분 |
| A16 팀원 이해·인수/설명 | #89, #132 | 사람 리허설/서명은 코드로 대체 불가 |
| A17 TASK-00~17·TASK-14C 검증 | #8(계약 대응 확인), 위 각 기능 이슈 | 1건당 주관1인, 4건 공동 수락 예외 |
| A18 일정·최종 발표·승인 | #89, #132, #61 | 실제 결재·공모전 제출은 사람이 실행 |
| A19 OSS 라이선스·부속/원본 권리 | #89, #8, #46 | release artifact/SBOM/NOTICE/비밀 노출 검사 |

**이슈만으로 가능한 것과 불가능한 것:** 아래 15개는 **2026-11-04 당시** 작업 큐·담당자·수락 기준이며, 현재 미완료 인수는 **#221/#222와 여전히 OPEN인 11개 정본 이슈**에서 관리한다. 하지만 구현 시 [AGENTS](AGENTS.md)·담당 [Architecture](Architecture.md) 조항과 **현재 코드·테스트**를 읽어야 한다. 이슈를 체크했다고 계약/CI/권리·실환경 증거가 자동 충족되지 않는다. P2 확장(전교생·학교 DB/공식 SSO·앱스토어/푸시·완전 오프라인·고급 시간표 최적화)과 선택형 `.ics`·RulePack 작성 보조는 **명시 승인 전 현재 필수 구현으로 간주하지 않는다**. 단위 코드 완료·운영 배포·개인정보/출처·독립 인적 수락을 혼동하지 않고 #46/#221/#222/#89 `RELEASE_BLOCKED`를 유지한다.

