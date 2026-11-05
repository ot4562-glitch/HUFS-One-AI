# 독립 평가·인적 검토 실행 패키지 (기존 #61/#132 코드, 현 인수 #252)

> **2026-11-05 최종 인수 정본:** 기존 #61/#132 코드 납품에 이어 #221로 분리됐던 **200 추천·20 PNG·12 시점 비작성자 검수(현재 0/200·0/32)**는 이제 [**#252 실환경·인적·권리 인수**](https://github.com/minseong-hufs/HUFS-One-AI/issues/252) D01에서 OPEN, 평가 도구·AI/출처/CI 수정은 [**#253 잔여 코드·계약·CI 구현**](https://github.com/minseong-hufs/HUFS-One-AI/issues/253)에서 추적한다. #221/#222/#20 이슈 링크는 종료된 원본 이력이며 실제 모델·기관/권리·운영/실호스트 수락으로 승격하지 않는다. [실행 순서](PRODUCT_ACTIVATION_RUNBOOK_20261105.md). **RELEASE_BLOCKED**.


## 현재 상태와 정본

이 도구는 실제 검토자가 판정하고 서명할 수 있는 **오프라인 입력·검증·원장·평가 경로**를 제공한다. 저장소에는 실제 검토자의 개인 키, HUMAN_REVIEW 권한 설정, 실제 서명 또는 실기관 원본이 없다. 기본 인적 검토 수는 **추천 0/200, 미디어·시간 0/32**이다. 테스트의 Ed25519 키는 메모리에서만 생성하며 SYNTHETIC_TEST로 분리한다. 키 권한과 서명 무결성이 검증되어도 실제 읽음·판정 정확성·D01 최종 인수는 자동 증명되지 않는다. D02 실기기·접근성 인수도 이 도구가 대신하지 않는다.

- 추천 정본: core의 DEMO_OPPORTUNITIES 40건, DEMO_NOTICES 10건, DEMO_STUDENTS 5개, DEMO_LABELS 200건, DEMO_SPLIT. demoAsOf는 기존 2026-11-20T00:00:00.000Z이다.
- 기존 200건은 TRACK_OWNER_SELF 초안이다. 고정 TUNING 20건 / REPORT 20건을 재사용한다. 보고용 20건을 보고 설정을 조정하면 독립 holdout으로 해석할 수 없다.
- 기존 packages/fixtures/synthetic/demo-snapshot.json 및 별도 demo-corpus-snapshots.json은 교체하지 않는다. 이 도구의 정본은 그 파일을 덮어쓰지 않는다.
- 미디어 정본: packages/core/src/evaluation/media-fixtures.ts의 별도 syn-media-time-v1, 실제 PNG 20개 + HTML 20개 + 시간·정정 12건의 revision text. 식별자는 SYN-MEDIA / SYN-TEMPORAL이며 추천 200개 라벨과 섞이지 않는다.
- 추천 검토용 원문은 기존 typed 합성 corpus를 그대로 렌더한 SYNTHETIC_DERIVED_CANONICAL 텍스트다. 실기관 원본이나 독립적으로 수집한 새 증거로 표시하지 않는다.
- 미디어는 코드로 직접 만든 라틴 bitmap 글자다. 원본 픽셀 좌표는 정확하지만 한국어 실공고·사진·기울임·복잡한 레이아웃의 OCR 정확도를 대표하지 않는다. 별도 AI 생성 시연 이미지를 이 20개 fixture의 제작 방식으로 표시하지 않는다.

근거 계약: [Architecture A15](../Architecture.md), [D01/D02 인수 원장](HUMAN_ACCEPTANCE_GATE_20261104.md), [미디어 버전·좌표 계약](TRUSTED_RAG_MEDIA_VERSIONING.md). 실제 원본·외부 모델 권리는 기존 운영 승인 경로를 따른다. 이 평가 패키지의 externalAi는 NOT_APPROVED이며 명령은 네트워크 요청을 만들지 않는다.

