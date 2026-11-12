# HUFS One AI — SourceRevision·미디어·Temporal RAG 현재 계약

> **2026-11-12 현행 문서 동기화:** [PR 36개·Issue 31개 감사 및 33/30 OPEN 스냅샷](REVIEW_AND_ISSUE_AUDIT_20261112.md). 이전 완료/PR 수치·운영 상태는 과거 시점 기록입니다. NCP 실운영·기관 권리/실원문·독립 Gold는 별도 인수이며 `NOT_CONNECTED / NOT_RUN / RELEASE_BLOCKED`를 유지합니다.

## 목적과 운영 상태

시점별 바뀌는 공고·학칙·포스터·PDF에서 **누가 어떤 원문·권리·판본·근거를 언제 확인했는가**를 재현하고, AI가 허가되지 않은 자료로 적격·마감/졸업을 확정하지 못하게 한다. SourceRevision/수집 job·HTML/IMAGE/PDF·검수/검색/인용/권리·Temporal API/SQL 경계 코드는 존재하나 **프로젝트 승인은 소유자 완료 확인**했지만 실제 기관 자료 이용권의 적용 범위·운영 DB/실 OCR/HCX·사람 정답 판정은 미검증입니다. `RELEASE_BLOCKED`.

## 수집→검수→검색 상태

1. **허가 확인:** SourceClass와 URL/필드·collect/store/display/AI transmit, actor/소유 목적·현재 동의·저장 기간/철회. 권한 미확인/만료면 원문 요청/DB 저장/모델 외부 전송 금지.
2. **수집:** exact HTTPS allowlist, DNS/IP pin·redirect/응답 크기/취소/시간제한·중복 요청의 원자 job/lease·전역 single executor, GET 직전 권리 재확인.
3. **불변 저장:** 원본 전체 SHA·문단 순서/anchor SHA, sourceId/revisionId, ETag/Last-Modified·304 확인 시각을 검수/발행 시각으로 자동 승격하지 않음.
4. **미디어:** PNG/JPEG 원본과 실제 OCR bbox, PDF 지원 v1 한도/원본/페이지 PNG·좌표계/페이지별 SHA 검증. OCR 후보는 독립 reviewer가 원문/문장·인용을 확인해야 공개 승인 가능.
5. **시간/권한:** `publishedAt/observedAt/reviewedAt/asOf` 차이, 미래 판본·나중 검수/철회·cache scope 축소 뒤 숨겨야 할 문단/수치·메타데이터 노출 차단.
6. **검색/표시:** 현재 actor·SharingGrant/SourceRights·서명된 검수·source head/version에 묶인 최소 extractive 근거만 검색→React/AI에 제공. `READY/NO_EVIDENCE/STALE/CONFLICT/BLOCKED_RIGHTS/UNKNOWN`을 명확히 표시.

## AI와 비용

구조화 HCX·OCR·Vision은 필요한 경우만(규칙/단순 HTML 우선), `SafeLlmPacket`에 actor/권리/원문 SHA/문단·bbox/asOf·policy/schema/model/prompt 버전과 허용된 사실만 싣는다. LLM의 문장을 사실로 채택하기 전 정확한 인용/숫자/조건/보안 필드 재검증, 거짓 확정 자격·마감 0을 목표로 검증한다. 네 제품 AI 작업 외 임의 외부전송/자동 크롤링 금지. 예산 예약/전송/정산은 원자 ledger와 timeout/UNKNOWN_BILLING 보호.

Laya는 선택 보조 worker/기본 OFF, CPUQuota/RSS/OOM/네트워크·시간 제한/kill-switch·코드 fallback, API 사용자 응답 경로 우선. 프로젝트 승인 여부와 별개로 실 모델 다운로드/ON/유료 호출은 구체적인 현재 이용권·비용 상한·자원 제한·복구 증거를 검증한 구성에서만 실행합니다.

## 자동·독립 검증

- 합성 normal/denial: 304/동일판·정정·취소·global lease·source 권리 축소, 비허가 media/탈취·늦은 AI 응답·미검수 미래 시점 인용/캐시 누출.
- disposable PG: source head/revision·RLS·current rights·page/bbox·writer/reviewer/reader 분리와 rollback/동시성.
- 실제 독립 사람: 추천 Gold 200·포스터 PNG/HTML 20·시간 정정12 사례의 원문/인용/bbox/시점 판정. 현재 **0/200·0/32**, 합성 시험과 구분.
- 실제 Provider/NCP/원본 권리: 프로젝트 승인 `OWNER_CONFIRMED_APPROVED`; 실제 구성·호출·원본/권한 대조는 `NOT_RUN/RELEASE_BLOCKED`. 실제 tokenizer·receipt·token/KRW·호스트 CPU/RSS·p95/회복성 별도 검증.

**정본:** [Architecture A04/A06/A13](../Architecture.md) · [PDF runtime](../infra/ai/PDF_RUNTIME.md) · [데이터 권리](DATA_GOVERNANCE.md) · [인적 Gold](INDEPENDENT_EVALUATION.md) · [#253 코드](https://github.com/ot4562-glitch/HUFS-One-AI/issues/253) · [#252 실인수](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252).
