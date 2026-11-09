# HUFS One AI — 현재 구현·검증·후속 인수

> **현행 상태: 2026-11-09 (Asia/Seoul).** 과거 2026-11-07의 통합 이력은 [보관본](docs/archive/STATUS_20261107.md)에 보존했습니다. 이슈·PR 개수는 이 시점의 GitHub 상태로 검증하며, 이후 변경은 [Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues) · [PRs](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)에서 재확인합니다.

**제품 승인:** `OWNER_CONFIRMED_APPROVED`. **실서비스 출시:** `RELEASE_BLOCKED`. 합성 CI/일회용 PostgreSQL 테스트와 실제 학교·학생·출처 이용권·사람 인수·운영 NCP/HCX 실행은 별도 검증 단계입니다. 팀 고정 역할 이슈 #355–#359는 읽기 전용입니다.

## 0. 2026-11-09 최신 검수 (3차) — 아래 과거 스냅샷보다 우선

**OPEN Issue 28 / OPEN PR 8 / 본인 배정 Issue 8 중 고정 역할 #359 제외 작업 대상 7.** 아래의 과거 26건 이슈/2건 PR 기록은 작성 당시 기준이며 현행이 아닙니다.

**이번 검수에서 실제 병합한 PR:** [#424](https://github.com/ot4562-glitch/HUFS-One-AI/pull/424) · [#420](https://github.com/ot4562-glitch/HUFS-One-AI/pull/420) · [#402](https://github.com/ot4562-glitch/HUFS-One-AI/pull/402) · [#403](https://github.com/ot4562-glitch/HUFS-One-AI/pull/403) · [#404](https://github.com/ot4562-glitch/HUFS-One-AI/pull/404) · [#409](https://github.com/ot4562-glitch/HUFS-One-AI/pull/409) · [#407](https://github.com/ot4562-glitch/HUFS-One-AI/pull/407) · [#408](https://github.com/ot4562-glitch/HUFS-One-AI/pull/408). 각 merge SHA와 변경 내역은 [감사 원장](docs/REVIEW_AND_ISSUE_AUDIT_20261109.md)에 명시. 동료 PR #424는 독립 검토, 소유자 작성 #420은 팀원 승인 확보, Dependabot #402/#403/#404/#409/#407/#408은 현재 HEAD 독립 리뷰 및 필수 CI 승인 이후 squash 병합했습니다.

**남은 열린 PR:** [#422](https://github.com/ot4562-glitch/HUFS-One-AI/pull/422) · [#421](https://github.com/ot4562-glitch/HUFS-One-AI/pull/421) · [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419) · [#410](https://github.com/ot4562-glitch/HUFS-One-AI/pull/410) · [#406](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) · [#405](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405) · [#372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) · [#361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361).

| PR | 작업 상태 및 차단 요인 |
| --- | --- |
| [#422](https://github.com/ot4562-glitch/HUFS-One-AI/pull/422) | 6종 owner insights: main 충돌 합성 HEAD 6379472, 최신 CI/팀 승인 대기 |
| [#421](https://github.com/ot4562-glitch/HUFS-One-AI/pull/421) | CSV Git 메타데이터 감사 제안; 팀 승인·비공개 권리 검토 필요 |
| [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419) | 현행 문서 조정; 최신 HEAD 팀 승인·CI 대기 |
| [#410](https://github.com/ot4562-glitch/HUFS-One-AI/pull/410) | 상담 API/UI 연결; 팀 승인·main 합성 확인 필요 |
| [#406](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) | TypeScript 7 파서/빌드 분리 HEAD 3282c42, 최신 CI·팀 승인 대기 |
| [#405](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405) | github-script v9; 실제 issues.opened 경로 확인 전 HOLD |
| [#372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | OCR 별개 발급처 SAME 오판, CHANGES_REQUESTED |
| [#361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | FAQ 부정/긍정 극성 오판, CHANGES_REQUESTED |

**병합 보호:** #415 정확한 HEAD 독립 리뷰 검사 PR은 이미 main에 병합(merge commit [6cef538](https://github.com/ot4562-glitch/HUFS-One-AI/commit/6cef53869d828bd99952dcf7bd26f0df192a2e7c)). 그러나 Ruleset 목록은 빈 배열, main 보호 상세 API는 403으로 실제 서버의 강제 보호를 확인하지 못했습니다. #416에서 관리자 UI의 필수 PR/1명 승인/새 HEAD 재승인/필수 CI/우회 금지와 거부 동작을 확인해야 합니다.

### 3차 담당 이슈 점검

| 이슈 | 현재 코드 근거와 남은 인수 | 판정 |
| --- | --- | --- |
| [#416](https://github.com/ot4562-glitch/HUFS-One-AI/issues/416) | #415 병합 및 현재 검수 절차 개선. 과거 4건의 무승인 병합 사후 동료 감사와 main Ruleset 활성화 미확인 | **OPEN** |
| [#381](https://github.com/ot4562-glitch/HUFS-One-AI/issues/381) | API + 공통 matchesImageSpan 중복 OCR line ID 거부 코드 있음. 실제 OCR 생성/저장소 유일성과 실원본 권한 인수 미검증 | **OPEN** |
| [#378](https://github.com/ot4562-glitch/HUFS-One-AI/issues/378) | #394 npm audit/SCAN_UNAVAILABLE CI 구현. 비공개 Dependabot alerts/CodeQL 설정 및 CVE 대응 운영 인수 미검증 | **OPEN** |
| [#375](https://github.com/ot4562-glitch/HUFS-One-AI/issues/375) | owner API가 경험-교과 엔진 호출하고 BETA 웹/합성 테스트 존재. 공식 강좌 identity/원장/목적 동의/실계정 미연결 | **OPEN** |
| [#367](https://github.com/ot4562-glitch/HUFS-One-AI/issues/367) | #396 CampusAssist 운영 포트 조립 있음. 권리 확인된 실제 source/FAQ 비용·권한/실 E2E 미연결 | **OPEN** |
| [#366](https://github.com/ot4562-glitch/HUFS-One-AI/issues/366) | #420/#424 병합, #422 충돌 해결 CI/재승인 대기, #410 상담 대기. 10기능의 운영 source/rights/QA 미인수 | **OPEN** |
| [#362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362) | 공개 CSV 5개 원본 게시권/동의와 Git 역사·복제 영향 조사 미완. #421 메타데이터 감사 PR 대기, 원본 불변 | **OPEN** |

그밖의 공식 자료 #360, 기능 #339–#341 및 #343–#352, 권리 충돌 #373, UI 시점·KST 결함 #418과 고정 역할 #355–#359는 계속 OPEN입니다. **새로 완료 처리한 이슈: 0건.** 운영 source/학생 동의·권한, PostgreSQL RLS, NCP/HCX, 독립 Gold, 실제 사용자는 자동 CI로 대체할 수 없습니다. **RELEASE_BLOCKED** 유지.

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