## 준비 및 실행

Node는 프로젝트 floor인 22.22.2 이상 허용 버전을 사용한다. 새 dependency는 없다. 저장소 루트에서 아래 명령을 실행한다. 전용 evaluation compile은 API/web 전체 build와 분리된다.

~~~sh
npm run build:contracts
npm exec -- tsc -p tools/evaluation/tsconfig.json
node tools/evaluation/run.mjs fixtures --action check
node tools/evaluation/run.mjs export --head <검토할_40자리_commit_SHA> --out local_only/evaluation/review-run-001
~~~

최초 유지관리 생성은 fixtures --action generate이다. 이미 생성된 폴더는 덮어쓰지 않는다. 바이트가 달라졌다면 원인을 검토하고 새 reference version을 설계한다. export 출력 폴더 역시 새 폴더만 허용하며, 제출 묶음이 기존 원장을 지우지 못한다.

출력은 다음과 같다.

| 경로 | 내용 |
|---|---|
| recommendation/package.json | 고정 200건, 합성 프로필·원문, 초안 라벨, 정확한 span/SHA와 split |
| recommendation/review.html | 오프라인 사례 탐색·직접 판정 JSON 입력·초안 저장 |
| recommendation/review-template.json | 미작성 200행, 모든 assessment와 시각이 비어 있음 |
| recommendation/ledger.json | 빈 추천 판정 원장 |
| media/package.json / review.html / review-template.json / ledger.json | 별도 20 poster + 12 temporal 검토 |
| media/assets | 실제 PNG/HTML/revision bytes, manifest 및 exact-reference JSON Schema |
| schemas | 판정·서명·권한·원장·provider observation JSON Schema |
| authority-template.json | 권한이 없는 입력 틀. 실제 공개키·승인 정보·기간은 운영자가 따로 구성 |
| README.md | 이 절차 사본 |

HTML은 서버·외부 JS·외부 이미지·네트워크·자동 저장소를 사용하지 않는다. 저장한 초안은 같은 package/commit/case hash를 확인한 뒤 다시 열 수 있으므로 여러 차례에 나누어 검토할 수 있다. 원본과 참조는 표시하되 판정·검토 시각·서명은 채우지 않는다. “식별자·입력 틀·근거 참조 복사”는 고정 reference를 복사할 뿐 실제 읽었다고 서명하지 않는다. 검토자가 확인한 evidence만 남기고 판정 값을 입력한다.

## 실제 검토자 입력

검토자는 각 사례의 원본·프로필·조건을 확인하고 review-template 또는 review.html에서 다음을 입력한다. 한 번에 1~200건을 제출할 수 있다. 후속 제출은 현재 원장 head와 기존 reviewId를 확인한다.

- reviewId / reviewEvidenceId: 중복되지 않는 실제 검토 기록 식별자.
- reviewedAt: 실제 검토한 ISO 8601 시각. 서명 이후 시각은 허용되지 않는다.
- decision: LABELLED(판정), HOLD(보류), NOT_RUN(미실행). LABELLED만 검토된 gold 후보로 집계한다.
- rationale: 판정의 구체적인 근거. UNKNOWN 또는 보류에는 unknownReason도 필요하다.
- evidence: packet에서 실제 확인한 정확한 원문 span. 원본 SHA·revision·quote·bbox를 바꾸면 거부한다.
- correctionReason: 추천 초안 라벨, media value/bbox/eligibility, 시간 정답을 바꾸거나 기존 판정을 정정하면 반드시 작성한다.
- anchor.selected/reason: 대표적인 일치·불일치·오류 사례로 선택할 때 이유를 작성한다.
- amendsReviewId: 정정할 때 현재 판정의 정확한 reviewId. 본인의 판정을 수정하거나 별도로 권한을 받은 GOLD_ADJUDICATOR가 조정할 수 있다.

