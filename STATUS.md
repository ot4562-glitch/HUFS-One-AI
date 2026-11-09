# HUFS One AI — 현재 구현·검증·후속 인수

> **현행 상태: 2026-11-09 (Asia/Seoul).** 과거 2026-11-07의 통합 이력은 [보관본](docs/archive/STATUS_20261107.md)에 보존했습니다. 이슈·PR 개수는 이 시점의 GitHub 상태로 검증하며, 이후 변경은 [Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues) · [PRs](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)에서 재확인합니다.

**제품 승인:** `OWNER_CONFIRMED_APPROVED`. **실서비스 출시:** `RELEASE_BLOCKED`. 합성 CI/일회용 PostgreSQL 테스트와 실제 학교·학생·출처 이용권·사람 인수·운영 NCP/HCX 실행은 별도 검증 단계입니다. 팀 고정 역할 이슈 #355–#359는 읽기 전용입니다.

## 담당 이슈 후속 수정·검증 (2026-11-09 최신 병합 확인)

- **이 기록의 검증 기준 `main`:** [`8210eaf`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/8210eaffd049324295549a365a41338d9aeec743). GitHub 재조회: **OPEN Issues 31건**, **OPEN PR #431 1건**. 심민성 담당 OPEN 이슈는 [#359 본선 진출 이후](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359)를 제외하면 **9건**이며, 코드 적용과 실운영·권리·사람 인수를 동일한 완료로 보지 않습니다.
- **장학 정책 #429 — CLOSED:** [PR #434](https://github.com/ot4562-glitch/HUFS-One-AI/pull/434), main [`4af8383`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/4af838386d210243b72020caa49f7f19d2b35b6d). 동일 학기 과거 관측이력 허용, 최신 상충 검증 시 `UNKNOWN` 보류; 정확한 HEAD CI 12/12 성공.
- **승인 원장 SQL 병목 #430 — 코드 해결, 운영 인수 OPEN:** [PR #436](https://github.com/ot4562-glitch/HUFS-One-AI/pull/436) main `515b3c6`에서 source proof 조회를 1회로 배치하고, [#438](https://github.com/ot4562-glitch/HUFS-One-AI/pull/438) main `de4d3ea`에서 disposable 실제 PG(1/100/500 projections × 중복 100 refs) 측정. [#440](https://github.com/ot4562-glitch/HUFS-One-AI/pull/440) main `8210eaf`에서 중복된 **검증 source proof 지문 직렬화**를 제거하고 전체 ref 다중성·순서는 계속 바인딩. **500×100 단일 합성 PG CI 실측:** 이전 3132.18 ms / 관측 힙 +166.8 MB → 후속 708.28 ms / +34.5 MB. 단일 CI 런너 간 비통제 비교로 운영 SLA·성능 개선율 확정 아님. SQL EXPLAIN(ANALYZE) 0.441 / 0.217 ms; 실운영 인덱스·권리·부하 검증은 미완.
- **상담 과다요청 #433 — 분산 DB 코드·실 PG 검증, 운영 인수 OPEN:** [PR #435](https://github.com/ot4562-glitch/HUFS-One-AI/pull/435) main `bbded7a`에서 원장 read 전 원자적 per-actor quota/429/503 및 PostgreSQL HMAC digest 마이그레이션을 추가하고, [#438](https://github.com/ot4562-glitch/HUFS-One-AI/pull/438) real synthetic PG에서 두 인스턴스 동시 50건 **30 허용/20 거부**, 다른 actor 독립 허용 및 테이블 직접 접근 금지 확인. 실제 운영 마이그레이션·최소 권한·시크릿/WAF 비용 인수는 별도.
- **OCR 근거 #381 — 영구 저장 보강, 실원본 인수 OPEN:** [PR #437](https://github.com/ot4562-glitch/HUFS-One-AI/pull/437) main `010b716`. 동일·상충 field ID 중복을 IMAGE immutable INSERT 단계에서도 거부, 실제 disposable PostgreSQL에서 이미지/별도 PDF 경로와 함께 통과. 실 CLOVA/기관 원본/데이터 권리·사용자 인수는 수행하지 않음.
- **CSV 개인정보 #362 — metadata-only CI 강화, 권리 검증 OPEN:** [PR #439](https://github.com/ot4562-glitch/HUFS-One-AI/pull/439) main `e527023`. 기존 `csv/` 경로 외 **동일한 원본 Git blob 복사본**도 PR 경로와 blob SHA 메타데이터로 차단, 3,000파일 API 잘림은 실패 처리. 원본 5개 파일·내용·경로·기존 Git history **불변**. 가공/부분 복사·과거 공개·fork 및 모든 당사자 공개 동의는 이 검사로 증명할 수 없음.
- **사후 감사 #416 / 보안 운영 #378 / 실소스 통합 #366·#367·#375:** 4개 과거 PR #399/#400/#401/#411의 코드 변경·한계를 자체 재검토하고 #411 후속 방어를 병합했으나 **동료 독립 승인 기록을 조작하지 않음**. GitHub 비공개 보안 alerts, 실학교 원장·현재 권리/동의, 운영 RLS·HCX/NCP/실계정 E2E와 관리자 정책은 미검증. 소유자 지시에 따라 독립 승인 **자동 실패 게이트는 재도입하지 않음**.

