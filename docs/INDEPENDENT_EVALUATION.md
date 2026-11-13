# HUFS One AI — 독립 추천·미디어·시간 검증

**현재 상태:** 합성 평가 자료/검토 HTML·Ed25519 서명/append 원장 코드와 순수 코어·오프라인 평가 도구는 존재한다. 하지만 **실제 비작성자 사람 정답: 추천 0/200, 포스터 0/20, Temporal 0/12(합계 0/32)**. 코드 생성 서명·AI가 채운 라벨·자체 평가와 사람이 실제 읽고 검수한 Gold를 구별한다. 독립 사람 Gold는 본선 전 작업 범위에서 제외되어 있으며 완료/PASS가 아니다. 실제 추천 품질은 [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281), 운영 인수는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에서 추적한다.

외부 도구의 소규모 개발 비교는 [OSS 실측 기록](oss/README.md)에서 별도로 관리한다. HTML 문자열 보존 실험을 추천/미디어의 독립 Gold 또는 실모델 정확도에 합산하지 않는다.

## 고정 평가 범위

| 세트 | 모수 | 목적 |
| --- | ---: | --- |
| 추천 | 합성 공고 40 × 가상 학생 5 = 200 | 관련성 0/1/2·ELIGIBLE/INELIGIBLE/UNKNOWN/모든 조건/원문 근거 |
| 추천 튜닝/보고 | 공고 20/20 고정 분리 | 동일 코퍼스의 성능 조정과 최종 보고 혼용 금지 |
| 멀티모달 | 별도 원본 PNG/HTML 20쌍 | 이미지/PDF/OCR bbox·출처/자격/날짜·오독 정답 |
| Temporal | 12 정정/마감/취소/관찰 asOf 사례 | 미래판본 누출·철회·citation/정정 정확성 |

## 오프라인 준비

개인 원본/학교 저작물/실제 Provider 키 없는 승인된 checkout에서 실행한다.

```sh
npm run build:contracts
npm run build:evaluation
node tools/evaluation/run.mjs fixtures --action check
node tools/evaluation/run.mjs export --head <정확한_40자_SHA> --out local_only/evaluation/review-run
```

내보낸 `local_only` HTML/검토 패키지는 Git·CI·외부 LLM에 반입하지 않는다. `recommendation/review.html`·`media/review.html`은 오프라인 리뷰 도구다. 검토자 신원/독립성/서명 권한·scope/만료/철회가 별도로 검증되어야 하고, 작성자 또는 AI가 자체 입력한 라벨은 `HUMAN_GOLD`로 처리하지 않는다.

## 정정 판본의 별도 합성 분석

기본 추천 보고서는 기존 r1 40개 공고와 고정 튜닝/보고 구간을 사용한다. 정정·취소·연장 5개 chain의 SourceRevision 처리 결과를 함께 보려면 `report`에 **`--revision-scenario true`**를 명시한다. 값 없는 플래그, `1`·`yes`·`TRUE` 등의 값은 거부하며 `false` 또는 생략은 기본 보고서와 같다.

```sh
node tools/evaluation/run.mjs report \
  --package local_only/evaluation/review-run/recommendation/package.json \
  --ledger local_only/evaluation/review-run/recommendation/ledger.json \
  --revision-scenario true \
  --out local_only/evaluation/review-run/revision-report.json
```

추가되는 `revisionScenario`는 고정 `demoAsOf`에서 gate를 통과한 공고·판본 ID, 격리 사유, 라벨 범위, UNKNOWN·상위 3개 다양성 비교를 담는다. 기존 `splits`·원본 fixture·평가 기준선은 바뀌지 않는다. 독립 라벨이 0개이면 정확도 비교는 `NOT_RUN`/`null`이며, 라벨 없이 계산한 다양성과 UNKNOWN 비중만 표시한다.

**라벨은 공고 ID와 원문 판본이 모두 일치할 때만 사용한다.** `labelPolicy: EXACT_SOURCE_REVISION`에 따라 r1 검토 패키지의 라벨·서명을 r2에 옮기지 않는다. 현재 overlay의 `SYN-SRC-002-r2`와 `SYN-SRC-021-r2`는 `unreviewedRevisionIds`에 표시된다. `--reference TRACK_OWNER_SELF`를 쓰더라도 두 판본의 기존 라벨은 빠지며, 37개 gate 통과 공고 × 5프로필의 185칸 중 175칸만 기존 초안과 결속한다. 이 자체 초안 수치는 독립 정확도가 아니다. 새 판본의 정확도 수락에는 해당 판본을 대상으로 하는 별도 검토가 필요하다.

## 실제 사람 검토