추천 assessment는 kind=RECOMMENDATION, relevance=0/1/2, eligibility=ELIGIBLE/INELIGIBLE/UNKNOWN과 **모든 명시 조건의 PASS/FAIL/UNKNOWN**을 별도 입력한다. 관련성이 높아도 신청 불가일 수 있으며, priority/completion 또는 행사일을 신청 자격·마감으로 바꾸지 않는다. 조건의 evidenceId는 packet.conditions의 원래 식별자다.

포스터 assessment는 kind=POSTER, eligibility, 모든 field의 evidenceId/value/bboxNorm이다. bboxNorm은 실제 640×360 원본의 좌상단 원점·x/y 증가 방향에 따른 [x1/640,y1/360,x2/640,y2/360]이다. 좌표는 원본 글자 픽셀의 반열린 tight box다. OCR 엔진이 만든 bbox로 가장하지 않는다.

시간 assessment는 kind=TEMPORAL, currentRevisionIds 및 quarantined의 [revisionId, reason] 전체 분할이다. 원본에 없는 revisionId, 누락·중복 revision은 거부한다. 원문과 시각을 보고 실제 정답을 수정하면 reason을 남긴다.

사례를 읽지 않았다면 판정·시간을 만들어 넣지 않는다. 이 화면은 JSON 입력 도구이며 자동 인적 서명 버튼이 없다. 후보를 저장한 뒤 아래 prepare가 정확한 schema·원문·필수 조건을 검증한다.

## 권한·개인 서명·인입

### 1. 독립 권한 설정

권한 운영자는 검토자의 실제 신원·비작성자 역할 및 공개키 소유를 별도 확인한다. issue #61의 권장 검토자 github:uisang2004-maker 표기는 신원 증명이 아니다. 추천 초안 작성자 github:qamarrchae, media 생성의 SYSTEM/작성자 및 권한 승인자 본인의 자기 승인은 거부한다.

별도 private registry에는 schemaVersion=reviewer-authority-v1, environment=HUMAN_REVIEW 또는 SYNTHETIC_TEST, registryId, approvalEvidenceId, approvedBy, approvedAt, reviewers를 넣는다. 각 reviewer는 reviewerId, INDEPENDENT_REVIEWER 또는 GOLD_ADJUDICATOR 역할, Ed25519 publicKeySpki(base64 DER), DER SHA-256인 keyId, D01/packageSha256/targetCommit scope, startsAt/expiresAt/revokedAt을 가진다. 권한은 추천·미디어 각각의 package hash에 결속된다. 실제 승인이 없으면 HUMAN_REVIEW registry를 만들지 않는다.

~~~sh
node tools/evaluation/run.mjs authority-digest --authority <독립적으로_확인한_private_registry.json>
~~~

이 명령은 정렬된 canonical JSON의 digest만 계산한다. **digest 자체는 승인·신원 확인이 아니다.** 운영자는 승인 기록과 함께 예상 digest를 별도 private configuration에 pin해야 한다. 제출 파일이 공개키·registry·pin을 자신에게 부여할 수 없다. importer에 임의의 verify 함수나 humanReviewed=true를 넣는 방법은 없다. 표준 JSON 파일 바이트 SHA와 canonical digest는 다를 수 있다.

### 2. 검토자가 자기 키로 외부 서명

검토자의 개인 Ed25519 키는 검토자의 별도 안전한 환경에서 관리한다. 이 도구는 개인 키를 읽거나 생성하지 않는다. 이미 승인된 공개키와 짝을 이루는 개인 키로 서명한다.

~~~sh
node tools/evaluation/run.mjs prepare --package <package.json> --input <작성한_review-candidate.json> --out <payload.json>
openssl pkeyutl -sign -rawin -inkey <검토자_개인키.pem> -in <payload.json> -out <signature.bin>
node tools/evaluation/run.mjs assemble --payload <payload.json> --signature-file <signature.bin> --key-id <승인된_public_DER_SHA256> --out <submission.json>
~~~

