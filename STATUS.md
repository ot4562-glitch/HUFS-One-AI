# HUFS One AI — 현재 구현·병합·수락 상태 (2026-11-06)

> **정본:** GitHub `main`/정확한 commit SHA·Actions·[운영 인수 #276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276). 프로젝트 범위 승인은 `OWNER_CONFIRMED_APPROVED`. **실계정/실서버/요금·실자료 운영·공식 학칙 검증을 수행했다는 뜻이 아니며, 실제 공개 서비스는 `RELEASE_BLOCKED`**다.

## 현재 코드 반영

| 영역 | 현재 `main`에 있는 것 | 아직 하지 않은 것 |
| --- | --- | --- |
| 웹/인증 | React/Vite 데스크톱 11개 참고 대분류 GNB/LNB·모바일 하단 5탭, 공통 헤더/합성 상단 계정·폼/지원보드/보관함 UI #304, BETA 서버측 OIDC/메일/세션/CSRF 코드 및 경험 3단계 합성 컴포넌트 #285 | 공개 Pages 합성 선택기는 실제 인증 아님; #297/#299 운영 학교 로그인·4명 분리/실자료, #284 `/experience` API/route, 실제 모바일/스크린리더 인수 #280 미완료 |
| DB/권한 | 7개 기본 SQL 역할·확장 기능·FORCE RLS/CAS·동의/철회·운영 private factory/배포 뼈대 | 실제 관리형 PG role/CA TLS, migration 적용·backups·복구·운영자 secret 주입 |
| 학생 수강·실자료 | `csv/` **Forms 1개 + 수강 CSV 4개 = 원본 5개** 복구·Git blob SHA 불변 확인, 학생별 private intake API와 BETA 본인 UI 코드 [#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277) | 실제 4명 Forms↔수강파일↔로그인 BETA actor 인증·동의/rights/owner registry·운영 런타임 연결, SQL 적재/Readback·인적 확인; 학수번호 176행 중 132행 미확인 |
| 학업·개설 전망 | RulePack/What-if 합성·8학기 관측·rolling-origin #278/#288, 독립 `AREA_SPREAD/GROUP_CHOICE` 참조모형·탐색 5만회 경계 #292, **`forecast-offering-v3`/교과동등성 미확인 행 보수 처리 #295** | **`COURSE_IDENTITY_API_CONNECTION='NOT_CONNECTED'`**: 132개 학수번호 미확인 실자료의 학업 API/화면 소비/실 학칙·4인 검증 #276/#282/#301; 판본별 `nextAttempts` 공식 매핑·#260 교차 리뷰 |
| 추천·경험·AI | 40공고/10공지 고정 합성 r1·승인 신호 #279, 정정/취소/연장 5-chain #286, 학사공지 r2 5종 SourceRevision/검증된 mock claim·clean HEAD 정규화 벤치 #293 | `recommendationReport` 별도 revision scenario 미연결; 경험 UI #258/#284 실 API, 외부 모델 실호출·캐시 이력 #302, 공식 출처·실사용자 #281 미완료 |
| NCP·운영 | VPC/host Terraform plan·SSH 합성 preview·systemd/롤백·private container/API·배포 계획, 비전공자 설치 가이드 3종 | 실제 NCP 계정·호스트 생성·VPC/SSH·도메인/TLS·배포·요금/성능/복원 **NOT_RUN** |

## 2026-11-06 최신 PR #292·#293·#295·#304 통합 — 현재 코드 기준

- **모두 병합:** [PR #292](https://github.com/ot4562-glitch/HUFS-One-AI/pull/292)(학업 독립 참조모형·탐색 예산) · [PR #293](https://github.com/ot4562-glitch/HUFS-One-AI/pull/293)(학사공지 SourceRevision/mock claim·clean HEAD 벤치) · [PR #295](https://github.com/ot4562-glitch/HUFS-One-AI/pull/295)(교과코드 미확인 원장/전망 `forecast-offering-v3`, API `NOT_CONNECTED`) · [PR #304](https://github.com/ot4562-glitch/HUFS-One-AI/pull/304)(공통 UI/발표 S04·공개 합성 Pages 자동배포 유지).
- 병합 commit: [#292 `e0a5b73`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e0a5b732c9e616e4eda7d98f722b291f3ea99efc) · [#293 `02e7d91`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/02e7d9160d643d7eac37af222a4cf17da1e375f6) · [#295 `81a9f53`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/81a9f531880073b1433408d213a4d9480176809a) · [#304 `5c17255`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/5c172552a8145cec61ac8f1729b60b1514fc965d).
- 네 PR의 각 **PR HEAD** GitHub Actions 4/4 SUCCESS를 확인하고, 사용자의 일괄 병합 지시에 따라 squash merge했습니다. GitHub 리뷰는 `COMMENT` 중심이며 독립 사람의 `APPROVED`가 아닙니다. 병합된 마지막 코드 `main` SHA는 [`5c17255`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/5c172552a8145cec61ac8f1729b60b1514fc965d)입니다. **이 뒤의 문서 커밋을 포함한 최신 SHA의 CI는 별도로 확인해야 하며 이전 PR HEAD 검사 결과를 전용하지 않습니다.**
- 본선 전 합성 완료 표시: #10 공지 revision/clean benchmark, #11 독립 원장 모델/교과 identity 순수 코어, #9/#298/#303 S04 Pages 기본 차단 분리, #297 자동 Pages 배포 유지. **어느 상위 이슈도 전체 완료 아님.**
- **현재 열린 24개 이슈**: 사전 기능/UX·비코드 #9/#10/#11/#12/#119/#255/#258/#260/#261/#284/#294/#296/#298/#300/#303 (15), 운영·인증·원본·실 AI #276/#297/#299/#301/#302 (5), 본선 이후 실수락 #280/#281/#282/#283 (4). 이전 정리된 중복 종료와 기능 완료는 별개.
- 실제 학교 인증·팀원 4명 개인별 데이터/학수번호 132개 공식 매핑·NCP/PG/CLOVA 실행·포스터/모바일/스크린리더 사람 인수는 `NOT_RUN/CONFIGURATION_REQUIRED` 또는 미완료입니다. 운영 제품은 `RELEASE_BLOCKED`이며, 공개 GitHub Pages는 **실자료·외부 AI 호출 없는 합성 시연**으로 `main` push 때 자동 배포를 계속합니다. 원본 `csv/` 다섯 파일은 내용·경로/이름·인코딩·추적 상태를 그대로 유지합니다.

## PR·리뷰·병합 결과

- 오너 분할 PR **[#267](https://github.com/ot4562-glitch/HUFS-One-AI/pull/267) → #268 → #269 → #270 → #272 → #273 → #274 → #275**, BETA CSV UI **[#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277)**: `main`에 **MERGED**. 종전 대형 [#264](https://github.com/ot4562-glitch/HUFS-One-AI/pull/264)는 분할 대체로 **CLOSED / NOT MERGED**.
- [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) (박준영): **APPROVE 리뷰 + MERGED**, 합병 commit [`5a36a38`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/5a36a38494d03e36c7d7f4b1b4cf274963d49004), PR HEAD `76523ce`.
- [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) (김채윤): **APPROVE 리뷰 + MERGED**, 합병 commit [`48134da`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/48134dae3b16157ebcc294f744c320fdd64a115c), PR HEAD `2442ca0`.
- **2026-11-06 코드 통합 기준 commit `48134da`**에서 GitHub Actions **4/4 SUCCESS**: [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752742), [Chrome 합성 E2E](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752741), [NCP IaC offline](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752743), [Pages 합성 preview](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752761). **현재 문서 커밋 후에는 새 HEAD의 CI 결과를 다시 확인할 것.**
- 리뷰 승인과 합성 CI는 **실제 학교·학생·서버·유료 공급자 실행도, 독립 사람 Gold도 아님**. 메모·테스트를 섞어 PASS로 표시하지 않는다.

### 2026-11-06 후속 PR #285–#289 코드 검토·통합

| PR | 코드·테스트 범위 | 리뷰/병합 및 잔여 |
| --- | --- | --- |
| [#285](https://github.com/ot4562-glitch/HUFS-One-AI/pull/285) | 경험 EVIDENCE→AI CANDIDATE→사용자 ACTIVE 합성 컴포넌트 | `COMMENT` 코드 리뷰, MERGED `7d85d32`; 라우트/실 API #284 OPEN |
| [#286](https://github.com/ot4562-glitch/HUFS-One-AI/pull/286) | 합성 정정 5-chain overlay/격리 순서 결정성, #201 합성 벤치 | `COMMENT` 코드 리뷰, MERGED `102a076`; 기본 보고서 r1·clean HEAD 재벤치 #293 완료, 별도 보고서 시나리오 #10 OPEN |
| [#288](https://github.com/ot4562-glitch/HUFS-One-AI/pull/288) | 0/n·NOTICE_ONLY·사건·20/200과목 구별 회귀 | `COMMENT` 코드 리뷰, MERGED `9680def`; 공식 개설 자료 #282 NOT_RUN |
| [#287](https://github.com/ot4562-glitch/HUFS-One-AI/pull/287) | RulePack 영역 재분류 `nextAttempts`, `UNKNOWN` fail-closed | `COMMENT` 코드 리뷰, MERGED `664cdf4`; 실학칙/소비자 #11/#282 OPEN |
| [#289](https://github.com/ot4562-glitch/HUFS-One-AI/pull/289) | 원장 속성 10개+커버리지 지도 | `COMMENT` 코드 리뷰, #287과 AGENTS 안내문을 모두 보존한 충돌 해결 commit `82eb760`; 해당 HEAD 4/4 Actions SUCCESS 후 **MERGED** [`8bc27d5`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/8bc27d54c833ac2d4c9c3633e887063eeda5cca8) |

**검증 경계:** #285–#289 각각의 원래 PR HEAD에서 Actions 4/4 SUCCESS, #289 충돌 해결 HEAD `82eb760`에서도 4/4 SUCCESS를 확인했습니다. 마지막 코드 병합 `main` [`8bc27d5`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/8bc27d54c833ac2d4c9c3633e887063eeda5cca8)과 문서가 반영된 최종 HEAD의 Actions는 **별도 확인**해야 합니다. AI 보조 `COMMENT` 리뷰는 작성자 아닌 독립 **사람** `APPROVED`가 아닙니다. 이번 병합은 사용자의 열린 PR 일괄 리뷰·병합 요청에 따른 코드 통합으로, 실학생·기관·NCP 현장·Gold 인수가 아니며 `RELEASE_BLOCKED` 유지. 원본 `csv/` 다섯 개는 변경하지 않았습니다.

### 추가 UI 리디자인 [#290](https://github.com/ot4562-glitch/HUFS-One-AI/pull/290) — `main` MERGED

- 팀원 UI 변경 21파일: A11 디자인 계약·11개 대분류 GNB/142px 배너/230px LNB, 합성 홈 P001/공고 행/브라우저 회귀, 미지원 메뉴 비링크 안내. PR HEAD `1239a06` 4종 GitHub Actions SUCCESS, **병합 commit [`6863866`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/686386646654b2b64f8ba2333c0c285982976f9d)**. 실제 학교 기능 구현/실기기 NVDA/학생 권리 시험은 아닙니다. [본선 전 UI #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)에 합성 범위 완료, 전체 이슈 OPEN. 본선 후 현장 UI는 #280.
- 당시 UI 통합 SHA `6863866` 및 새 문서 커밋의 Actions는 해당 SHA별로 확인해야 합니다. 이전 #285–#289의 4/4 PASS를 무분별하게 이식하지 않습니다.

## 협업 이슈 전/후 분리 (2026-11-06)

| 담당 | 본선 진출 전 — 계속 진행 | 본선 진출 이후 — 실제 운영/실자료 수락 |
| --- | --- | --- |
| 이의상 UI/접근성 | [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실 BETA UI·모바일/스크린리더/학업·경험 종단 |
| 김채윤 추천/공지 | [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 합성 코퍼스·정정/성능(순수 코어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료) | [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) 실제 허가 출처·추천 정확성 주장 방지/운영 실측 |
| 박준영 학업 | [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 합성/교차 검토; #260 PR #262 정책/테스트 완료, 소비자 리뷰는 미완료 | [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) 공식 RulePack·4인 학업 원장·8학기 개설 실증 |
| 이서연 비코드/운영 | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 계정·비용·권리 사전검토/문서 | [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) 실 NCP 계정·청구/복구/반납·실원본 이용권 검수 |

**공통 원칙:** 본선 전 이슈의 합성 개발·사전 검토는 **OPEN**, 본선 이후 이슈는 **OPEN/NOT_RUN**이며 실제 NCP·SQL/AI/비밀키/운영자 구성과 실서비스 통합은 오너 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)이 총괄합니다. 본선 전 이슈 완료가 본선 이후 실서비스 인수 완료는 아닙니다. 원본 `csv/` 5개는 수정·삭제하지 않고 운영/배포/CI 번들에 포함하지 않습니다. 독립 사람 Gold는 현재 범위에서 제외되며 PASS 아님.

- 기존 이슈 [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)·[#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10)·[#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11)·[#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)·[#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119)·[#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258)·[#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260)·[#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261)는 제목을 **`[본선진출 전]`로 수정**, 실행 가능한 합성/사전 계획 체크리스트를 남김. 이관 전 내용은 접힌 기록으로 보존.
- 협업자 4명에게 **[#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280)·[#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281)·[#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282)·[#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283)**를 **`[본선진출 이후]`** 이슈로 생성하고 원담당자에게 각각 배정. 모두 **OPEN**; 실제 인수 `NOT_RUN`.
- [#255](https://github.com/ot4562-glitch/HUFS-One-AI/issues/255)는 기획 상위 제안 **OPEN**, [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)은 기술 오너의 **본선 이후 실환경 운영 통합 OPEN**. [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)은 PR #279 순수 코어만 `CLOSED completed`, 나머지 소비자/운영 검증은 #280/#281/#276. 과거 #252·#253·#257은 이관/종료.


## 상태 용어

`TESTED_SYNTHETIC`은 합성 자동 테스트의 범위 내 PASS, `NOT_RUN`은 미실행, `NOT_MEASURED`는 미측정, `CONFIGURATION_REQUIRED`는 실제 계정·자격증명·도메인/권한 구성 미완료, `NEEDS_REVIEW`·`UNKNOWN`은 확인 보류다. **프로젝트 전체의 실서비스는 `RELEASE_BLOCKED`.** 독립 사람 Gold 평가는 이번 작업 범위에서 제외됐지만 완료로 인정하지 않는다.

## 설치 가이드와 원본 보호

1. [비전공자 NCP 서버 개설](docs/BEGINNER_NCP_SERVER_SETUP.md)
2. [NCP 제품·Codex·Claude Code 설치](docs/BEGINNER_NCP_PRODUCT_AND_AGENTS.md)
3. [제품 구조·동작 원리](docs/BEGINNER_PRODUCT_ARCHITECTURE.md)
4. [실운영 런타임](docs/PRODUCTION_RUNTIME.md) · [소스/권리](docs/DATA_GOVERNANCE.md) · [운영 실행 증거](docs/OWNER_TRACK_RELEASE_EVIDENCE_20261106.md)

`csv/` 기존 5개는 **원본 내용·이름·경로를 무단 삭제/변경/이동/재인코딩 금지**, CI에 고정된 blob SHA와 공개 배포 파일 제외 정책 유지. 실제 정보주체의 법적 삭제/철회는 별도 현행 권리 검사에서 우선.
