# HUFS One AI — 현재 구현·검증·후속 인수

> **현행 상태: 2026-11-09 (Asia/Seoul).** 과거 2026-11-07의 통합 이력은 [보관본](docs/archive/STATUS_20261107.md)에 보존했습니다. 이슈·PR 개수는 이 시점의 GitHub 상태로 검증하며, 이후 변경은 [Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues) · [PRs](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)에서 재확인합니다.

**제품 승인:** `OWNER_CONFIRMED_APPROVED`. **실서비스 출시:** `RELEASE_BLOCKED`. 합성 CI/일회용 PostgreSQL 테스트와 실제 학교·학생·출처 이용권·사람 인수·운영 NCP/HCX 실행은 별도 검증 단계입니다. 팀 고정 역할 이슈 #355–#359는 읽기 전용입니다.

## 0. 최신 2026-11-09 검수 — 아래 1차 기록보다 우선

**OPEN Issue 28 / OPEN PR 7 / 본인 배정 8 중 고정 역할 #359 제외 이행 대상 7.** 본선 이후 역할 이슈 #355–#359에 어떠한 쓰기도 하지 않았습니다. 본 검수에서 #424/#420/#402/#403/#404/#409/#407/#408/**#422 총 9개 PR 실제 squash 병합**. 이전 26개 이슈/2개 PR 기록은 1차 시점의 이력입니다.

### 실병합 9건