prepare 출력은 **끝 개행 없는 UTF-8 canonical JSON**이다. 바로 그 바이트를 서명한다. payload에는 고유 submissionId/signatureId, reviewerId, 실제 signedAt, 정확한 expectedLedgerHead가 필요하다. assemble은 detached 64-byte 서명을 붙일 뿐 권한이나 인적 PASS를 주지 않는다. 개인 키를 저장소·채팅·제출 파일로 보내지 않는다.

### 3. 운영자가 검증해 원장에 추가

~~~sh
node tools/evaluation/run.mjs ledger-report --package <package.json> --ledger <ledger.json>
node tools/evaluation/run.mjs import --package <package.json> --ledger <ledger.json> --submission <submission.json> --authority <private_registry.json> --authority-sha256 <별도_pin>
~~~

현재 원장 head를 기준으로 서명한다. 경쟁 제출로 head가 달라졌으면 새 head/정정 연결을 확인하고 새 payload에 다시 서명한다. 정확히 같은 제출 재전송은 멱등이며, 같은 submission/signature/review ID의 다른 내용은 거부한다. importer는 공개키·scope·기간·철회·작성자 분리·시각·원문·서명·이전 원장 hash를 모두 확인한다.

원장 파일은 잠금·compare-and-swap·임시 파일 fsync/rename으로 갱신하고 각 신규 entry를 별도 파일에 보존한다. 프로세스 중단 뒤 남은 .lock은 운영자가 살아 있는 실행이 없는지 확인한 뒤 처리한다. 이 로컬 파일 프로토콜은 악의적인 관리자에 대한 WORM 저장소나 완전한 crash recovery가 아니다. 중요한 인수 시점의 head digest는 독립 보관해야 하며, 기존 .entries는 삭제하지 않는다. 만료·철회된 권한은 현재 인적 완료 집계에서 제외되지만 과거 기록은 미검증 상태로 열람한다. 새 append에는 과거 원장의 당시 권한도 다시 검증한다.

## 평가 실행과 해석

~~~sh
node tools/evaluation/run.mjs report --package <recommendation/package.json> --ledger <recommendation/ledger.json>
node tools/evaluation/run.mjs report --package <recommendation/package.json> --ledger <recommendation/ledger.json> --authority <private_registry.json> --authority-sha256 <별도_pin>
node tools/evaluation/run.mjs report --package <recommendation/package.json> --ledger <recommendation/ledger.json> --reference TRACK_OWNER_SELF
node tools/evaluation/run.mjs media-report --fixtures <media/assets>
node tools/evaluation/run.mjs benchmark --samples 50 --out <새로운_benchmark.json>
~~~

추천 기본 보고서는 실제 검증된 독립 라벨이 없으면 P@3/nDCG·gold 비교를 null / NOT_RUN으로 둔다. TRACK_OWNER_SELF 옵션은 초안 기준 참고 계산임을 명시하며 독립 정확도 또는 인적 검수 수로 승격하지 않는다. 분할별 label coverage와 UNKNOWN을 함께 보고한다. 일부 라벨만 있으면 PARTIAL_SIGNED_REFERENCE로 표시하므로 전체 정확도로 해석하지 않는다.

기존 compareRankers / precisionAtK / ndcgAtK / eligibilityAgreement 및 RANK_CONFIG_V1을 재사용한다. 최신순과 규칙 추천은 같은 시점·후보 집합에서 비교한다. P@3의 관련성 기준은 1 이상, nDCG는 2^relevance−1 gain이다. 다섯 합성 프로필의 macro P@3는 1/15 단위로 바뀌므로 작은 차이를 통계적 우월성으로 해석하지 않는다. eligibility의 false ELIGIBLE(정답 INELIGIBLE)와 unsupported ELIGIBLE(정답 UNKNOWN)을 분리하고 모두 보고한다. 분모 0은 null이다.

외부 enrichment observation은 package/head/config hash와 40개 opportunity ID·evidence ID에 결속되어야 한다. 허용 입력은 topicCodes뿐이며 조건·기한·라벨·ranker를 변경할 수 없다. 같은 candidate set을 검증한다. provider 또는 인간 승인은 별도다.

