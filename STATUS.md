# HUFS One AI | 현재 작업 상태

> **2026-11-03 KST GitHub 확인본.** 기준 코드 `main 6efc53266e1486e8444313c3c3b167aecb44b344`(PR #131 병합). 이 문서는 **현재 상태만** 적고, 과거 리뷰/중간 HEAD/테스트 수치는 [Git 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/STATUS.md)과 각 PR에 보존합니다. 추가 문서 커밋으로 main SHA는 바뀔 수 있습니다.

## 한눈에 보기

| 구분 | 현재 수락/차단 |
| --- | --- |
| 저장소 | **Private**, 독립 HUFS One AI 학생 정보 탐색·개인화 팀 프로젝트. 공식 HUFSAbility 개편/학교 운영 아님 |
| 코드 | TypeScript/Zod·Fastify/API·React/Vite·추천/학업 순수 코어·합성 데모/권한 검증, 오프라인 CLOVA wire와 AI 비용 원장 main |
| PR | **OPEN 3**: [#134](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134) UI 충돌, [#149](https://github.com/ot4562-glitch/HUFS-One-AI/pull/149) 캠퍼스 검증 수정 요청, [#150](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150) owner WIP Draft/충돌 |
| 이슈 | **OPEN 34 / CLOSED 7** (기능 전체 게이트 미완료이므로 상위 이슈 임의 종료 없음) |
| 공개·운영 | **RELEASE_BLOCKED** — [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) Private Git 자료 게시/권한 감사 및 [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 실제 OIDC/TLS/PG/NCP/권한 E2E 미완료 |

## 이번 최신 PR 리뷰·병합

| PR | 실제 최종 상태·범위 |
| --- | --- |
| [#145 오프라인 OCR/HCX wire](https://github.com/ot4562-glitch/HUFS-One-AI/pull/145) | **MERGED `cade7c9b`**. HEAD `633d665` 김채윤 최신 HEAD 비작성자 APPROVED·합성/일회용 PG/Chrome CI **3/3 SUCCESS**. 직렬화·bbox/인용/usage 검사만 수락, 실제 네트워크·가격·원본 승인 아님 |
| [#148 PostgreSQL 비용 원장](https://github.com/ot4562-glitch/HUFS-One-AI/pull/148) | **MERGED `e102516`**. HEAD `54f09c6` 이의상·김채윤 비작성자 APPROVED·합성/일회용 PG/Chrome CI **3/3 SUCCESS**. 원자 비용/시도 예약·멱등/UNKNOWN_BILLING/kill switch 코드만; migration 적용/운영·실과금 아님 |
| [#131 BETA 설정 비교 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/131) | **MERGED `6efc532`**. HEAD `8254dc17` 과거 두 P2(route remount GET 경합·REVIEWER capabilities 장애→BETA 오분류) 수정, 심민성 비작성자 APPROVED·합성/PG/Chrome CI **3/3 SUCCESS**. 합성/역할 격리 UI, 실학교 로그인 아님 |
| [#134 빈 시연 프로필 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134) | **OPEN/충돌**. HEAD `eb376ca`, base를 #131 브랜치→`main`으로 전환했으나 GitHub `mergeable_state=dirty`(squash #131 중복/19파일). synthetic UI CI 3/3 성공 이력은 인정하되, 작성자 고유 diff 재기반·최신 HEAD 리뷰/CI 후 병합 |
| [#149 시간표 CSV 내보내기](https://github.com/ot4562-glitch/HUFS-One-AI/pull/149) | **OPEN/CHANGES_REQUESTED**. HEAD `ed93066`, CI 3/3 SUCCESS. `UNKNOWN` 캠퍼스를 `--campus SEOUL`로 근거 없이 확정하는 P2 수정·음성 회귀 필요. 원본 HTML·CSV 실제 Git 반입 없음 |
| [#150 owner 통합 WIP](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150) | **Draft/충돌/미승인**, HEAD `2812806`, 합성/일회용 PG/Chrome CI 3/3 SUCCESS. provider authority·bounded transport/취소/결과 저장, Laya/raster child worker, 이중전공·시연 API, 비공개 배포 템플릿 **제안 코드**. #145/#148/#131 병합 뒤 중복/충돌·비작성자 승인 0 → main 미병합 |

**main CI 재검증:** `cade7c9b`·`e102516`·`6efc532` 각 커밋의 GitHub **TASK-00(합성·PostgreSQL)와 Chrome push 워크플로 모두 SUCCESS**. 이 결과는 합성 및 일회용 PG/Chrome 검증이고 실제 학교/클라우드 인증·과금·배포 실증이 아니다.

**기타 선행 하위 완료:** [#138](https://github.com/ot4562-glitch/HUFS-One-AI/pull/138) 사람 저장 WIS HTML 로컬 변환, [#147](https://github.com/ot4562-glitch/HUFS-One-AI/pull/147) 주·이중전공 구분/중복 인정 보류 학업 pure core, [#146](https://github.com/ot4562-glitch/HUFS-One-AI/pull/146) AI 인용 1글자 차단, [#142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142) 원격 브랜치 안전 분류 도구. 각각 main 병합됐으나 실제 원본 권리·졸업/지원/운영까지 완료 아님. 브랜치 실제 삭제 증거 0건.

## 역할과 고정 수락 게이트

[TEAM_PROGRESS](docs/TEAM_PROGRESS.md)의 **고정 12칸(4명)·운영 5칸(이서연)** 분모에 맞는 증거 수락률이다. 코드량·PR 개수·개인 성과·제품 완성률과 같지 않으며 이번 오프라인/합성 PR 병합만으로 출시/실데이터 게이트를 [x]로 바꾸지 않는다.

| 담당 | 게이트 | 현재 주 병목 |
| --- | --- | --- |
| **심민성** `ot4562-glitch` | **7/12 · 58.3%** | 실 Google OIDC/학교메일, 운영 TLS·PG·NCP, #46 원본 Git 게시권리, 실 UI·provider 종단, 독립 평가 #61 |
| **이의상** `uisang2004-maker` | **9/12 · 75.0%** | #134 고유 diff 통합, #81/#82·#124/#141 UI, 실제 스크린리더·운영 4인 검증 |
| **김채윤** `qamarrchae` | **7/12 · 58.3%** | 독립 사람 gold **확인 0/200**(#61), 기관 원본 권리/자격/실출처 추천·정책 승인 |
| **박준영** `taewangim-alt` | **8/12 · 66.7%** | #149 캠퍼스 근거 오류 수정, 공식 RulePack·동의된 수강원장·owner 학업/UI 종단 |
| **이서연** `lhh42001` | **NCP 운영 1/5 · 20.0%** | 계정·크레딧·IAM/VPC/TLS/quota·실호스트 CPU/비용/반납 실증(코딩 업무 **0건**) |

**담당 범위 불변:** 모든 NCP 관련 OCR/HCX SDK, HTTP·예산·Laya/worker/OS·CI·Docker/IaC **코드 소유 심민성**([#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88), [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)); **이서연은 NCP 비코드 운영 #12/#22만**. 실자료 제공 4인 범위와 코드 담당 배정은 별개.

## 풀리지 않은 보안·실증 게이트

- **Private Git #46:** 과거 Git 이력 보호 감사 **178/180 PASS·2 FAIL** 보고, 별도 `check:privacy`는 WIP 체크포인트에서 **146/148 PASS·2 FAIL**. 분모 다른 검사이며 **두 검사 모두 2개 실패 해소 안 됨**. 추적 보호 원본 6경로의 최초 게시·팀 공유/재배포·현재 동의와 기관 권리를 확인하지 않았다. 원문 열람/재게시/이력 rewrite 없음.
- **추천 #61:** 40×5 = 200 합성 초안/담당자 자체 검토가 있다고 해서 **독립 사람 gold 200/200은 아니다**. 확인된 독립 수락 **0/200**.
- **출시 #89:** 실 Google OIDC/JWKS·학교메일 소유확인·권한 철회·HTTPS/직접 IP/preview/CDN·영속 운영 PG, NCP 원가/서비스 이용권·실기기·기관 원본 권리 **NOT_RUN/미확정**. `RELEASE_BLOCKED` 불변.
- **모든 유료/실데이터:** 실제 NCP 서버 생성·과금 AI 호출·모델 다운로드·실학생/학교 자료 외부 전송·공개 배포는 별도 사용자 승인 전 금지. 결함 있는 Draft PR을 운영 코드로 승격하지 않는다.

현재 PR 작업/병합 규칙은 [PR_WORKFLOW](docs/PR_WORKFLOW.md), 팀 담당/교차 의존은 [WORKSTREAMS](docs/WORKSTREAMS.md), 상세 고정 게이트는 [TEAM_PROGRESS](docs/TEAM_PROGRESS.md)에서 확인한다.
