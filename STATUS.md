# HUFS One AI — 현재 구현·병합·수락 상태 (2026-11-06)

> **정본:** GitHub `main`/정확한 commit SHA·Actions·[운영 인수 #276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276). 프로젝트 범위 승인은 `OWNER_CONFIRMED_APPROVED`. **실계정/실서버/요금·실자료 운영·공식 학칙 검증을 수행했다는 뜻이 아니며, 실제 공개 서비스는 `RELEASE_BLOCKED`**다.

## 현재 코드 반영

| 영역 | 현재 `main`에 있는 것 | 아직 하지 않은 것 |
| --- | --- | --- |
| 웹/인증 | React/Vite 주요 메뉴·합성 시연, BETA 세션별 화면, Google OIDC/학교메일·세션/CSRF 서버 코드, #285 경험 3단계 **합성 UI 컴포넌트** | #285 `/experience` 라우트·#284 실 Owner API 어댑터 미연결; 실제 Google/OIDC·학교메일·NCP HTTPS·현장 브라우저 인수 |
| DB/권한 | 7개 기본 SQL 역할·확장 기능·FORCE RLS/CAS·동의/철회·운영 private factory/배포 뼈대 | 실제 관리형 PG role/CA TLS, migration 적용·backups·복구·운영자 secret 주입 |
| 학생 수강·실자료 | `csv/` **Forms 1개 + 수강 CSV 4개 = 원본 5개** 복구·Git blob SHA 불변 확인, 학생별 private intake API와 BETA 본인 UI 코드 [#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277) | 실제 4명 Forms↔수강파일↔로그인 BETA actor 인증·동의/rights/owner registry·운영 런타임 연결, SQL 적재/Readback·인적 확인; 학수번호 176행 중 132행 미확인 |
| 학업·개설 전망 | 학점/RulePack·What-if 합성 코어·8학기 `forecast-offering-v2` #278, 판본 간 `areaMembership`/`nextAttempts` 보수 비교 #287, rolling-origin 부정 반례 #288, 원장 속성·경계/커버리지 지도 #289 | 교과코드·동등성 미확인 `UNKNOWN` 소비자 경로·#260 교차 리뷰, 공식 학칙/학생 4인·개설 원문 수기 검산·실 UI 인수 #11/#282 |
| 추천·경험·AI | SourceRevision·예산/권한, 40공고+10공지 분포/승인 신호 #279, 원본 40건 r1을 유지한 **별도 5 revision-chain 합성 overlay**·격리 정렬 수정 #286 | overlay의 평가 리포트 별도 연결, UI #258/#284 실제 API/추천 소비자 연동, 실출처 권리·모델 청구·학생 피드·사람/기관 인수 |
| NCP·운영 | VPC/host Terraform plan·SSH 합성 preview·systemd/롤백·private container/API·배포 계획, 비전공자 설치 가이드 3종 | 실제 NCP 계정·호스트 생성·VPC/SSH·도메인/TLS·배포·요금/성능/복원 **NOT_RUN** |

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
| [#286](https://github.com/ot4562-glitch/HUFS-One-AI/pull/286) | 합성 정정 5-chain overlay/격리 순서 결정성, #201 합성 벤치 | `COMMENT` 코드 리뷰, MERGED `102a076`; 기본 보고서 r1·clean HEAD 재벤치 필요 #10 |
| [#288](https://github.com/ot4562-glitch/HUFS-One-AI/pull/288) | 0/n·NOTICE_ONLY·사건·20/200과목 구별 회귀 | `COMMENT` 코드 리뷰, MERGED `9680def`; 공식 개설 자료 #282 NOT_RUN |
| [#287](https://github.com/ot4562-glitch/HUFS-One-AI/pull/287) | RulePack 영역 재분류 `nextAttempts`, `UNKNOWN` fail-closed | `COMMENT` 코드 리뷰, MERGED `664cdf4`; 실학칙/소비자 #11/#282 OPEN |
| [#289](https://github.com/ot4562-glitch/HUFS-One-AI/pull/289) | 원장 속성 10개+커버리지 지도 | `COMMENT` 코드 리뷰, #287과 AGENTS 문구 충돌을 **양쪽 보존 병합 커밋**으로 해소; 머지/CI 최신 상태는 PR 링크 확인 |

**검증 경계:** #285–#289 원래 PR HEAD에서는 각 4종 Actions가 SUCCESS였습니다. #289 충돌 해결 후 HEAD `82eb760`과 최종 `main`/문서 HEAD는 **각각 별도 CI 확인**이 필요합니다. AI 보조 `COMMENT` 리뷰는 작성자 아닌 독립 **사람** `APPROVED`가 아닙니다. 이번 병합은 사용자의 열린 PR 일괄 리뷰·병합 요청에 따른 코드 통합으로, 실학생·기관·NCP 현장·Gold 인수가 아니며 `RELEASE_BLOCKED` 유지. 원본 `csv/` 다섯 개는 변경하지 않았습니다.

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