media-report는 실제 HTML bytes를 파싱해 HTML_ONLY를 실행하고, 두 provider 모드는 결과가 없으면 NOT_RUN이다. 별도 승인 환경에서 확보한 엄격한 media-observation-v1 JSON을 --ocr-observation / --hcx-observation으로 넣어 비교할 수 있다. JSON Schema는 export/schemas에 있다. mode별 정확히 20개 original image/HTML hash와 manifest hash가 필요하다. provenance는 SYNTHETIC_PROTOCOL 또는 IMPORTED_UNVERIFIED이며 임의 파일로 실제 유료 측정 승인을 주장할 수 없다. 이 CLI에는 외부 API 키·endpoint·유료 실행 플래그가 없다.

독립 미디어 검토의 수정 판정까지 평가하려면 다음과 같이 별도 media 원장을 지정한다.

~~~sh
node tools/evaluation/run.mjs media-report --fixtures <media/assets> --review-package <media/package.json> --ledger <media/ledger.json> --reference INDEPENDENT --authority <private_registry.json> --authority-sha256 <별도_pin>
~~~

이 모드는 현재 유효한 실제 인적 서명으로 판정된 poster/temporal 사례만 정답으로 사용한다. 미작성 사례는 제외하고 gold coverage를 별도로 표시하며, 인적 정답이 하나도 없으면 정확도는 null / INDEPENDENT_NOT_RUN이다. 원장에 저장된 field value/bbox/eligibility 및 revision 판정 수정이 실제 비교에 반영된다. --reference SYNTHETIC_TEST는 테스트 서명의 정답 소비 경로를 재현하는 명시적 시험 옵션이며 결과는 SYNTHETIC_SIGNED_REFERENCE이고 인적 완료는 늘지 않는다. 옵션을 생략하면 처음부터 표시된 authored synthetic reference 비교만 수행한다.

condition precision/recall, exact field value, bbox IoU, quote+source+bbox citation support, required evidence Recall@3, UNKNOWN, 오류/coverage, false/unsupported ELIGIBLE, 신청 마감 정확도, token/KRW/latency를 보고한다. 비용·token 관측이 없으면 null이며 0원으로 만들지 않는다. 20개 관측의 latency는 50-sample 성능 gate가 아니다. 시간 12건은 기존 selector로 실제 실행하고 revision/원본 SHA/span·미래 시점 누출 0 여부를 보고한다. authored reference와의 일치는 인적 gold를 대신하지 않는다.

benchmark는 실제 로컬 core 40개 계산 50회, 로컬 Map 재사용 50회, 서로 다른 20개 방향을 100회 전환한 시간을 기록한다. 네트워크/model 경로가 없는 순수 core 실행이므로 외부 모델 호출은 0이다. API/브라우저/NCP·운영 캐시·Laya ON은 NOT_RUN이며 코드 루프 결과로 대체하지 않는다. 환경과 시각, p50/p95/max를 같이 보관한다.

## 회귀 검증

~~~sh
npm exec -- tsc -p tools/evaluation/tsconfig.json
npm exec -- tsc -p tools/evaluation/tsconfig.tests.json
npm exec -- vitest run tests/evaluation/independent-review.test.ts tests/evaluation/recommendation-report.test.ts tests/evaluation/media-fixtures.test.ts tests/evaluation/media-review.test.ts tests/evaluation/media-comparison.test.ts --maxWorkers=1
node --test tools/evaluation/tests/cli.node.mjs tools/evaluation/tests/review-html.node.mjs
node tools/evaluation/run.mjs fixtures --action check
~~~

테스트 서명은 SYNTHETIC_TEST만 사용하며 repo에 인적 gold를 남기지 않는다. 실검토 200건·32건, 실기관 원본 권리, 실제 provider 및 장치/접근성 측정, D01/D02 인수는 담당자가 실제 수행하고 별도 증거를 남겨야 한다.
