# HUFS One AI — 현재 구현·검증·후속 인수

> **현행 상태: 2026-11-08 (Asia/Seoul).** 과거 2026-11-07의 통합 이력은 [보관본](docs/archive/STATUS_20261107.md)에 보존했습니다. 이슈·PR 개수는 이 시점의 GitHub 상태로 검증하며, 이후 변경은 [Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues) · [PRs](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)에서 재확인합니다.

**제품 승인:** `OWNER_CONFIRMED_APPROVED`. **실서비스 출시:** `RELEASE_BLOCKED`. 합성 CI/일회용 PostgreSQL 테스트와 실제 학교·학생·출처 이용권·사람 인수·운영 NCP/HCX 실행은 별도 검증 단계입니다. 팀 고정 역할 이슈 #355–#359는 읽기 전용입니다.

## 1. 이번 코드 리뷰와 병합 — 2026-11-08

| PR | 코드 변경/이슈 | main squash SHA | 검증 및 수락 범위 |
| --- | --- | --- | --- |
| [#391](https://github.com/ot4562-glitch/HUFS-One-AI/pull/391) | #363 CampusAssist receipt TTL/NaN·비동기 만료 | [`3fa8f3c`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/3fa8f3ce6a819382c5e349d768ce0837e0396be9) | HEAD TASK-00/Chrome/NCP SUCCESS; 코드 버그 수정 |
| [#392](https://github.com/ot4562-glitch/HUFS-One-AI/pull/392) | #369 percent-encoded 공고/공지 ID·잘못된 경로 방어 | [`736a129`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/736a1294371a5fc983ba55be96bb01bda9b3eaba) | HEAD TASK-00/Chrome/NCP/Pages SUCCESS; 추가 browser-history 회귀는 이번 문서 정리 PR에서 검증 |
| [#393](https://github.com/ot4562-glitch/HUFS-One-AI/pull/393) | #376 중복 취업통계 행 격리; #377 철회·만료 국제학생 안내 체크리스트 보류 | [`307ad29`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/307ad29b5422a664405cf698e95526859cacc1cd) | HEAD TASK-00/Chrome/NCP/Pages SUCCESS; 순수 코어 |
| [#394](https://github.com/ot4562-glitch/HUFS-One-AI/pull/394) | #378 npm read-only 취약점 감사 CI | [`85de975`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/85de975d5102ba7f95d2b598c8e518ee5d5c92db) | HEAD 신규 audit+TASK-00/Chrome/NCP SUCCESS; 실제 해당 lockfile High/Critical 0건 |
| [#395](https://github.com/ot4562-glitch/HUFS-One-AI/pull/395) | #374 일시적 503 사용자 수동 재인증·기존 쓰기 재실행 금지 | [`234d072`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/234d072ac8c292316851f5f653faa1a2ca23033b) | HEAD TASK-00/Chrome/NCP/Pages SUCCESS; 실제 다중 탭 사람 QA 별도 |
| [#396](https://github.com/ot4562-glitch/HUFS-One-AI/pull/396) | #367 명시적 CampusAssist 운영 소스 포트 주입(첫 단계) | [`be2e856`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/be2e8566fd64717753e32441f75f3a8de8fa6d29) | HEAD TASK-00/Chrome/NCP SUCCESS; 실제 소스/운영 구현은 `NOT_CONNECTED`, #367 OPEN |

6건은 **작성자 본인 계정 `ot4562-glitch`의 GitHub COMMENT 리뷰** 및 사용자의 명시적 병합 지시로 통합했습니다. 이 COMMENT는 독립 사람 `APPROVED`가 아닙니다. 병합 직후 main SHA의 별도 운영/사람 인수 성공을 주장하지 않습니다. [전체 검토 기록](docs/REVIEW_AND_ISSUE_AUDIT_20261108.md) · [PR 규칙](docs/PR_WORKFLOW.md).

같은 날 이미 병합됐던 원인 수정: [#383](https://github.com/ot4562-glitch/HUFS-One-AI/pull/383) (#364), [#385](https://github.com/ot4562-glitch/HUFS-One-AI/pull/385) (#365), [#384](https://github.com/ot4562-glitch/HUFS-One-AI/pull/384) (#370/#371), [#387](https://github.com/ot4562-glitch/HUFS-One-AI/pull/387) (#380), [#388](https://github.com/ot4562-glitch/HUFS-One-AI/pull/388) (#379), [#389](https://github.com/ot4562-glitch/HUFS-One-AI/pull/389) (#373 활동만), [#390](https://github.com/ot4562-glitch/HUFS-One-AI/pull/390) (#381 API 경계만). 각각의 코드 범위와 남은 부문 인수를 분리합니다.

## 2. 열린 PR: 변경 요청 3건

| PR | 차단 결함 (최신 HEAD 미수정) | 결과 |
| --- | --- | --- |
| [#361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | FAQ 문서 간 citationId 충돌, 답/근거 문장 부정 극성 혼동 | `CHANGES_REQUESTED` 유지, 병합 보류 |
| [#372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | OCR 한 줄 다중 기간 무시, 발급처 부분문자열 오인, PII 마스킹 결함 | `CHANGES_REQUESTED` 유지, 병합 보류 |
| [#386](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386) | 중복 requirement/experience ID로 폐기된 출처가 후보에 결속, 보호 특성 오탐 | `CHANGES_REQUESTED` 유지, 병합 보류 |

## 3. 열린 이슈 — 코드 결함과 실증 인수 분리

동일 날짜의 완료 정리 이후 **OPEN 26건**: 고정 역할 **5건(#355–#359, 변경 금지)**, 공식자료 요청 **1건(#360)**, 추가 기능 **13건(#339–#341, #343–#352)**, 미해결 기술/보안 결함 **7건**으로 구분합니다. 날짜/버전이 바뀌면 GitHub를 다시 검색해야 합니다.

| 미해결 이슈 | 다음 검증 / 담당 경계 |
| --- | --- |
| [#362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362) | 공개 저장소에 추적 중인 기존 CSV 5개: 게시 동의·재식별·권리/포크 범위 비공개 평가. 원본 변경·삭제·히스토리 강제 재작성 금지 |
| [#366](https://github.com/ot4562-glitch/HUFS-One-AI/issues/366) | 장학/멘토/상담/NCS/배지/학습/통계/국제학생 10개 순수 엔진과 서명 커서: 실제 owner API·DB·UI 소비자 없음 |
| [#367](https://github.com/ot4562-glitch/HUFS-One-AI/issues/367) | #396 포트 조립은 구현, 실제 승인 출처/rights·revocation/FAQ 모델 비용, 미연결 UI, BETA E2E 미구현 |
| [#373](https://github.com/ot4562-glitch/HUFS-One-AI/issues/373) | #389 활동 출처 충돌 격리는 해결, FAQ 문서 간 권리/동일 판본 충돌 검증은 남음 |
| [#375](https://github.com/ot4562-glitch/HUFS-One-AI/issues/375) | 경험↔교과 identity 코어의 실제 API·DB·UI/현재 동의·이수 원장 연결·철회 미구현 |
| [#378](https://github.com/ot4562-glitch/HUFS-One-AI/issues/378) | #394 read-only audit CI 구현·최초 실행 성공, Dependabot alerts/CodeQL 운영 설정 및 취약점 대응 절차 확인 필요 |
| [#381](https://github.com/ot4562-glitch/HUFS-One-AI/issues/381) | #390 API OCR 검증기 중복 ID 거부는 구현, 공통 `matchesImageSpan`·실 OCR 변환/DB 무결성 검증 미완 |

**완료 처리한 코드 결함:** #363, #364, #365, #369, #370, #371, #374, #376, #377, #379, #380. 이는 이슈의 **코드 재현·자동화 수정 범위**의 종결이지 학교·기관 실자료·인간 평가·NCP 출시 수락을 뜻하지 않습니다. 미실행 사람/운영 체크는 관련 기능 #339–#352, 자료 #360, 통합 #366/#367/#375와 별도로 추적합니다.

## 4. 현재 구현과 미수락

| 영역 | 코드/합성 근거 | 실제 연결·인수 상태 |
| --- | --- | --- |
| React 웹 / owner 인증 | 데스크톱 메뉴·모바일 5탭·합성 Pages, BETA owner UI, encoded-detail 및 일시 503 수동 재인증 | 실학교/개인 계정·기기/접근성 사람 시험 `NOT_RUN` |
| Fastify/PostgreSQL | 세션/CSRF, actor/RLS·CAS, 격리 PG 계약, 운영자 조립/확장·CampusAssist 선택적 포트 | 운영 SQL 역할/원문/권리·실시점 포트 `NOT_CONNECTED` |
| AI/추천/학업 | 13개 기능의 순수 코어·일부 전용 API, HCX-007/OCR/사람 검토 전 후보 정책 | 실모델 청구/과금/독립 Gold/공식 학칙/4인 사용자 원장 `NOT_RUN` |
| 데이터·보안 | 추적된 원본 CSV 5개 보존 계약, read-only npm advisory CI | 원본 공개 게시권/동의 검증 미완(#362); 외부 이력/포크 유출면 점검 필요 |
| 운영 | NCP IaC offline 계약·실배포 진입점과 계획 경로 | 실제 NCP 인스턴스/TLS/백업/복구/비용·보안 실증 `NOT_RUN`, `RELEASE_BLOCKED` |

2026-11-08 신규 audit PR [#394](https://github.com/ot4562-glitch/HUFS-One-AI/pull/394)의 실행에서 검사된 lockfile의 런타임 및 개발 의존성은 각 `high=0,critical=0`(그 외 심각도도 0)이었습니다. 이는 **그 실행 시점의 npm advisory 결과**이며 공급망 전체의 영구적 무취약 상태, GitHub Dependabot/CodeQL 활성화 또는 실서비스 취약점 수락을 의미하지 않습니다.

## 5. 다음 우선순위

1. 보안: #362 원본 공개 동의/게시권 비공개 조사 및 Git 기록 노출 평가, #381 OCR 공통 근거 충돌 해결, #373 FAQ 판본/권리 충돌 차단.
2. 코드/사용성: #361·#372·#386의 REQUEST_CHANGES 해결 및 독립 AI 교차 QA; #366·#367·#375 API/DB/화면의 실제 소비자 경로 구현.
3. 자료/실증: #360 공식 문서·포스터·rights·독립 Gold 확보, 실제 OIDC/메일/BETA 2명 이상·운영 PostgreSQL/NCP·비용·복구/백업·사람 수락 별도 기록. 승인이 있어도 자동 실행/출시 승인으로 해석하지 않습니다.

**현행 담당 정본:** [AGENTS.md](AGENTS.md) · [팀 역할](docs/WORKSTREAMS.md) · [이슈 배정](docs/ISSUE_ASSIGNMENT_PLAYBOOK.md). 고정 역할 #355–#359에 댓글/본문/상태 등 어떤 쓰기도 하지 않습니다. [보관된 이전 상태](docs/archive/STATUS_20261107.md).
