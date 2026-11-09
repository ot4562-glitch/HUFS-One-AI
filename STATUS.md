# HUFS One AI — 현재 구현·검증·후속 인수

> **현행 상태: 2026-11-09 (Asia/Seoul).** 과거 2026-11-07의 통합 이력은 [보관본](docs/archive/STATUS_20261107.md)에 보존했습니다. 이슈·PR 개수는 이 시점의 GitHub 상태로 검증하며, 이후 변경은 [Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues) · [PRs](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)에서 재확인합니다.

**제품 승인:** `OWNER_CONFIRMED_APPROVED`. **실서비스 출시:** `RELEASE_BLOCKED`. 합성 CI/일회용 PostgreSQL 테스트와 실제 학교·학생·출처 이용권·사람 인수·운영 NCP/HCX 실행은 별도 검증 단계입니다. 팀 고정 역할 이슈 #355–#359는 읽기 전용입니다.

## 0. 2026-11-09 후속 감사 — 독립 동료 리뷰 적용 뒤

**2026-11-09 2차 감사 시점: OPEN PR 13건(이 문서 PR #419 생성 직전), OPEN Issue 28건.** 문서 개정 PR #419가 열려 있는 동안 실제 OPEN PR은 **14건**이므로, 이후 현황은 GitHub에서 다시 확인해야 합니다. 변경 전 1차 스냅샷(26건 이슈·FAQ/OCR PR 2건)은 아래 역사적 기록으로 남기며, 현재 진행 상태는 이 절이 우선합니다. 저장소 `main`의 Ruleset은 여전히 미활성화되어 관리자 설정 검증 전 `REVIEW_PROTECTION_NOT_VERIFIED`입니다.

| 작업 | 정확한 HEAD 리뷰·검증 | 결과 |
| --- | --- | --- |
| [#413 독립 승인 강제 정책](https://github.com/ot4562-glitch/HUFS-One-AI/pull/413) | HEAD `9841dc9`에 박준영 `taewangim-alt` **APPROVED** (write 권한 확인); 변경 파일 4개, PR Actions 6종 성공 | **Squash MERGED** [`dfc79a7`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/dfc79a76a3b634417d6793042ab1730175858b31); CODEOWNERS·PR 템플릿·AGENTS·리뷰 문서 개정 |
| [#417 승인 카탈로그 서버/웹·HMAC 커서](https://github.com/ot4562-glitch/HUFS-One-AI/pull/417) | HEAD `2bc0262`에 박준영 **APPROVED**, CodeQL 리뷰 스레드 해결, TASK-00·Chrome·CodeQL·Pages·NCP·npm audit·CSV guard **7/7 SUCCESS** | **Squash MERGED** [`35b9ebe`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/35b9ebe33c400e7284f7a1f6951b02f30d11136a); **이 main merge SHA의 push Actions 6개도 전부 SUCCESS** (TASK-00·Chrome·CodeQL·NCP·Pages·npm audit). **실 데이터/SQL quota·RLS/rights·운영 signer 인수는 미연결**, #348/#366 OPEN; UI 날짜/시간 만료 #418 OPEN |
| [#415 자동 독립 리뷰 CI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/415) | #413과 중복된 정책 변경을 제거하고 최신 main 병합, HEAD `7f850b8`; 5개 파일만 변경. 동료 최신 HEAD APPROVED **0건** | **OPEN / 미병합**. CI `exact-HEAD independent approval`은 승인 전 의도된 실패. 다른 CI도 최신 HEAD 확인 후 승인 요청 필요 |
| [#410 상담기관 API·BETA](https://github.com/ot4562-glitch/HUFS-One-AI/pull/410), [#412 학업/경험 링크](https://github.com/ot4562-glitch/HUFS-One-AI/pull/412) | 이전 HEAD CI 성공. 최신 main(#413/#417)을 두 PR 브랜치에 **강제 푸시 없이** 각각 통합, HEAD `fdbe394` / `0532828`, 두 PR 모두 `mergeable:true`로 변경. **최신 HEAD CI 검사 진행 중, 동료 `APPROVED` 0건** | **OPEN/미병합**. 새 HEAD CI·독립 팀원 승인 필요; 운영 자료/동의·권리/SQL·실사용 인수 #345/#366/#375 OPEN |
| [#361 FAQ](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361), [#372 증빙 OCR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | 각각 현재 HEAD의 `CHANGES_REQUESTED`와 미해결 인용 극성/기관명 판정 회귀 | **OPEN** / 고쳐서 재승인 전 병합 금지 |
| Dependabot [#402–#409](https://github.com/ot4562-glitch/HUFS-One-AI/pulls?q=is%3Aopen+author%3Aapp%2Fdependabot) | 8건 HEAD diff·CI 검수 후 공식 리뷰: #402/#403/#406 **REQUEST_CHANGES**(TASK-00 실패), #404/#405/#407/#408/#409 **COMMENT**(기존 HEAD 성공, 최신 base/협업자 승인 필요) | 모두 OPEN / **0건 병합**. 감사·보안 회귀를 무시하는 일괄 병합 금지 |

### 이슈 28건 — 진행·종결 기준

- 변경 금지 **고정 역할 #355–#359 5건**, 공식자료/Gold **#360 1건**, 신규 기능 **#339–#341 및 #343–#352 13건**은 모두 OPEN. 실제 자료/기관권리·UI·Gold의 인수 전 코드만으로 종결 금지.
- 기존 보안/기술 결함 **#362/#366/#367/#373/#375/#378/#381 7건** OPEN. #348의 일부 API 연결은 #417로 병합됐지만 운영 SQL/허가 자료는 여전히 없음.
- 신규 **#416 독립 리뷰 사후 감사·관리자 Ruleset**과 **#418 검색 TTL·KST UI 오류** OPEN. [#414](https://github.com/ot4562-glitch/HUFS-One-AI/issues/414)는 #416과 **중복 사유로 CLOSED**했으며 전체 업무 완료(`completed`)로 표시한 것은 아닙니다.
- **이번 2차 감사 신규 `completed` 종결: 0건.** 실제 인수되지 않은 기능/운영/학생·기관 자료의 완료 상태를 만들지 않음. 고정 역할 #355–#359와 기존 공개 CSV 원본 5개는 변경하지 않음.

**출시 판정:** `OWNER_CONFIRMED_APPROVED`는 프로젝트 범위 허가일 뿐입니다. 실제 운영 자료·학교/학생 동의·RLS/권리·NCP/HCX 과금·독립 사람 Gold·실계정 QA는 `NOT_RUN/NOT_CONNECTED/CONFIGURATION_REQUIRED`이며 **`RELEASE_BLOCKED` 유지**. 리뷰/이슈 세부 근거는 [11/09 후속 감사 원장](docs/REVIEW_AND_ISSUE_AUDIT_20261109.md)과 [#416](https://github.com/ot4562-glitch/HUFS-One-AI/issues/416).

## 1. 이전 PR 검토·병합 — 2026-11-09 1차 스냅샷

| PR | 최신 검토 SHA / 내용 | HEAD 검증 | 최종 처리 |
| --- | --- | --- | --- |
| [#386 NCS/경험 의미 후보](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386) | `0fdb638` · 중복 requirement/experience ID 격리, 버전 digest 및 순서 반전 테스트 | TASK-00·Chrome·NCP·Pages·npm audit **5/5 SUCCESS**, 박준영 APPROVED·오너 재리뷰 APPROVED | **squash 병합** [`e8d3c9c`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e8d3c9c73849bec36b7fe686de2c56e6aa71c5b9); #347 기능 전체 OPEN |
| [#361 FAQ 검색/답변 가드](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | `72fc402` · 형용사 `없는`을 서술어 부정과 혼동하는 긍·부정 뒤집기 우회 | HEAD **5/5 SUCCESS**이나 해당 반례 미해결 | [`REQUEST_CHANGES`](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361#pullrequestreview-5820574395), **OPEN/미병합** |
| [#372 OCR 증빙 후보](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | `1798c55` · 서로 다른 발급처 이름을 유사도만으로 `SAME` 판단 | HEAD **5/5 SUCCESS**이나 해당 반례 미해결 | [`REQUEST_CHANGES`](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372#pullrequestreview-5820574572), **OPEN/미병합** |

#386의 AI 순수 코드·합성 테스트만 병합됐습니다. 실제 NCS 원장·인적 Gold·웹/API 통합은 `NOT_RUN/NOT_CONNECTED`이며 기능 #347은 완료가 아닙니다. #361/#372는 수정된 HEAD 반례·신규 CI·재리뷰 전까지 병합하지 않습니다. **병합 후 새로운 main SHA의 CI/실운영 통과를 이 표에서 주장하지 않습니다.** [11/09 검토 원장](docs/REVIEW_AND_ISSUE_AUDIT_20261109.md) · [11/08 병합/수정 이력](docs/REVIEW_AND_ISSUE_AUDIT_20261108.md).

## 2. 1차 점검 당시 남았던 AI PR 2건 (현재도 미병합)

| PR | 남은 차단 결함 | 다음 행동 |
| --- | --- | --- |
| [#361 FAQ](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | `없(?!이)` 정규식이 `없는`을 부정으로 잘못 인식, 근거와 반대되는 학사 답변을 통과시킬 위험 | 인용·서술어 극성 검증 및 합성 반례 추가 후 재리뷰 |
| [#372 OCR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | 비슷하지만 다른 기관의 문자 유사도를 `SAME`으로 확정 | 유사 오타는 `ISSUER_UNCERTAIN`으로 보류, 별도 기관 구분 회귀 후 재리뷰 |

## 3. 1차 점검 당시 열린 이슈 — 코드 결함과 실증 인수 분리

2026-11-09 1차 점검 당시 **OPEN 26건**: 고정 역할 **5건(#355–#359, 변경 금지)**, 공식자료 요청 **1건(#360)**, 추가 기능 **13건(#339–#341, #343–#352)**, 미해결 기술/보안 결함 **7건**으로 구분합니다. 날짜/버전이 바뀌면 GitHub를 다시 검색해야 합니다.

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
2. 코드/사용성: #361·#372의 REQUEST_CHANGES 해결 및 독립 AI 교차 QA; #366·#367·#375 API/DB/화면의 실제 소비자 경로 구현.
3. 자료/실증: #360 공식 문서·포스터·rights·독립 Gold 확보, 실제 OIDC/메일/BETA 2명 이상·운영 PostgreSQL/NCP·비용·복구/백업·사람 수락 별도 기록. 승인이 있어도 자동 실행/출시 승인으로 해석하지 않습니다.

**현행 담당 정본:** [AGENTS.md](AGENTS.md) · [팀 역할](docs/WORKSTREAMS.md) · [이슈 배정](docs/ISSUE_ASSIGNMENT_PLAYBOOK.md). 고정 역할 #355–#359에 댓글/본문/상태 등 어떤 쓰기도 하지 않습니다. [보관된 이전 상태](docs/archive/STATUS_20261107.md).
