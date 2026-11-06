# HUFS One AI — 현재 구현·병합·수락 상태 (2026-11-06)

> **정본:** GitHub `main`/정확한 commit SHA·Actions·[운영 인수 #276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276). 프로젝트 범위 승인은 `OWNER_CONFIRMED_APPROVED`. **실계정/실서버/요금·실자료 운영·공식 학칙 검증을 수행했다는 뜻이 아니며, 실제 공개 서비스는 `RELEASE_BLOCKED`**다.

## 현재 코드 반영

| 영역 | 현재 `main`에 있는 것 | 아직 하지 않은 것 |
| --- | --- | --- |
| 웹/인증 | React/Vite 주요 메뉴·합성 시연, BETA 세션별 화면, Fastify·Zod·Google OIDC/학교메일·세션/CSRF 서버 코드 | 실제 Google/OIDC·학교메일 계정·NCP 도메인/HTTPS 연계·현장 브라우저 수락 |
| DB/권한 | 7개 기본 SQL 역할·확장 기능·FORCE RLS/CAS·동의/철회·운영 private factory/배포 뼈대 | 실제 관리형 PG role/CA TLS, migration 적용·backups·복구·운영자 secret 주입 |
| 학생 수강·실자료 | `csv/` **Forms 1개 + 수강 CSV 4개 = 원본 5개** 복구·Git blob SHA 불변 확인, 학생별 private intake API와 BETA 본인 UI 코드 [#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277) | 실제 4명 Forms↔수강파일↔로그인 BETA actor 인증·동의/rights/owner registry·운영 런타임 연결, SQL 적재/Readback·인적 확인; 학수번호 176행 중 132행 미확인 |
| 학업·개설 전망 | 학점 원장·RulePack/What-if 합성 코어, 과거 **정규 8학기** 역사 창·`NOTICE_ONLY` 보수 판정·`forecast-offering-v2` [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) | 공식 학칙·등가/학수번호·개설 원문·실사용자별 수기 검산·실UI 소비 [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11)/[#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) |
| 추천·경험·AI | 조건/마감·SourceRevision·예산/권한, 경험 선택→AI 후보→학생 승인 합성 HTTP, **40공고+10공지 코퍼스 분포 감사 및 경험→승인 추천 신호** [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) | 실 source rights·코퍼스 revision chain 보강·UI #258 연동·실모델 청구·실학생 피드·사람/기관 인수 |
| NCP·운영 | VPC/host Terraform plan·SSH 합성 preview·systemd/롤백·private container/API·배포 계획, 비전공자 설치 가이드 3종 | 실제 NCP 계정·호스트 생성·VPC/SSH·도메인/TLS·배포·요금/성능/복원 **NOT_RUN** |

## PR·리뷰·병합 결과

- 오너 분할 PR **[#267](https://github.com/ot4562-glitch/HUFS-One-AI/pull/267) → #268 → #269 → #270 → #272 → #273 → #274 → #275**, BETA CSV UI **[#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277)**: `main`에 **MERGED**. 종전 대형 [#264](https://github.com/ot4562-glitch/HUFS-One-AI/pull/264)는 분할 대체로 **CLOSED / NOT MERGED**.
- [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) (박준영): **APPROVE 리뷰 + MERGED**, 합병 commit [`5a36a38`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/5a36a38494d03e36c7d7f4b1b4cf274963d49004), PR HEAD `76523ce`.
- [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) (김채윤): **APPROVE 리뷰 + MERGED**, 합병 commit [`48134da`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/48134dae3b16157ebcc294f744c320fdd64a115c), PR HEAD `2442ca0`.
- **2026-11-06 코드 통합 기준 commit `48134da`**에서 GitHub Actions **4/4 SUCCESS**: [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752742), [Chrome 합성 E2E](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752741), [NCP IaC offline](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752743), [Pages 합성 preview](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752761). **현재 문서 커밋 후에는 새 HEAD의 CI 결과를 다시 확인할 것.**
- 리뷰 승인과 합성 CI는 **실제 학교·학생·서버·유료 공급자 실행도, 독립 사람 Gold도 아님**. 메모·테스트를 섞어 PASS로 표시하지 않는다.

## 이슈 판정(2026-11-06)

| 이슈 | 상태 | 이유 |
| --- | --- | --- |
| [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259) 추천 경험 신호 순수 코어 | **CLOSED completed** | PR #279의 한정된 순수 코어 완료. 실제 UI·실자료는 #258/#276 |
| [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 추천 P0 | **OPEN / 부분 완료** | 40+10 합성 감사 완료, 독립 Gold·정정/성능·실근거 남음 |
| [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) 학업 P0 | **OPEN / 부분 완료** | 8학기/NOTICE_ONLY 코어 완료, 실원본·RulePack·UI 남음 |
| [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | **OPEN** | UI/접근성·커리어 화면 인수는 동료 담당 |
| [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 학업 경험 연계 | **OPEN** | 공식 증빙·공유 경계/교차 검토 별도 |
| [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) | **OPEN** | 비코드 NCP 계정·비용·권리/운영 근거 별도 |
| [#255](https://github.com/ot4562-glitch/HUFS-One-AI/issues/255) 제안 | **OPEN** | 여러 팀 트랙의 총괄 |
| [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) 운영 통합 | **OPEN / 본선진출 이후** | 실제 NCP/Google/DB/학생 4인/모델/복구·사용자 인수 미실행 |
| #252·#253·#257 | **CLOSED** | 과거 작업/후속 이관. 운영 완료가 아님 |

## 상태 용어

`TESTED_SYNTHETIC`은 합성 자동 테스트의 범위 내 PASS, `NOT_RUN`은 미실행, `NOT_MEASURED`는 미측정, `CONFIGURATION_REQUIRED`는 실제 계정·자격증명·도메인/권한 구성 미완료, `NEEDS_REVIEW`·`UNKNOWN`은 확인 보류다. **프로젝트 전체의 실서비스는 `RELEASE_BLOCKED`.** 독립 사람 Gold 평가는 이번 작업 범위에서 제외됐지만 완료로 인정하지 않는다.

## 설치 가이드와 원본 보호

1. [비전공자 NCP 서버 개설](docs/BEGINNER_NCP_SERVER_SETUP.md)
2. [NCP 제품·Codex·Claude Code 설치](docs/BEGINNER_NCP_PRODUCT_AND_AGENTS.md)
3. [제품 구조·동작 원리](docs/BEGINNER_PRODUCT_ARCHITECTURE.md)
4. [실운영 런타임](docs/PRODUCTION_RUNTIME.md) · [소스/권리](docs/DATA_GOVERNANCE.md) · [운영 실행 증거](docs/OWNER_TRACK_RELEASE_EVIDENCE_20261106.md)

`csv/` 기존 5개는 **원본 내용·이름·경로를 무단 삭제/변경/이동/재인코딩 금지**, CI에 고정된 blob SHA와 공개 배포 파일 제외 정책 유지. 실제 정보주체의 법적 삭제/철회는 별도 현행 권리 검사에서 우선.
