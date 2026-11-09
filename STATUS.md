# HUFS One AI — 현재 구현·검증·후속 인수

> **현행 상태: 2026-11-09 (Asia/Seoul).** 과거 2026-11-07의 통합 이력은 [보관본](docs/archive/STATUS_20261107.md)에 보존했습니다. 이슈·PR 개수는 이 시점의 GitHub 상태로 검증하며, 이후 변경은 [Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues) · [PRs](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)에서 재확인합니다.

**제품 승인:** `OWNER_CONFIRMED_APPROVED`. **실서비스 출시:** `RELEASE_BLOCKED`. 합성 CI/일회용 PostgreSQL 테스트와 실제 학교·학생·출처 이용권·사람 인수·운영 NCP/HCX 실행은 별도 검증 단계입니다. 팀 고정 역할 이슈 #355–#359는 읽기 전용입니다.

## 0. 전수 수정·병합 최신 스냅샷 (2026-11-09)

**실제 병합 15 PR(앞선 9 + 추가 6)**, 마지막 [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419) 문서/정책 PR 1개가 남은 시점의 기록입니다. #419 병합 시 이번 대상 OPEN PR 0. 확인된 이전 병합 9건은 #424/#420/#402/#403/#404/#409/#407/#408/#422, 직전 main SHA `6062230`입니다.

### 추가 병합 확인 6건

