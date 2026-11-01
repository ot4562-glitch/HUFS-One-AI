# HUFS One AI | 시간·이미지·근거 검증형 RAG와 Laya 운영 계약

> **2026-11-01 구현·운영 경계(정본):** SourceRevision/Temporal RAG·permission-first PG/HTTP는 [#58](https://github.com/ot4562-glitch/HUFS-One-AI/pull/58)·[#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83)로 `main` 병합. 독립 원본 SHA·capturedAt/문단 ordinal 검수 부정 경계 [#99](https://github.com/ot4562-glitch/HUFS-One-AI/pull/99), 리스 만료와 중복 실행을 막는 PG session advisory lock [#113](https://github.com/ot4562-glitch/HUFS-One-AI/pull/113)도 main 병합·합성/일회용 PostgreSQL CI 확인. **실제 기관 수집권·PDF/포스터 OCR 원본/이미지 20건 독립 인용 검증, Recall@k, 운영 NCP/CLOVA/Laya/권리/크롤링 승인·배포는 전혀 완료되지 않았다.** 아래 2026-10-31 '미구현'은 당시 설계 기록이다. [최신 상태](../STATUS.md).



> **상태: 제안된 설계 계약(미구현·미배포·미결제)** · 2026-10-31
> 기술 정본: `Architecture.md` A04/A05/A06/A07/A12/A13/A14/A15/A17, 본 문서는 그 절의 구현 세부 조건이다. 계약 변경은 통합 담당 심민성 주관의 별도 PR 및 소비자 교차검토 이후 확정한다. 학생 원본·실제 기관 계정·클라우드 자원 생성 권한은 부여하지 않는다.

## 1. 목적과 비목적

**목적:** HUFSAbility 및 이용 허용된 공식 취업·비교과·대외활동·학사 공고의 HTML, 포스터 이미지, PDF에서 **누가·언제·어떻게 신청하는지**를 근거와 함께 정제한다. 수정·취소·연장 공고를 시간순으로 관리하고, 검색 근거가 부족할 때 LLM이 추측한 자격·마감·학사판정을 노출하지 않는다.

**비목적:** 무허가 로그인 페이지 크롤링·학교 DB/API 연동, 단순 공개 게시글의 무조건적 복제·외부 전송, LLM 단독 졸업판정, 실시간 처리 보장, 기존 학습형 추천 엔진 교체, 대규모 벡터DB/자율 웹브라우저, 학생 원본을 Laya·CLOVA에 보내기. 개발용 AI와 제품의 HCX-005·HCX-007은 별개다.

## 2. 실제 결정한 배치와 활성화 경계

- **NCP 컴퓨트 선택:** 한국 리전 Linux `High Memory-g3` **4 vCPU·32GB RAM + 별도 CB SSD 50GB**, 단일 서버(HA 아님), 네트워크 차단·자동 재시작·최소 권한. 공식 한국 리전 VPC 컴퓨트 공개 단가 기준 **326원/시간, 약 234,240원/월(VAT 별도)**는 **견적 기준점**일 뿐 실청구액이 아니며 VPC/리전/크레딧 적용·Block Storage·백업·IP·트래픽은 콘솔에서 별도 확인한다.
- **같은 VM의 서비스:** 인증된 React 정적 자원 전달/Node Fastify API, PostgreSQL(적은 연결·권한 분리), 제한된 `ingest-worker`, 검색 인덱스, **Laya 멀티링구얼 CPU worker**. DB를 인터넷에 직접 노출하지 않는다. 이미지·원문은 승인 범위에 따라 암호화된 비공개 볼륨 또는 권한 제한 Object Storage에 두며 익명 공개·직접 IP 접근을 차단한다.
- **Laya:** `convaiinnovations/laya`의 **322M 파라미터 multilingual** checkpoint를 Apache-2.0 라이선스와 정확한 revision/hash로 고정한다. 공개된 **ONNX FP32 CPU** 경로를 우선 비교하고 지원 ONNX Runtime 버전(공개 export 기준 **1.23+**)을 잠근다. 가중치·개인 입력·결정 로그를 GitHub/CI에 올리지 않는다. 사전 탐색이 아닌 **공고 문서종류·검수 필요도·복잡한 이미지의 HCX 우회/호출 결정 후보**에만 사용하며 단독 자격/신청마감 확정 금지.
- Laya는 실제 사전 측정 전 **의무 실행이 아닌 기본 비활성 feature flag**로 둔다. 모델 설치/실행 선택은 이번 **설계 승인** 범위에 포함하되, 서버 생성·다운로드·실행·개별 모델 비용은 명시적 배포/결제 승인 뒤 수행한다. Laya 비활성/오류/지연이면 항상 확정적인 규칙 기반 분기(필수 OCR·확인 필요 상태)로 돌아간다.
- **CLOVA General OCR:** 수집 권한이 확인된 새 이미지·변경 이미지의 1차 문자·라인·좌표 파서. 형식은 JPG/PNG, 조건에 맞는 PDF/TIFF. **이미지 장축 8,000px 미만(한국 API, 2026-04-23 이후)** 등 최신 API 요구를 검사하고, DPI/가로세로 원본 좌표 변환을 기록한다. PDF 페이지/표 추출은 별도 비용·페이지 정책을 선검토한다.
- **HCX-005 Vision:** OCR 누락/충돌·혼합 레이아웃·세로 포스터·장식적 텍스트/표 등 신호가 있는 경우만 **OCR과 병행 분석**. 원본 이미지와 OCR 구역을 함께 제공하되 **출력은 후보**이며 확정 출처가 아니다. 이미지당 토큰/해상도/호출가능성은 배포 당일 공식 API에서 검증. HCX-005의 Structured Outputs 지원을 가정하지 않는다.
- **HCX-007:** 네 기존 제품 AI 작업(`experience_skills`, `opportunity_terms`, `personal_action_brief`, `graduation_explanation`)의 허용된 텍스트 구조화/설명 단계. **OCR·Vision·검색·Laya는 새 공개 `/api/ai/{task}`가 아니라 내부 공통 입력 파이프라인**이다.
- **RAG:** 로컬 Postgres 메타데이터 + 정확 필드/날짜 필터 + 접근 통제 + 한국어 토큰/정규화 기반 keyword 검색(필요하면 `pg_trgm`)으로 출발한다. 임베딩/pgvector/유료 Reranker는 합성 데이터 Recall@k 개선이 확인된 경우에만 별도 승인 후 활성화. 별도 GPU·매니지드 RAG 상시 과금 없음.

## 3. 수집 및 확인 상태기계 (비동기·재현 가능)

`DISCOVERED → PERMISSION_CHECKED → SNAPSHOTTED → MEDIA_EXTRACTED → FIELD_CANDIDATES → EVIDENCE_VERIFIED → CURATOR_APPROVED → ACTIVE`.

실패 경로: `BLOCKED_RIGHTS`, `BLOCKED_PRIVACY`, `NEEDS_REVIEW`, `STALE`, `RETRACTED`. 권한·이용범위 미확인 문서는 연구 근거로만 두고 제품 활성 데이터나 NCP 모델 입력으로 보내지 않는다. 원본 스냅샷/해시·정정 이력을 지우거나 소급 덮어쓰지 않는다. 공개 링크라는 사실만으로 다운로드·재게시·CLOVA 전송 허용이라고 간주하지 않는다.

1. **발견:** 승인한 allowlist 출처의 RSS/공식 공개 API 우선, 허용된 페이지의 조건부 GET(`ETag`, `Last-Modified`) 보조. CAPTCHA/로그인·robots/이용약관 우회 금지. 실패 시 기존 데이터를 무조건 현재 정보로 표시하지 않는다.
2. **변경 감지:** URL canonicalization, HTTP validator, 문서/첨부 각각 `SHA-256`, 연결된 정정공지·부서와 시간값을 기록. 내용 불변이면 모델/OCR 호출하지 않고 HTTP 검증시각만 별도 갱신. 조건·마감·지원대상 수정은 버전/사건으로 보존한다.
3. **이미지 전처리:** MIME magic, 크기·해상도·페이지수·이미지 hash, 바이러스/외부 참조·PDF 스크립트/첨부 위험, EXIF/GPS/얼굴·개인정보 정책 검사. 필요 최소 구역만 보관·전송. 문자 수신권·저작권/수집권을 별도 확인한다.
4. **OCR 기본:** text/line/block·원본 픽셀 좌표·OCR 결과 hash와 엔진 버전·호출시각 보존. 장축 기준 제한에 맞춘 변환은 `coordinateTransform`으로 복원하며 글자 좌표를 추측하지 않는다. 이미지 OCR이 빈 결과여도 '글자 없음'이라는 사실 단정 금지.
5. **선택적 HCX-005 Vision:** OCR 충돌/누락, 날짜·자격 필드 미검출, 레이아웃 높은 복잡도, 배경·표·세로형 공고일 때만 후보 요청. 작업당 예약 예산·입력토큰·출력토큰 및 고유 이미지해시 캐시 키를 검사. Vision 서술만으로 숫자·마감·적격을 승인하지 않는다.
6. **정형화:** HTML·OCR·Vision의 원문 구역을 각각 `SourceSpan`으로 연결. `studentDeadline`, `applyClosesAt`, `adminReportDeadline`, `eventStart` 등을 섞지 않고 날짜의 시각/타임존/말일/범위(지원 마감 vs 행사) 표시. 자격·우선선발·수료·제외·변경조항은 따로 분류.
7. **시간 RAG:** actor/source 권한, `asOf`, 문서 `validFrom/validUntil`, 학번/캠퍼스/전공 적용범위, SOURCE 승인여부로 선필터. 동일 정정사건의 구본·신본을 함께 비교하고, 현재 확정 출처와 충돌하면 `NEEDS_REVIEW`로 격리.
8. **안전 입력:** `SafeLlmPacket`은 검색한 *허용 근거 구역만* token+문단+이미지구역 증거로 전달. 포스터와 웹의 지시문은 분석할 텍스트이지 도구 명령이 아니다. 외부 임의 URL 접근/전송 금지.
9. **증거 판정:** JSON/Zod → 신원/권한 → 정확 문구·이미지 구역 → 주장과 인용의 실제 의미 일치 → 최신성·정정·날짜 종류 → 인간 최종검수. 리스크 높은 지원자격·미이수/학칙·마감은 LLM 자가검증만으로 VERIFIED 금지.
10. **게시·무효화:** 승인된 `ACTIVE`만 추천/공지에 투입. 승인된 sourceVersion 바뀌면 RAG 인덱스, 검증된 claim, 추천·공지 cacheVersion을 원자적 이벤트/트랜잭션으로 갱신. 실패 시 종전 결과를 무단 재활성화하지 않는다.

## 4. 공통 계약 타입: 다음 PR에서 Zod vNext로 승격

기존 `SourceSnapshot`, `EvidenceSpan`, `Opportunity`, `NoticeResult`, `SafeLlmPacket`을 깨지 않도록 **추가 확장 타입**부터 도입한다. 이 PR에서는 실제 `packages/contracts` 구현을 변경하지 않는다.

```ts
type MediaKind = 'HTML'|'IMAGE'|'PDF'|'TEXT';
type ParseEngine = 'HTML'|'CLOVA_OCR_GENERAL'|'HCX_005_VISION'|'HUMAN';
type ClaimState = 'CANDIDATE'|'NEEDS_REVIEW'|'VERIFIED'|'REJECTED'|'STALE';
type RetrievalState = 'READY'|'NO_EVIDENCE'|'STALE'|'CONFLICT'|'BLOCKED_RIGHTS';

interface SourceRevision {
  snapshotId:string; sourceId:string; supersedes?:string;
  originalSha256:string; contentSha256:string; mediaKind:MediaKind;
  publishedAt?:string; fetchedAt:string; lastCheckedAt:string;
  lastVerifiedAt?:string; validFrom?:string; validUntil?:string;
  applicableScope?:{campus?:string; majorCodes?:string[]; cohortRange?:[number,number]};
  permissionRef:string; provenance:'REAL_APPROVED'|'SYNTHETIC'|'RESEARCH_ONLY';
  changeKind?:'NEW'|'CORRECTED'|'EXTENDED'|'CANCELLED'|'UNKNOWN';
}
type SourceSpan =
 | {kind:'TEXT'; sourceRevisionId:string; paragraphId:string;
    startCodePoint:number; endCodePoint:number; quote:string}
 | {kind:'IMAGE'; sourceRevisionId:string; assetId:string; pageIndex:number;
    bboxNorm:[number,number,number,number]; ocrLineIds:string[];
    quote:string; extractionEngine:ParseEngine; transformVersion:string};
interface VerifiedClaim {
  claimId:string; field:string; value:string|number|boolean;
  sourceRevisionId:string; evidence:SourceSpan[];
  state:ClaimState; claimCheckedAt?:string; reviewerId?:string;
  risk:'LOW'|'HIGH'; dateKind?:'APPLY'|'STUDENT'|'ADMIN'|'EVENT';
}
interface RetrievalEnvelope {
  queryVersion:string; asOf:string; sourceRevisionIds:string[];
  permissionPolicyVersion:string; retrievalConfigVersion:string;
  retrievalState:RetrievalState; evidence:SourceSpan[];
}
interface DecisionAdvice {
  model:'laya-multilingual'; modelRevision:string; inputHash:string;
  optionsVersion:string; decision:'SKIP'|'OCR_ONLY'|'ESCALATE_VISION'|'HUMAN_REVIEW';
  confidence?:number; policyOverridden:boolean;
}
```

- `bboxNorm=[x1,y1,x2,y2]`는 원본 페이지별 **0~1 정규화 좌표**이고 0≤x1<x2≤1, 0≤y1<y2≤1을 Zod로 제한. OCR/표 변환 이력이 없으면 `IMAGE` 근거 생성 금지. 원본 이미지 원격 미공개와 UI에서 인용구역 표시 권한은 별개.
- `publishedAt`=게시, `fetchedAt`=실제 다운로드, `lastCheckedAt`=변경 확인, `lastVerifiedAt`=사실 검토 완료. timestamp는 UTC offset ISO8601, 조회 UI는 Asia/Seoul. `lastCheckedAt`만 갱신했다고 `lastVerifiedAt`을 자동 변경하지 않는다.
- `sourceVersion`/해시가 달라지면 관련 claim 및 검색 색인 버전도 갱신. 새 `asOf`로 과거를 재생할 때는 `asOf` 이후 발행·취득·검수된 문서의 미래 정보 노출 금지(look-ahead). 현재시각을 호출시 읽는 코어 금지.
- 외부 AI가 생성한 자유 URL이나 학생/주최자의 공식 승인 주장 거부. 결정 모델의 `confidence`는 사실의 진실확률·지원가능성 %로 사용하거나 사용자에게 표시하지 않는다.
- 네 가지 제품 AI 작업은 유지. `retrievalEnvelope`, `imageSpanIds`, `sourceVersion`, `permissionVersion`, `mediaExtractorVersion`을 서버 내부 `SafeLlmPacket` 어댑터에 추가한다(별도 계약 PR).
- #16에서 요청된 `NoticeItem.overdue?` 공식 Wire(기존 `composeNotices().overdueIds`와 별개)와 source/claim 계약 vNext 변경은 **별도 #44 계약 PR·독립 리뷰/CI 및 작성자 코어 직렬화 연계**로 검증한다. #15→#16→#40→#41 순서와 #33→#34 스택을 우회해 개별 병합하거나 데이터를 실제 서비스에 연결하지 않는다.

## 5. 검색 계약: 단순·검증 가능·저예산

- 1단계 `SearchIndex`: `sourceRevisionId`, paragraph/ocrLine/page/bbox, normalized text, 24 TopicCode, 학교·캠퍼스·전공·학번·유형, 신청마감·게시일·효력기간, sourceClass/permission, verified state, event/revision ID를 로컬 PostgreSQL에 인덱싱. 실제 학생 원본은 검색 인덱스로 반출하지 않는다.
- **필수 선필터:** permission/sourceClass → 활성+시간적 유효성 → 해당 사용자에게 공개된 projection scope → 명시 범위 → 최신 confirmed revision. 그 다음 lexical retrieval `topK <= 12`(설계값). 재정렬의 초기 기준은 정확 필드·핵심어·적용범위·게시 최신성·문서 검증상태로 구현.
- Korean PostgreSQL FTS의 형태소 제약을 가정한다. 한글은 문단 정규화·토큰 기반 검색과 `pg_trgm` 후보를 비교하고 Recall@k 검증 전에는 고급 semantic 검색의 효능을 주장하지 않는다.
- 임베딩/pgvector, 외부 유료 Reranker/managed RAG는 필수 의존성이 아니다. 실험 승인이 있다면 비용/latency/Recall@k 개선 시에만 옵트인. 검색 결과가 없어도 모델이 지식을 지어내지 않도록 `NO_EVIDENCE`와 제한된 안내를 반환.
- 정정/취소 문서 충돌시 단일 문장을 임의로 최신 진실로 삼지 않는다. 원문 기관, 공식 업데이트 날짜, revision chain을 보존하고 `CONFLICT`/review route 표시. 검색 결과가 정확히 정렬됐다는 사실은 진실성 보증이 아니다.

## 6. CPU·메모리·시간 예산 (High Memory-g3 4 vCPU/32GB; 가설→실측)

서버 크기/운영 시기/원장 정본은 [NCP 공식 비용·운영](NCP_OPERATIONS_2026.md) 참조. Linux VPC High Memory-g3 4vCPU/32GB는 **코어 4개**, CPU 밀집형 추론은 API 지연과 경합 가능하다. 모델은 기본 OFF이며 cgroup CPU-time 최대 1vCPU로 제한한다.

| 구성 | 32GiB 설계 RAM 상한·예산 (가정) | 미검증 가드 |
|---|---:|---|
| OS/reverse proxy/보안/관측 | 2GiB | 공개 포트/프로세스 최소화 |
| Node/API 및 정적 웹 | 2GiB | Node RSS·GC/p95 |
| PostgreSQL 및 임시 작업 | 6GiB | pool 제한·인덱스/정정 부하 |
| 수집/OCR 입력 검사 워커 | 3GiB | 1 worker·image 상한 |
| Laya ONNX 선택 워커 | 3GiB | MemoryMax=3072M, 기본 OFF |
| OS 페이지캐시·PostgreSQL 검색 여유 | 12GiB | 사용중인 메모리와 별도 실제 측정 |
| 장애 복구 및 기타 headroom | 4GiB | MemAvailable·OOM |
| **합계** | **32GiB** | 고정 예약이 아닌 **사전 성능 배분 가설** |

Laya FP32 raw 가중치 약 1.3GB 추산(322M×4byte) 외에 tokenizer/activation/ORT 메모리가 추가로 필요하다. 실제 NCP에서 API p95 baseline 대비 20% 내 지연·P0 GET 500ms 이하, Laya RSS≤3GiB, 서버 전체 peak<28GiB, MemAvailable>3GiB 및 OOM 0을 **부하 시험으로 증명하기 전 모델 ON 불가**. 실패 시 Laya OFF/규칙 폴백, 자동 VM 증설·GPU 추가 금지.

### 6.1. Laya CPU spike 방어 세부 (정본 [LAYA_CPU_SPIKE_PROTECTION.md](LAYA_CPU_SPIKE_PROTECTION.md))

- **1vCPU CPU시간 상한**: 별도 cgroup의 `CPUQuota=100%`는 이 4vCPU 인스턴스 최대 CPU시간의 **25%**를 제한한다. API·DB 코어 사용 여유는 부하 시험으로 검증한다. 독립 systemd worker, `CPUWeight=10`/`Nice=10`, ONNX Runtime CPU intra/inter thread=1·spinning OFF·OMP/BLAS thread=1로 API/DB와 경쟁을 줄인다. `MemoryHigh=2500M`, `MemoryMax=3072M`, 총 VM peak<14GiB; 상한이 실제 적용되는지 측정 실패하면 `LAYA_ENABLED=false` 유지.
- **백그라운드 전용**: 모델 최초 적재/워밍과 장문/동시 추론은 사용자 요청·심사자 반복 조회 경로에서 완전히 제외. queue≤16·동시 실행 1·최대 512 tokens·30초 대기/20초 작업 timeout, hash/version 기준 dedup/cache, 버전 갱신 후 무효화. API는 언제나 검증된 cache 또는 규칙+검수대기 폴백이며 `REVIEWER` 요청으로 Laya worker/유료 HCX가 실행되지 않는다.
- **스파이크 감시**: host CPU≥70% 20초/VM available RAM<3GiB/GET p95 baseline×1.25 또는 400ms 초과 30초/cpu.pressure 증가 시 PAUSE. OOM·CPU≥90%+API 악화·비정상 p95 반복 시 OFF(수동 재개). 이 값들은 **운영 전 가설**, 인가된 High Memory-g3에서 API p95 기준선 대비 ≤20% 악화, GET p95≤500ms, worker RSS≤3GiB·host peak<28GiB, OOM 0을 실제 확인해야 기능 활성화 가능.
- **학습 불필요**: 초기 시연에서는 30~50건 합성 라벨로 zero-shot Laya ON/OFF·rule-only F1/false skip/CPU 성능을 비교. 파인튜닝·GPU/추가 VM 조달은 기본 범위 밖이다.
- **실제 클라우드/모델 실행 없음**. 실행 서비스 유닛·관측 지표·롤백/runbook 세부는 [Laya CPU 급증 방어 설계](LAYA_CPU_SPIKE_PROTECTION.md)와 [이슈 #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22)를 우선한다.

## 7. 예산 계약: 돈이 없으면 기능을 안전하게 낮춘다

공모전 공식 2026 안내(https://job.hufs.ac.kr/job/imng/icmpNsbjtPgm/findIcmpNsbjtPgmInfo.do?encSddpbSeq=1006089): **본선 진출팀**에만 별도 개발비 **50만 원** 및 **NCP 크레딧 50만 원 상당** 지원 계획. 두 자금을 합산해 크레딧 100만 원으로 해석하지 않는다. 현재 **수령/서비스별 크레딧 적용/세금 처리 미검증**.

| 크레딧 50만 원 중 가상의 운영 상한(제안) | 한도 |
|---|---:|
| **816h 상한 서버+CB+IP 및 부가세 단순 추산** | **305,000원** |
| HCX-005·HCX-007 등 검증된 유료 호출 상한 | 80,000원 |
| General OCR 사용량 상한 | 20,000원 |
| 네트워크·백업·기타 부대비 | 25,000원 |
| 긴급 reserve(승인 없이 사용 금지) | 70,000원 |
| **상한 합계(크레딧 기준)** | **500,000원** |

- 실제 한국 리전 VPC Linux High Memory-g3 4vCPU/32GB **326원/h**, 별도 KVM SSD CB 50GB **0.16원/GB·h = 8원/h**, 공인 IP 1개 **5.6원/h(선택)**. 11/6~12/9 전체 816h (서버+CB+IP 277,113.6원), 본선 발표 11/16 이후 최대 576h (195,609.6원). VAT/이외 상품과 실제 콘솔 청구는 별도. [산식/근거](NCP_OPERATIONS_2026.md).
- OCR General 글자 추출 **3원/건, 월 무료 100건**, 표 추출 추가요금 및 API Gateway 별도. 1,000개 **순수 글자** 요청이 모두 같은 월에 발생하면 가정상 (1,000-100)×3 = **2,700원(VAT/게이트웨이 제외)**. OCR의 저렴함이 Vision의 토큰 사용료까지 포함하지는 않는다.
- HCX-005/007 **정확한 토큰 단가, image 토큰 수, 크레딧 차감 가능 여부, API Gateway·네트워크·스토리지 비용은 출시 전 공식 콘솔에서 견적 확인**. 수치를 임의 고정하지 않는다. 실서비스 예산승인 전에 `AI_ENABLED=false`, `VISION_ENABLED=false`, `LAYA_ENABLED=false`.
- **비용 호출 순서:** 캐시 hit → OCR 필요 → 정규식/필드검증 → Laya(옵트인) → HCX-005(불확실할 때) → HCX-007(사용자에게 필요한 해석만). 각 호출 전 `worstCaseTokens * officialRate`로 예산 원자 예약; 실측 사용량으로 정산. 비용미확정이면 `BLOCKED_BUDGET`.
- 실제 결제/개통 전 필수 확인: 크레딧 사용 자격·시작/만료·VAT·리전·서비스별 제한, 쿠폰 사용 가능, 부가 고정요금 및 카드 과금, `cost alert` vs **하드 kill switch** 차이. 잔액 알림은 지출 중단 기능이 아니므로 승인한 서비스/VM 정지 runbook도 필요.
- **외부 AI 예산**과 서버 인프라 예산은 별도 원장으로 합쳐 보고하며, 전체 phase 예산에 모두 포함. CDN/관리형 DB/추가 GPU/유료 managed RAG는 자동 생성 금지.

## 8. 회귀 시험과 본선 측정 계약

- **합성 이미지 20건**(디자인/가로/세로/표/포스터 겹침/글자 작음/PNG/JPG/PDF): 모집 대상·신청마감·행사일·장학조건·출처·표/각주 anchor exact 검수. 실학생/제3자 저작물 무단 재사용 금지.
- **시의성/버전 12건**: 후속 연장·취소·정정·누락 인덱스·동일 hash·lastCheckedAt-only·동일 시각 상충·타임존·날짜 범위·look-ahead 방지·비활성 구버전·권한철회. `asOf` 이후 자료는 과거 조회/훈련/평가에 절대 포함하지 않는다.
- **기존 40공고×5프로필 최대 200 라벨**은 유지하고, OCR 없이 HTML-only vs OCR+Vision, core-only vs core+HCX vs core+RAG+Evidence, Laya 비활성 vs 활성의 혼동행렬을 별도 분석. 기본 P@3/nDCG@3 + **claim-groundedness**, source-span exactness, critical eligibility false positives, apply deadline type accuracy, image field recall, stale active exposure, temporal leakage count, retrieval Recall@k, cost/request, warm/cold p95.
- **필수 부정 시험:** 모델이 만들어낸 문장/URL·이미지 좌표 위조, 구조화 JSON이라도 원문 지지 없음, OCR 오독(마감 11.02↔11.20), admin deadline↔student deadline, 취소 문서의 캐시 잔존, 권한 없는 저장소·이미지 URL·익명/직접IP 접근, 포스터 안 악성 instruction, Laya 허위 확신, 모델 timeout/429/과금 불명.
- **승인 게이트:** 회귀 포함 전체 통과, 실제 사람이 확인한 일부 anchor set, 무권한/미래자료 노출 **0건**, 중대한 허위 적격/학생마감 확정 **0건** 목표(실측 결과로만 주장). 확정할 수 없으면 `UNKNOWN`/검수대기. 시간·비용·개선치는 before/after 기준 같은 세트·독립 리뷰 조건을 공개한다.
- 데모는 공개 실서비스를 과장하지 않고 **고정된 synthetic 시각 + 변경 전후 두 버전 + 포스터 OCR 박스와 출처 링크**를 보여주는 replay로도 구성 가능. LIVE와 SYNTHETIC/REPLAY 표시를 구분한다.

## 9. 소유권·병합 순서·롤백

| 소유 | 인계 |
|---|---|
| **심민성 / 통합** | 본 계약, contracts vNext, schema/evidence/asOf, budget gates, CI·릴리스 부정 테스트, PR 교차검토 |
| **이서연 / NCP·CLOVA·OCR/Vision·Laya 모델/Provider 전담** | High Memory-g3 인프라/CPU Laya service/worker, NCP IAM·TLS/인프라·provider SDK, OCR/HCX API, 스토리지·사용량 원장 |
| **김채윤 / 추천·공지** | 승인된 SourceRevision/VerifiedClaim만 소비, 구본 추천 제외, score/공지 캐시 무효화 |
| **박준영 / 학업·전망** | RulePack·공지 근거 범위, 적용학번/졸업학기·각주 누락·출처 버전 검토 |
| **이의상 / 화면·모바일** | 원본 이미지 근거 확대 표시, LAST_VERIFIED·불확실·STALE·SYNTHETIC 배지, 권한철회 차단 |

**순서:** (1) 설계 PR(이번 PR: 코드 실행·배포 0) → (2) 담당자 리뷰/공통 타입 계약 PR → (3) 소형 합성 이미지/시의성 fixture → (4) HTTP 변경 탐지·OCR만 구현 → (5) 제한 HCX-005·HCX-007 구조화/검증 → (6) 로컬 검색 및 시간 RAG → (7) Laya CPU 실측 후 스위치 ON 여부 → (8) 승인된 NCP 크레딧으로 단계별 제한 배포·독립 QA. 완전한 수집·비전·RAG·Laya 구현이 이 설계 PR에 이미 들어왔다고 표시하지 않는다.

**롤백:** `MEDIA_INGEST_ENABLED=false`, `VISION_ENABLED=false`, `RAG_ENABLED=false`, `LAYA_ENABLED=false`, `AI_ENABLED=false`로 차례 비활성화. 허용된·검증된 기존 스냅샷의 권한 있는 조회와 core-only 합성 시연은 유지; 권한·신선도 실패를 우회하는 폴백은 없다. 자동 확대/추가 GPU 생성 금지.

## 10. 검증할 공인 자료

- [한국외대 2026 바이브코딩 경진대회 공식 비교과 공고](https://job.hufs.ac.kr/job/imng/icmpNsbjtPgm/findIcmpNsbjtPgmInfo.do?encSddpbSeq=1006089) — 본선 50만원 개발비 + 별도 NCP 크레딧 50만원, 상세 일정
- [NAVER Cloud 서버 요금표](https://www.ncloud.com/charge/region/ko) — High Memory-g3 4vCPU/32GB, 326원/시간/234,240원/월, VAT 별도(실제 SKU 확인)
- [NAVER Cloud General OCR 사용법](https://guide.ncloud-docs.com/docs/clovaocr-general) — 이미지/해상도/페이지 조건, OCR 좌표
- [NAVER Cloud OCR 요금표](https://www.ncloud.com/charge/price/ko) — 글자 OCR 3원/건, 월 100건 무료, Gateway 별도
- [NAVER Cloud CLOVA Studio 모델](https://guide.ncloud-docs.com/docs/clovastudio-model) — HCX-005 Vision, HCX-007 텍스트 추출 모델별 지원 기능
- [Laya 멀티링구얼 로컬 실행](https://laya.tools/guides/run-laya-locally) — 322M, CPU/ONNX 선택, Apache-2.0
- [Laya ONNX 배포 및 upstream 고정 정보](https://huggingface.co/ollaya-dev/laya/blob/main/README.md) — fp32 CPU/ONNX Runtime, SHA pin 필요

각 링크의 당시 확인 내용과 **향후 변경 가능성이 있는 요금·모델 계약**을 분리한다.

## 외부 학교 심사자 접근에서 AI 호출·실학생 자료 차단

[REVIEWER_ACCESS.md](REVIEWER_ACCESS.md)의 기간제 `REVIEWER`는 별도 합성 read-only 시연만 가능하며, `/api/ai/*`·실학생 sourceRevision·과금 발생 HCX/OCR/Laya·학생 원본 문단 검색을 절대 허용하지 않는다. 심사 중 RAG UI는 미리 생성·검수한 SYNTHETIC/REPLAY 근거만 보여주며 실시간 크롤링·유료 모델 호출 성공인 것처럼 표현하지 않는다. 심사자가 여러 번 접속해도 추가 과금을 유발하지 않으며 기간 종료·철회는 모든 조회에 서버 시간으로 적용한다. 상세 이슈 #25.
