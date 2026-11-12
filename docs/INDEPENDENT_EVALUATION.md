# HUFS One AI — 독립 추천·미디어·시간 검증

> **2026-11-12 현행 문서 동기화:** [PR 36개·Issue 31개 감사 및 33/30 OPEN 스냅샷](REVIEW_AND_ISSUE_AUDIT_20261112.md). 이전 완료/PR 수치·운영 상태는 과거 시점 기록입니다. NCP 실운영·기관 권리/실원문·독립 Gold는 별도 인수이며 `NOT_CONNECTED / NOT_RUN / RELEASE_BLOCKED`를 유지합니다.

> **2026-11-11 기준:** 아래 Gold 분모·표본 수는 과거 조사 당시 수치이며, 이번 감사에서 새 사람 검수 실측값으로 갱신했다고 주장하지 않습니다. 운영 평가 인수는 [#360 사용권/Gold](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)·[#446 실제 검수](https://github.com/ot4562-glitch/HUFS-One-AI/issues/446)·[#452 AI QA](https://github.com/ot4562-glitch/HUFS-One-AI/issues/452)와 [11월 11일 전수 감사](REVIEW_AND_ISSUE_AUDIT_20261111.md)를 따릅니다. [#480 지표 PR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/480)의 macro-F1/Recall@k·MRR/span agreement 합성 CI 성공은 독립 사람 Gold/실모델 성능을 입증하지 않습니다. `NOT_RUN / RELEASE_BLOCKED`를 유지합니다.


**현재 상태:** 합성 평가 자료/검토 HTML·Ed25519 서명/append 원장 코드와 순수 코어·오프라인 평가 도구는 존재한다. 하지만 **실제 비작성자 사람 정답: 추천 0/200, 포스터 0/20, Temporal 0/12(합계 0/32)**. 코드 생성 서명·AI가 채운 라벨·자체 평가와 사람이 실제 읽고 검수한 Gold를 구별한다. 독립 사람 Gold는 본선 전 작업 범위에서 제외되어 있으며 완료/PASS가 아니다. 실제 추천 품질은 [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281), 운영 인수는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에서 추적한다.

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
5. 실패는 개인 원문을 제거한 **합성 최소 반례**로 기록하고 현행 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)·[#446](https://github.com/ot4562-glitch/HUFS-One-AI/issues/446)·[#452](https://github.com/ot4562-glitch/HUFS-One-AI/issues/452)의 인수와 연결한다. 원래 사람이 본 권리 있는 자료는 제한 원장에만 연결한다.

## 목표·한계

- 추출 핵심 필드 recall 90%와 중대한 거짓 지원가능 0건은 **목표**, 지금의 검증 PASS가 아니다.
- HTML_ONLY 합성 조건 recall 27/49는 실제 OCR/HCX 성능과 다르고 목표 충족을 뜻하지 않는다.
- 합성 5슬롯은 개인 학업 원본 제출 4명과 별개이며, 실제 원본 소유자·학교 RulePack 독립 대조는 [B03 인수](HUMAN_ACCEPTANCE_GATE_20261104.md)가 필요하다.
- 실 호스트/실 계정/실기기/스크린리더 등은 평가 HTML+CI로 완료 표시하지 않는다.

**진행·증거:** [STATUS](../STATUS.md), [REPORT](../REPORT.md), [추천 인수 #281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281), [현행 운영 통합 #445/#447](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445).