| PR | 검증·변경 범위 | GitHub 병합 SHA |
| --- | --- | --- |
| [#361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | FAQ 인용/긍·부정 극성 | [`569e9382d`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/569e9382dd15b536e95ab3fde055442529e7fecc) |
| [#372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | OCR 기관명 보수적 대조 | [`4e1a96204`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/4e1a962049d1a4c24475b0d69d542a35869e2411) |
| [#405](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405) | Node24 이슈 라우터 합성 검증 | [`c4628abe4`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/c4628abe485b9e19dcbf4c9de01e6411cd43ad1c) |
| [#406](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) | TypeScript 7 호환성 | [`4bc5968af`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/4bc5968af4ef765a161ce500a796e64b9ba44d6d) |
| [#410](https://github.com/ot4562-glitch/HUFS-One-AI/pull/410) | 상담 인증 source→API/UI | [`6354b2d62`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/6354b2d62f48ad493eb86838c4e1cc8e530f2dbd) |
| [#421](https://github.com/ot4562-glitch/HUFS-One-AI/pull/421) | CSV 과거 Git 메타데이터 진단 | [`ff0d31714`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/ff0d31714fc5ebce32a7bece2a0d3369579410bb) |

#361의 FAQ 긍·부정 서술어 검증, #372의 OCR 기관명 유사도 보수 처리, #410의 이름 없는 상담기관이 정상 상위 후보를 가리는 문제는 수정 커밋과 합성 회귀가 병합됐습니다. #372의 최종 HEAD는 `7655f8b`로 중간 수리 HEAD `5769a35`와 다릅니다. 과거 리뷰/CI와 최신 SHA를 구별해야 합니다.

### PR 리뷰 자동 검사 정책

소유자의 2026-11-09 지시로 `exact-HEAD independent approval` 자동 PR 검사를 중단하고 `.github/workflows/independent-pr-review.yml`을 **`workflow_dispatch(pr_number)` 수동 읽기 전용 감사**로 바꿉니다([#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419)). 에이전트는 코드·테스트·변경 요청을 수동 검수하고 팀원 교차 리뷰를 기본 요청하지만, 실제 `APPROVED`가 없는 사실은 그대로 기록합니다. 이번 일회성 소유자 병합 지시는 이후 자동 병합으로 확대되지 않습니다. 계약/빌드/보안/원본 보호 등 **실제 코드 CI는 유지**합니다. 활성 Ruleset 0건 관측과 branch-protection 상세 403으로 서버측 보호는 별도 미확인입니다.

### 열린 이슈 및 실제 운영 인수

- **OPEN 28건:** 변경 금지 역할 #355–#359 (5), 공식자료 #360 (1), 기능 #339–#341 및 #343–#352 (13), 기술/보안 #362/#366/#367/#373/#375/#378/#381 (7), 검토 절차 #416과 사용자 UX #418 (2).
- **#341:** FAQ 검색/인용 가드 코드 병합. 실제 공식 FAQ·HCX·독립 Gold 미인수.
- **#345/#366:** 상담 인증 source→API/UI와 추천 순위 수정 병합. 실제 기관 명칭/권리/실DB 원장은 미연결.
- **#346:** OCR 후보 추출·유사 기관명 격리·기본 가림 병합. 실제 CLOVA 및 실학생 자료·사람 검토는 미실행.
- **#362:** `csv/` 로컬 과거 메타데이터 진단 도구만 병합. **실자료 파일·Git 기록 불변**, 포크/과거 다른 경로/게시 동의는 UNKNOWN/NOT_VERIFIED.
- **#378:** TypeScript 7·github-script v9와 Node24 합성 이벤트 시험 병합. 실제 GitHub 라우팅 웹훅/Dependabot alerts 운영 인수 별도.
- **#416:** 리뷰 CI를 소유자 지시로 수동 감사로 조정. 과거 #399/#400/#401/#411의 사후 교차 검토 부채는 여전히 별도.
- 본인 배정 8건에서 고정 역할 #359 제외한 7건은 완전한 권리/실계정/운영 DoD 미충족으로 OPEN. 고정 역할 이슈 #355–#359에 어떤 쓰기도 하지 않았습니다.

**`OWNER_CONFIRMED_APPROVED`는 코드 작업 승인이지 실서비스 인수가 아닙니다. `RELEASE_BLOCKED` 유지.**


---

## 1. 1차 당시 PR 검토·병합 — 2026-11-09

| PR | 최신 검토 SHA / 내용 | HEAD 검증 | 최종 처리 |
| --- | --- | --- | --- |
| [#386 NCS/경험 의미 후보](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386) | `0fdb638` · 중복 requirement/experience ID 격리, 버전 digest 및 순서 반전 테스트 | TASK-00·Chrome·NCP·Pages·npm audit **5/5 SUCCESS**, 박준영 APPROVED·오너 재리뷰 APPROVED | **squash 병합** [`e8d3c9c`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e8d3c9c73849bec36b7fe686de2c56e6aa71c5b9); #347 기능 전체 OPEN |
| [#361 FAQ 검색/답변 가드](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | `72fc402` · 형용사 `없는`을 서술어 부정과 혼동하는 긍·부정 뒤집기 우회 | HEAD **5/5 SUCCESS**이나 해당 반례 미해결 | [`REQUEST_CHANGES`](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361#pullrequestreview-5820574395), **OPEN/미병합** |
| [#372 OCR 증빙 후보](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | `1798c55` · 서로 다른 발급처 이름을 유사도만으로 `SAME` 판단 | HEAD **5/5 SUCCESS**이나 해당 반례 미해결 | [`REQUEST_CHANGES`](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372#pullrequestreview-5820574572), **OPEN/미병합** |

#386의 AI 순수 코드·합성 테스트만 병합됐습니다. 실제 NCS 원장·인적 Gold·웹/API 통합은 `NOT_RUN/NOT_CONNECTED`이며 기능 #347은 완료가 아닙니다. #361/#372는 수정된 HEAD 반례·신규 CI·재리뷰 전까지 병합하지 않습니다. **병합 후 새로운 main SHA의 CI/실운영 통과를 이 표에서 주장하지 않습니다.** [11/09 검토 원장](docs/REVIEW_AND_ISSUE_AUDIT_20261109.md) · [11/08 병합/수정 이력](docs/REVIEW_AND_ISSUE_AUDIT_20261108.md).

## 2. 1차 당시 변경 요청 2건 (현재도 OPEN)

| PR | 남은 차단 결함 | 다음 행동 |
| --- | --- | --- |
| [#361 FAQ](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | `없(?!이)` 정규식이 `없는`을 부정으로 잘못 인식, 근거와 반대되는 학사 답변을 통과시킬 위험 | 인용·서술어 극성 검증 및 합성 반례 추가 후 재리뷰 |
| [#372 OCR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | 비슷하지만 다른 기관의 문자 유사도를 `SAME`으로 확정 | 유사 오타는 `ISSUER_UNCERTAIN`으로 보류, 별도 기관 구분 회귀 후 재리뷰 |

## 3. 1차 당시 열린 이슈 — 코드 결함과 실증 인수 분리

1차 감사 당시 **OPEN 26건**: 고정 역할 **5건(#355–#359, 변경 금지)**, 공식자료 요청 **1건(#360)**, 추가 기능 **13건(#339–#341, #343–#352)**, 미해결 기술/보안 결함 **7건**으로 구분합니다. 날짜/버전이 바뀌면 GitHub를 다시 검색해야 합니다.

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
2. 코드/사용성: #361 FAQ·#372 OCR·#386 AI 코어 병합 이후 공식 원장/실계정/사람 QA·#366/#367/#375 UI-API-DB 소비자 경로의 운영 인수와 #418 UX 회귀 확인.
3. 자료/실증: #360 공식 문서·포스터·rights·독립 Gold 확보, 실제 OIDC/메일/BETA 2명 이상·운영 PostgreSQL/NCP·비용·복구/백업·사람 수락 별도 기록. 승인이 있어도 자동 실행/출시 승인으로 해석하지 않습니다.

**현행 담당 정본:** [AGENTS.md](AGENTS.md) · [팀 역할](docs/WORKSTREAMS.md) · [이슈 배정](docs/ISSUE_ASSIGNMENT_PLAYBOOK.md). 고정 역할 #355–#359에 댓글/본문/상태 등 어떤 쓰기도 하지 않습니다. [보관된 이전 상태](docs/archive/STATUS_20261107.md).