| PR | 변경 | merge SHA |
| --- | --- | --- |
| [#424](https://github.com/ot4562-glitch/HUFS-One-AI/pull/424) | 배지 그룹 간 활동 재사용 차단 | [850ba49](https://github.com/ot4562-glitch/HUFS-One-AI/commit/850ba49cd5f38967374b096b0ef4376ad2208b02) |
| [#420](https://github.com/ot4562-glitch/HUFS-One-AI/pull/420) | 장학/배지 준비 API/UI | [c73d8de](https://github.com/ot4562-glitch/HUFS-One-AI/commit/c73d8ded6df0c3b286df46c5bc0f60c39d33f61d) |
| [#402](https://github.com/ot4562-glitch/HUFS-One-AI/pull/402) | checkout v7.0.1 | [bec7805](https://github.com/ot4562-glitch/HUFS-One-AI/commit/bec7805f0ee755843d8930641599d3945708da03) |
| [#403](https://github.com/ot4562-glitch/HUFS-One-AI/pull/403) | upload-artifact v7 | [9ab5647](https://github.com/ot4562-glitch/HUFS-One-AI/commit/9ab5647e04b7f332833b59af3940670e92652616) |
| [#404](https://github.com/ot4562-glitch/HUFS-One-AI/pull/404) | cache v6.1.0 | [da6e3f7](https://github.com/ot4562-glitch/HUFS-One-AI/commit/da6e3f77176707dac4c726c63025bcecf5291e95) |
| [#409](https://github.com/ot4562-glitch/HUFS-One-AI/pull/409) | Fastify 5.12.8 | [966942c](https://github.com/ot4562-glitch/HUFS-One-AI/commit/966942ce688548663f721ea373c9f61eb29684c7) |
| [#407](https://github.com/ot4562-glitch/HUFS-One-AI/pull/407) | Postgres pg 8.23.1 | [e16319b](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e16319ba6aeb130493d798e46ff3a02eae34e382) |
| [#408](https://github.com/ot4562-glitch/HUFS-One-AI/pull/408) | jsdom 31 | [895f219](https://github.com/ot4562-glitch/HUFS-One-AI/commit/895f2191306a9a8f16326e66af68b0a49241a111) |
| [#422](https://github.com/ot4562-glitch/HUFS-One-AI/pull/422) | 6종 owner insights API/UI 통합 | [6062230](https://github.com/ot4562-glitch/HUFS-One-AI/commit/6062230952035e364fe54fdaf65ab56d7eca83c7) |

### 남은 PR 7건 (최신 HEAD CI·협업자 리뷰가 우선)

| PR | 다음 단계 |
| --- | --- |
| [#421](https://github.com/ot4562-glitch/HUFS-One-AI/pull/421) | CSV Git 메타데이터 경로 한계 명시 HEAD fb7ea01; 데이터/권리 담당자 리뷰·최신 CI 필요 |
| [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419) | 현재 상태/이슈/PR 감사 문서; 새 HEAD 독립 승인/CI 확인 필요 |
| [#410](https://github.com/ot4562-glitch/HUFS-One-AI/pull/410) | 상담 source→API/UI: 코어 랭킹 전 검증 기관 필터·중복 ID 격리 HEAD 39edd5c; 일반 CI SUCCESS, 동료 승인 필요 |
| [#406](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) | TypeScript 7 호환성 교정 HEAD 3282c42: 일반 CI 성공, 과거 변경 요청/독립 승인 미해결 |
| [#405](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405) | github-script v9: Node24 합성 opened/edited/manual dry_run 회귀 HEAD eca9ff5, Node24 CI test SUCCESS; 실제 workflow_dispatch·독립 승인 미확인 |
| [#372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | OCR 기관 오인 수정·기능 회귀 및 #422 이후 main 병합 충돌 해결 HEAD 5769a35; 새 CI/독립 재리뷰 필요 |
| [#361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | FAQ 인용 서술어 극성 비교 수정·합성 회귀 HEAD 1bf77d4; 일반 CI SUCCESS, 구 CHANGES_REQUESTED 정리·동료 최신 승인 필요 |

[#415](https://github.com/ot4562-glitch/HUFS-One-AI/pull/415) 독립 리뷰 자동 검사 이미 main merge SHA [6cef538](https://github.com/ot4562-glitch/HUFS-One-AI/commit/6cef53869d828bd99952dcf7bd26f0df192a2e7c). GitHub main Ruleset GET 결과 빈 배열/branch protection 상세 403이므로 **REVIEW_PROTECTION_NOT_VERIFIED**. 과거 #399/#400/#401/#411 동료 사후 감사와 관리자 실제 강제 보호 별도(#416).

### 본인 배정 7개 이슈: 코드 진행 ≠ 완료

| 이슈 | 현행 미충족 조건 | 상태 |
| --- | --- | --- |
| [#416](https://github.com/ot4562-glitch/HUFS-One-AI/issues/416) | 보호 CI #415 병합. 과거 4건 무승인 병합 동료 사후 감사와 main Ruleset 설정 미완 | **OPEN** |
| [#381](https://github.com/ot4562-glitch/HUFS-One-AI/issues/381) | 공통 OCR line ID fail-closed 방어 존재. 실제 OCR 변환·DB/실자료 검증 미완 | **OPEN** |
| [#378](https://github.com/ot4562-glitch/HUFS-One-AI/issues/378) | #394 npm audit gate 구현. 실제 Dependabot alerts/CodeQL 권한 및 운영 CVE 대응 미확인 | **OPEN** |
| [#375](https://github.com/ot4562-glitch/HUFS-One-AI/issues/375) | 경험/교과 owner API·BETA 웹/합성 회귀 존재. 학교 공식 원장·canonical identity·실동의/철회 미연결 | **OPEN** |
| [#367](https://github.com/ot4562-glitch/HUFS-One-AI/issues/367) | CampusAssist operator 선택 포트 조립 있음. 승인 source·권리/HCX 과금·실 E2E 미연결 | **OPEN** |
| [#366](https://github.com/ot4562-glitch/HUFS-One-AI/issues/366) | #420/#424/#422 병합으로 장학·배지·6종 코어 UI 소비자 존재. 상담 #410 CI·동료 승인 대기. 실데이터·권리·Gold/실계정 미인수 | **OPEN** |
| [#362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362) | 공개 CSV 원본 5개 권리·동의·Git 역사 노출 감사 미완. #421 메타데이터 감사 PR 보류, 원본 변경 없음 | **OPEN** |

팀 기능 #339–#341/#343–#352, 데이터 #360, 충돌 #373, 사용자 UX #418도 운영 인수 전 OPEN. 고정 역할 #355–#359는 변동 없음. 원본 CSV 다섯 개·민감 학생정보·Git history 불변. **신규 이슈 완료 종결 0 / RELEASE_BLOCKED**. [감사 원장](docs/REVIEW_AND_ISSUE_AUDIT_20261109.md)에 코드와 운영 검증 경계 기록.

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
2. 코드/사용성: #361·#372·#386의 REQUEST_CHANGES 해결 및 독립 AI 교차 QA; #366·#367·#375 API/DB/화면의 실제 소비자 경로 구현.
3. 자료/실증: #360 공식 문서·포스터·rights·독립 Gold 확보, 실제 OIDC/메일/BETA 2명 이상·운영 PostgreSQL/NCP·비용·복구/백업·사람 수락 별도 기록. 승인이 있어도 자동 실행/출시 승인으로 해석하지 않습니다.

**현행 담당 정본:** [AGENTS.md](AGENTS.md) · [팀 역할](docs/WORKSTREAMS.md) · [이슈 배정](docs/ISSUE_ASSIGNMENT_PLAYBOOK.md). 고정 역할 #355–#359에 댓글/본문/상태 등 어떤 쓰기도 하지 않습니다. [보관된 이전 상태](docs/archive/STATUS_20261107.md).