**공통 수락 경계:** 위 코드/합성/일회용 PG 검증은 **실제 운영 구성·학교 데이터 제공 권리·동의·사람 Gold/검수**의 완료가 아닙니다. 제품 `RELEASE_BLOCKED` 유지. [본선 진출 이후] 고정 역할 이슈 #355–#359는 수정하지 않았습니다.

## 1차 코드 감사 및 문서 정리 — 2026-11-09 (당시 스냅샷)

- **당시 분석 기준 커밋:** [`76792d1`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/76792d1a3d50826adf2b64644219f4efdc149f9b). 추적 Git blob **1,299개**, Markdown **87개**, `.ts` **749개**·`.tsx` **105개** 및 SQL 39개 등 전체 경로 목록을 확보. 이것은 **파일 인벤토리**이지 1,299개 파일의 모든 실행 경로를 독립적으로 검증 완료했다는 뜻이 아닙니다.
- **확인된 신규 이슈 4건(각 독립 등록):** [#427 상담 검색 변경 중 이전 응답](https://github.com/ot4562-glitch/HUFS-One-AI/issues/427), [#433 상담 원장 읽기 전 요청 제한 부재](https://github.com/ot4562-glitch/HUFS-One-AI/issues/433), [#429 장학 사실 이력 과잉 중복 거부](https://github.com/ot4562-glitch/HUFS-One-AI/issues/429), [#430 승인 projection N+1 SQL](https://github.com/ot4562-glitch/HUFS-One-AI/issues/430). 기존 [#418](https://github.com/ot4562-glitch/HUFS-One-AI/issues/418), [#373](https://github.com/ot4562-glitch/HUFS-One-AI/issues/373), [#381](https://github.com/ot4562-glitch/HUFS-One-AI/issues/381) 등과 분리했습니다.
- **당시 열린 이슈 32건:** 이전 28건 + 유효한 신규 #427/#429/#430/#433 4건. 최초 의심이었던 [#428](https://github.com/ot4562-glitch/HUFS-One-AI/issues/428)은 공식 IANA IPv4 레지스트리 대조에서 차단 누락을 확인할 수 없어 **오탐 CLOSED/NOT_PLANNED**, 취약점 집계 제외. 역할 #355–#359는 쓰기 금지, **실제 검증 없이 완료 상태로 바꾼 이슈 없음**. 코드·계약·SQL·웹·외부 수집 경계를 대상으로 한 정적 1차 감사이며 브라우저 재현, 실제 PostgreSQL 벤치, NCP/실학생/권리 검증은 `NOT_RUN`.
- **문서 최소화:** 중복 과거 문서 5개를 Git 커밋 이력에 보존한 채 현행 트리에서 제거하고, README의 전체 링크 나열을 간소화. 정본은 README, 이 STATUS, AGENTS/WORKSTREAMS/PR_WORKFLOW, [2026-11-09 감사 원장](docs/REVIEW_AND_ISSUE_AUDIT_20261109.md), 보안·권리/운영 필수 문서입니다.
- **제품 상태:** `RELEASE_BLOCKED`; 이번 정적 코딩 감사·문서 정리는 실서비스/실학생 데이터·원본 CSV 권리 승인, 사람 리뷰, 실제 서버/모델 실행이 아닙니다.

## 0. 앞선 전수 수정·병합 기록 (2026-11-09 당시)

**당시 전수 작업 PR 총 17건 실제 병합(코드·의존성 15 + 승인 검사 제거 #425 + 문서 #419), 당시 OPEN PR 0건.** [#425](https://github.com/ot4562-glitch/HUFS-One-AI/pull/425)는 13/13 HEAD 검사 성공 뒤 [main `88b7814`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/88b7814a1317bc7856ee04ca83b294f2d9eee465), [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419)는 11/11 HEAD 검사 성공 뒤 [main `fd55ba0`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/fd55ba033b88a44deda159ef8fca4a30f7e84cea)로 병합 확인했습니다. 역할 고정 이슈 5개를 제외한 23개 이슈도 최종 현재 단계·남은 인수를 기록했으며 전체 28개 이슈는 아직 운영 DoD 미충족으로 OPEN입니다.

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

소유자가 2026-11-09 `exact-HEAD independent approval`의 **PR 자동 실패형 검사를 제거**하도록 지시했습니다. 실제 병합한 [#425](https://github.com/ot4562-glitch/HUFS-One-AI/pull/425)에서 `.github/workflows/independent-pr-review.yml`, 그 전용 합성 테스트 및 TASK-00 sparse checkout 참조를 삭제하고, `AGENTS.md`와 [PR_WORKFLOW](docs/PR_WORKFLOW.md)에 사람/에이전트의 수동 검수 절차를 남깁니다. 담당자 실제 `APPROVED`가 없으면 있다고 기록하지 않습니다. **일반 코드·보안·CSV/권리 경계·브라우저·PG CI는 유지**하며, 미해결 코드 결함은 승인 CI 삭제와 관계없이 수정합니다. 서버 강제 규칙은 Ruleset 조회 0건 및 보호 상세 API 403으로 별도 확인하지 못했습니다.

### 열린 이슈 및 실제 운영 인수

- **당시 OPEN 28건(2026-11-09 기존 PR 병합 시점의 스냅샷):** 변경 금지 역할 #355–#359 (5), 공식자료 #360 (1), 기능 #339–#341 및 #343–#352 (13), 기술/보안 #362/#366/#367/#373/#375/#378/#381 (7), 검토 절차 #416과 사용자 UX #418 (2). **현재는 상단 감사의 #427/#429/#430/#433 활성 4건을 포함하여 32건**입니다.
- **#341:** FAQ 검색/인용 가드 코드 병합. 실제 공식 FAQ·HCX·독립 Gold 미인수.
- **#345/#366:** 상담 인증 source→API/UI와 추천 순위 수정 병합. 실제 기관 명칭/권리/실DB 원장은 미연결.
- **#346:** OCR 후보 추출·유사 기관명 격리·기본 가림 병합. 실제 CLOVA 및 실학생 자료·사람 검토는 미실행.
- **#362:** `csv/` 로컬 과거 메타데이터 진단 도구만 병합. **실자료 파일·Git 기록 불변**, 포크/과거 다른 경로/게시 동의는 UNKNOWN/NOT_VERIFIED.
- **#378:** TypeScript 7·github-script v9와 Node24 합성 이벤트 시험 병합. 실제 GitHub 라우팅 웹훅/Dependabot alerts 운영 인수 별도.
- **#416:** 리뷰 CI를 소유자 지시로 수동 감사로 조정. 과거 #399/#400/#401/#411의 사후 교차 검토 부채는 여전히 별도.
- 본인 배정 8건에서 고정 역할 #359 제외한 7건은 완전한 권리/실계정/운영 DoD 미충족으로 OPEN. 고정 역할 이슈 #355–#359에 어떤 쓰기도 하지 않았습니다.

**`OWNER_CONFIRMED_APPROVED`는 코드 작업 승인이지 실서비스 인수가 아닙니다. `RELEASE_BLOCKED` 유지.**


---

## 1. 1차 당시 PR 검토·병합 — 2026-11-09 (역사적 스냅샷)

> **이 절의 `OPEN/미병합/REQUEST_CHANGES`는 1차 리뷰 당시 기록입니다.** 이후 #361의 부정 극성 결함과 #372의 OCR 기관명 오인 문제가 수정·재검증되어 각각 [`569e938`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/569e9382dd15b536e95ab3fde055442529e7fecc)·[`4e1a962`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/4e1a962049d1a4c24475b0d69d542a35869e2411)로 **병합 완료**되었습니다. #386도 [`e8d3c9c`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e8d3c9c73849bec36b7fe686de2c56e6aa71c5b9)로 병합되었습니다. 상단 최신 스냅샷과 실제 GitHub가 현행 기준입니다.

| PR | 최신 검토 SHA / 내용 | HEAD 검증 | 최종 처리 |
| --- | --- | --- | --- |
| [#386 NCS/경험 의미 후보](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386) | `0fdb638` · 중복 requirement/experience ID 격리, 버전 digest 및 순서 반전 테스트 | TASK-00·Chrome·NCP·Pages·npm audit **5/5 SUCCESS**, 박준영 APPROVED·오너 재리뷰 APPROVED | **squash 병합** [`e8d3c9c`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e8d3c9c73849bec36b7fe686de2c56e6aa71c5b9); #347 기능 전체 OPEN |
| [#361 FAQ 검색/답변 가드](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | `72fc402` · 형용사 `없는`을 서술어 부정과 혼동하는 긍·부정 뒤집기 우회 | HEAD **5/5 SUCCESS**이나 해당 반례 미해결 | [`REQUEST_CHANGES`](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361#pullrequestreview-5820574395), **OPEN/미병합** |
| [#372 OCR 증빙 후보](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | `1798c55` · 서로 다른 발급처 이름을 유사도만으로 `SAME` 판단 | HEAD **5/5 SUCCESS**이나 해당 반례 미해결 | [`REQUEST_CHANGES`](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372#pullrequestreview-5820574572), **OPEN/미병합** |

#386의 AI 순수 코드·합성 테스트만 병합됐습니다. 실제 NCS 원장·인적 Gold·웹/API 통합은 `NOT_RUN/NOT_CONNECTED`이며 기능 #347은 완료가 아닙니다. #361/#372는 수정된 HEAD 반례·신규 CI·재리뷰 전까지 병합하지 않습니다. **병합 후 새로운 main SHA의 CI/실운영 통과를 이 표에서 주장하지 않습니다.** [11/09 검토 원장](docs/REVIEW_AND_ISSUE_AUDIT_20261109.md) · [11/08 병합/수정 이력](docs/REVIEW_AND_ISSUE_AUDIT_20261108.md).

## 2. 1차 당시 변경 요청 2건 (이후 수정·병합 완료)

> 아래는 최초 결함과 당시 수정 요청의 감사 이력입니다. 현재 두 PR 모두 병합되었으며, **실서비스 자료·권리·사람 인수**가 완료된 것은 아닙니다. 해당 기능 이슈 #341/#346은 계속 OPEN입니다.

| PR | 남은 차단 결함 | 다음 행동 |
| --- | --- | --- |
| [#361 FAQ](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | `없(?!이)` 정규식이 `없는`을 부정으로 잘못 인식, 근거와 반대되는 학사 답변을 통과시킬 위험 | 인용·서술어 극성 검증 및 합성 반례 추가 후 재리뷰 |
| [#372 OCR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | 비슷하지만 다른 기관의 문자 유사도를 `SAME`으로 확정 | 유사 오타는 `ISSUER_UNCERTAIN`으로 보류, 별도 기관 구분 회귀 후 재리뷰 |

## 3. 1차 당시 열린 이슈 — 코드 결함과 실증 인수 분리 (과거 진단)

1차 감사 당시 **OPEN 26건**: 고정 역할 **5건(#355–#359, 변경 금지)**, 공식자료 요청 **1건(#360)**, 추가 기능 **13건(#339–#341, #343–#352)**, 미해결 기술/보안 결함 **7건**으로 구분합니다. 날짜/버전이 바뀌면 GitHub를 다시 검색해야 합니다.

| 미해결 이슈 | 다음 검증 / 담당 경계 |
| --- | --- |
| [#362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362) | 공개 저장소에 추적 중인 기존 CSV 5개: 게시 동의·재식별·권리/포크 범위 비공개 평가. 원본 변경·삭제·히스토리 강제 재작성 금지 |
| [#366](https://github.com/ot4562-glitch/HUFS-One-AI/issues/366) | 당시 owner API/DB/UI 소비자 미연결. **이후** #417/#420/#422/#410으로 인증 BETA API·웹 소비자 코드가 병합됐으나 운영 source/권리·실계정·DB 인수는 미완료 |
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