1. 검토 대상 **정확한 SHA/fixture/hash·원문 paragraph/span·권리** 고정. 작성자/초안 생성자와 분리된 검토자와 판정 규칙/Ed25519 권한을 독립 확인.
2. 사람은 사례별 조건·관련성/불확실성·오독·bbox/시점·정정 근거를 실제 읽고, 판정/수정 이유·보류 사유를 입력하고 **검토자 자신의 서명**을 남긴다.
3. 검증된 서명/범위·append-only ledger의 수정/replay·충돌 처리를 통과한 `LABELLED`만 사람 Gold 집계. `HOLD/NOT_RUN`을 0점·정답으로 채우지 않음.
4. 사람 Gold 기반으로 P@3/nDCG@3, 조건 precision/recall, 중대한 거짓 ELIGIBLE·잘못된 asOf/출처, OCR bbox IoU와 model/token/KRW 비용을 재산출. 실 Provider 호출은 별도 이용권·예산 승인 이후에만.
5. 실패는 개인 원문을 제거한 **합성 최소 반례**로 기록하고 [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281)·[#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)의 인수와 연결한다. 원래 사람이 본 권리 있는 자료는 제한 원장에만 연결한다.

## 목표·한계

- 추출 핵심 필드 recall 90%와 중대한 거짓 지원가능 0건은 **목표**, 지금의 검증 PASS가 아니다.
- HTML_ONLY 합성 조건 recall 27/49는 실제 OCR/HCX 성능과 다르고 목표 충족을 뜻하지 않는다.
- 합성 5슬롯은 개인 학업 원본 제출 4명과 별개이며, 실제 원본 소유자·학교 RulePack 독립 대조는 [B03 인수](HUMAN_ACCEPTANCE_GATE_20261104.md)가 필요하다.
- 실 호스트/실 계정/실기기/스크린리더 등은 평가 HTML+CI로 완료 표시하지 않는다.

**진행·증거:** [STATUS](../STATUS.md), [REPORT](../REPORT.md), [추천 인수 #281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281), [운영 통합 #276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276).

## 연례 행사 전망의 과거 시점 평가 (#506)

`packages/core/src/evaluation/activity-rolling-origin.ts`는 수강 개설 평가와 별도로 실제 `forecastActivity`를 호출한다. 아래 명령으로 합성 입력의 평가 결과를 무시되는 로컬 파일에 생성할 수 있다. 지원 Node 22.22.2/24.15.0 이상을 사용하며 기존 파일을 덮어쓰지 않는다.

```powershell
npm run build:contracts
npm run build:evaluation
node tools/evaluation/run.mjs activity-evaluate --input tools/evaluation/fixtures/activity-origins.synthetic.json --out local_only/activity-origins.json
```

입력의 `datasetKind`는 SYNTHETIC 또는 REAL_APPROVED이며, 모든 기록/정답의 provenance와 일치해야 한다. `subjects`는 명시적인 organizationId/seriesId 목록, `origins`는 과거 asOf/targetYear 목록, `records`는 수정/취소/철회를 포함한 `ActivityRecord` 판본 원장이다. `outcomes`는 독립적으로 준비할 정답 원장이며 outcomeId/revisionId, 조직/행사군/연도, HELD/CANCELLED/UNKNOWN, HELD의 eventDate, verifiedAt, rights, review, provenance를 담는다. 날짜를 모르는 개최·미검수·권리 없는 정답은 점수로 메우지 않는다. 조직/행사군은 200개, origin 16개, 기록/정답 각각 10,000개까지 검증한다. 이미 알려진 확정/취소나 개최 후 origin은 평가에서 제외한다. Gold의 최신 판본은 `truthAsOf`에서 선택하고, 당시 이미 정답이 알려졌는지는 origin별 Gold head로 따로 확인한다. 같은 최신 head의 충돌과 독립 outcome ID 간 정답 충돌은 격리한다.

OUTLOOK은 실제 기간 전망이고 PREVIOUS_YEAR는 같은 origin에 보이는 **정확히 전년도**의 확정일을 대상 연도로 옮긴 점 기준선이다. 전년도 기록이 없으면 더 오래된 해로 대체하지 않는다. 윤년 2/29는 비윤년 2/28로 접는다. `scored`는 두 방법에 공통인 held-out 대상 수이며 답변/보류, HELD의 답변/기간 포함/미포함, 포함 기간까지 일수 거리와 중점 절대오차의 합, 답변 기간 폭(양끝 포함)을 제공한다. `cancelledWindows`는 실제 취소된 행사에 표시한 예상 기간 수다. 보류는 정확하거나 틀린 날짜로 바꾸지 않는다. `paired`는 둘 다 답한 동일 대상만 따로 집계한다. 넓은 기간의 포함률과 단일 날짜 적중률만 비교해 우열을 주장하지 말고, 폭·오차·취소 오표시·보류 및 각 분모를 함께 확인해야 한다. 두 개 이상의 서로 다른 origin에서 점수를 낸 READY는 평가 가능 상태이며 품질/출시 통과가 아니다.

CLI는 입력 바이트 및 실제 실행 evaluator/model/contracts JS의 해시를 보존하고 표준 출력에는 저장 여부만 쓴다. 실자료 입력과 결과는 권리 있는 운영자만 NCP/제한된 경로에서 처리하며 공개 Git/이슈/웹에 올리지 않는다. `HUMAN_VERIFIED`는 입력의 주장일 뿐 이 도구가 서명/검수자 독립성을 인증하지 않는다. 따라서 결과는 항상 `reviewAssurance: DECLARED_REVIEW_ONLY`, `independentAcceptance: NOT_RUN`, `releaseEligible: false`다. 제공 fixture는 전부 생성한 합성 데이터이며 실제 채널/연도별 독립 Gold·실자료 성능·사람 시연 인수를 대신하지 않는다. 실제 판본·권리·검수자 독립성 확인은 #360/#446/#506의 운영 인수에서 별도로 수행한다.
