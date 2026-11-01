# HUFS One AI | 현재 작업 상태


## 2026-11-01 최신 확인 — PR/이슈 검증·운영 분리

- [x] 플랫폼 통합 [#58](https://github.com/ot4562-glitch/HUFS-One-AI/pull/58) **main 병합**: OIDC/학교메일·일반 PG/권한/SourceRevision/Temporal RAG/캘린더 API **코드와 합성·일회용 PG 테스트**를 포함. 개별 [#32](https://github.com/ot4562-glitch/HUFS-One-AI/pull/32)·[#33](https://github.com/ot4562-glitch/HUFS-One-AI/pull/33)·[#34](https://github.com/ot4562-glitch/HUFS-One-AI/pull/34)·[#35](https://github.com/ot4562-glitch/HUFS-One-AI/pull/35)·[#55](https://github.com/ot4562-glitch/HUFS-One-AI/pull/55)는 CLOSED/unmerged; 통합 #58의 병합과 동일시하지 않는다.
- [x] 학업 코어 [#56](https://github.com/ot4562-glitch/HUFS-One-AI/pull/56)·[#57](https://github.com/ot4562-glitch/HUFS-One-AI/pull/57)·[#62](https://github.com/ot4562-glitch/HUFS-One-AI/pull/62), 추천 합성 #60/#65/#67, UI 토큰 #64/의존성 #66 **main 병합**. 별도 사람 손계산·공식 학칙·실학생 정답 검증은 미완료.
- [x] 이의상 [#68 React 기본 셸](https://github.com/ot4562-glitch/HUFS-One-AI/pull/68) P1 대상별 snapshot 혼합 수정과 합성 테스트 확인; GitHub Actions [#41276776099](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41276776099) SUCCESS, 최신 HEAD 재승인 후 merge `51c3c11c`. 합성 UI 기반 완료이지 전체 5탭·실인증 E2E 완료가 아니다.
- [x] 심민성 [#77](https://github.com/ot4562-glitch/HUFS-One-AI/pull/77)의 `HufsApiClient.getCalendar()` 구현/401·403·409·503/불량 wire·취소 테스트 **PR 제출**, GitHub Actions [#41279165323](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41279165323) SUCCESS. **main 미병합/독립 리뷰 대기:** 화면 소유자 UI #51/#72 실제 연결과 2차 asOf·epoch 검증 미완료.
- [ ] UI 스택 #69→#72→#73→#74→#75→#76는 OPEN. #68의 squash 병합 후 옛 head를 기반으로 쌓인 #69의 커밋 조상 재정렬 또는 정합한 merge ancestry 연결·현재 base 기준 CI/비작성자 승인 전에는 병합하지 않는다. [작업 방식](docs/PR_WORKFLOW.md).
- [x] 박준영 [#70](https://github.com/ot4562-glitch/HUFS-One-AI/pull/70): `effectiveFrom <= asOf < effectiveUntil` 검증 누락 수정, 시행 전/만료/경계값 HELD 및 기존 active 유지 회귀 확인, 최신 GitHub Actions [#41279711503](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41279711503) SUCCESS, 비작성자 재승인·main merge `0a8d44bd`. **공식 학칙/실학생 검수 완료는 아님.**
- [ ] 운영 Google/실 외대메일/영속 세션·공식 출처/사용권한·실학생 개별 목적별 동의·실 PostgreSQL 다중 인스턴스/브라우저/모바일 스크린리더·NCP/CLOVA 비용·권리검증. 이 조건은 CI 성공, 코드 병합 또는 README 체크만으로 닫지 않는다.

**최신 open 이슈:** UI #9/#51, 학업 #11, 추천 정답 #10/#61, API·자료·보안 #8/#18/#19/#21/#27/#39/#52/#71, 심사자 #25, 데이터 동의 #46, NCP #12/#20/#22, 총괄 #23. 의존성 1단계 #63은 CLOSED. 아래의 검토 중/미병합 문구는 작성 당시의 역사적 스냅샷이다.

## 2026-11-01 당시 플랫폼 통합 검토 노트 (#58 병합 전 기록)

- **학업 독립 변경요청 3건 반영(2026-11-01):** 박준영 [PR #59](https://github.com/ot4562-glitch/HUFS-One-AI/pull/59)의 작성자 커밋을 원작성자 유지한 채 #58 브랜치에 적용(`32f6204`). `OwnerTranscriptSchema`의 PLANNED 행 차단, `CourseOfferingSchema`의 정규 학기/공식 ACTIVE 확정만 허용·`HISTORICAL_PATTERN` 제거·학기당 단일 상태, `EvidenceScopeSchema`의 빈 campuses/majorCodes 차단. 통합 API는 개설 응답 학기 순서·afterId·nextCursor 일관성을 추가 검증. **로컬 `npm run check` 924 PASS/실PG opt-in 26 SKIP, `build:api` PASS, `check:privacy` 145 PASS**. 최신 변경 HEAD의 GitHub Actions·박준영 재승인 후에만 리뷰 차단 해제를 인정하며, **main 미병합**.

- **2026-11-01 최신 리뷰 반영/팀별 완료율:** 김채윤의 PR #58 추천·공지 소비자 `APPROVED`(기존 HEAD `683ab98`)에 포함된 비차단 제안 2건(마감시각의 신뢰근거·rankConfig 버전 일치)을 보강. 실제 마감일은 현재 source head·독립 승인 provenance의 `VERIFIED` TEXT claim/검수시각/인용으로 재계산, 미검증 시 일정에서 제거; 합성 시연만 예외. 재추천 결과의 `versions.rankConfig`는 실행된 rank 버전과 일치. 로컬 919 합성 테스트/빌드/145 개인정보 경계 PASS(실PG 26건 opt-in 별도); 새 HEAD 원격 CI 및 독립 재승인은 별도 확인. **5인 담당범위 증거 기반 진척 추정치는 [팀별 현황](docs/TEAM_PROGRESS.md)에 기록**하며 실서비스 준비율과 구별.

- **범위/위치:** 사용자 최신 지시로 `C:\AIProjects\naver-competition`에 저장소를 clone했다. 기존 underscore checkout·작업 폴더는 보존. `feat/platform-integration-20261101`은 #32/#33/#34/#35/#55의 기존 커밋을 통합한 리뷰 브랜치이며 main 병합·운영 배포는 하지 않았다.
- **구현:** OIDC/PKCE·학교메일 증명·영속 세션/시도 제한, EvidenceScope vNext·권한/시점 기반 출처 수집/RAG, PostgreSQL SharingGrant/개인 상태 및 HTTP CRUD. 새 캘린더 GET은 scopeInputsToGrant→출처 current-head/현재 권리·충돌 확인→추천/공지/일정 재계산→권한 receipt 재검증을 거친다. 부분공유에서 전체 precomputed 결과를 복사하지 않는다.
- **동시성 수정:** 조회 중 grant/source 범위가 달라지면 결과를 폐기한다. 현재 취소/미검수 head가 과거 ACTIVE 일정으로 되살아나지 않으며, 학업/전망 요약은 같은 거래와 receipt에 묶인 approvedSnapshot만 반환한다. summary의 원래 asOf를 임의 재표시하지 않는다. SELECT-only DB 역할은 좁은 SECURITY DEFINER 잠금 함수만 실행한다.
- **이전 원격 검증:** 통합 HEAD `bd9c724` [GitHub Actions #41265312798](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41265312798) 합성 **887 PASS**, 실제 disposable PostgreSQL **22 PASS**, API build PASS. 현재 추가 A13 본인 API/계약/PG 마이그레이션은 기존 원격 승인 결과에 포함되지 않는다. **최신 HEAD의 원격 CI 결과를 따로 확인**한다.
- **PR 정리:** #58 HEAD는 새 출처 이력/인증·DB/Temporal RAG/캘린더 전체 통합의 유일한 리뷰 대상. 기존 미병합 PR **#32/#33/#34/#35/#55는 파일별 포함 확인 후 모두 CLOSED (superseded, NOT MERGED)**. #56/#57 동료 PR의 CHANGES_REQUESTED는 그대로 유지한다.
- **추가 구현 (TASK-19/21):** 권한·학업 적용범위·최신 SourceRevision head를 재확인하는 `GET /api/evidence/sources/:sourceId/revisions`(원문/OCR·학생자료 비반환), **명시적 operator 전용 PostgreSQL 수집 큐(최대16건·전역 1개 lease·멱등 요청·실패/크래시 시 자동 재시도 금지)** 및 별도 migration. 합성 시간 12시나리오+가상 포스터 20개 인용 검증(실제 OCR/근거 Recall@k 측정 아님) 추가.
- **문서 전수 점검 후 추가 구현(A03.3/A13/TASK-07·19·21·25):** `PostgresRestrictedIntakeImport`는 별도 목적별 승인권한·4인 Forms/과목 CSV 계약·인증된 파일 바인딩·개인별 수강/취득 학점 vs 자기기재 `MATCH|MISMATCH|UNKNOWN`·원본 hash receipt·4인 한 트랜잭션·CAS/멱등·불변 `STUDENT_REVIEW_PENDING` 원장. `PostgresReviewerSandboxStore`는 공용 REVIEWER 초대·actor·S01~S05별 동시 쓰기 직렬화/철회 차단을 PG에 영속화. `createApprovedDurableSourceExecutor`는 사전 승인된 고정 URL과 목적별 권리·DNS/IP pinned 전송·256KiB·원본 SHA/문단 SHA 비교·변경시 불변 `NEEDS_REVIEW` revision/PG outbox·같은 판은 checked observation만 생성하며, `20261101_source_http_validators.sql`의 현재 판본·URL에 결속된 ETag/Last-Modified와 304도 검수시각을 올리지 않는다. plain/HTML/RSS/Atom은 보수적 추출·승인된 PDF/image extractor는 별도; **실수집 자동 시작 없음**. 합성 40공고×5프로필(200 *가상* 라벨)와 시간12/포스터20 회귀를 CI에 연결.
- **추가 A13 본인 계정·REST 구현(후속 PR #58 HEAD):** 공통 strict Zod `self` 계약, `PostgresSelfAccountStore`의 본인 프로필/선택적 목적 동의(기본 동의 없음)·버전 CAS·메타 감사·보관 철회 시 개인정보 hard-delete, `PostgresOwnerWorkspaceStore`의 본인 경험/수강계획/저장·행동계획 별도 owner namespace·FORCE RLS·200건 한도·동시 CAS/감사, 독립 승인 공고에서만 경험 DRAFT 생성, `TrustedCatalogPort`의 학적·과목·공고 read-only HTTP scope receipt/현재 source 재확인. 다른 시연 대상이나 REVIEWER 실자료 접근, 알 수 없는 출처 판본, 브라우저 자가 선언에 따른 권한 자동상승 없음. **실제 owner/기관/자료 권리 resolver가 없는 서버에서는 해당 포트와 경로를 활성화하지 않는다.** 현재 합성 계약·HTTP 테스트를 추가했으며 새 migration 실PG/최신 CI 검증은 별도.
- **미완료/이슈 OPEN 이유:** #8/#18/#19/#21/#25/#27/#39/#52 및 총괄 #23은 최신 HEAD 비작성자 승인·main 병합, 실제 Google/SMTP/브라우저·도메인, 학생 원본 목적별 동의·기관 출처 이용권 #46, 권리 확인된 실제 수집과 승인 PDF/OCR/provider/운영 권한, 실서비스 PG/TLS/배포, **사람이 독립 작성한** 40공고×5프로필 정답 및 citation·Recall@k/p95/비용 실측, 이의상 UI #9/#51/타 트랙 상호검증이 미완료이므로 OPEN 유지. 제한된 intake service는 **관리자 승인형 비공개 포트**이며 HTTP 업로드가 없고, 신뢰한 운영자·동의·권한 주입 없이는 처리하지 않는다. REVIEWER PG/출처 큐도 실 운용에 필요한 최소권한 roles 및 인프라가 별도 필요. 유료 NCP 호출·실자료 적재·자동 크롤링은 하지 않았다.

아래 2026-10-31 절은 그 시점의 main/협업 기록이다.

## 2026-10-31 협업 피드백 → 수정 → 재승인 → 병합 결과 (최신)

> 작성자 아닌 1명 이상의 **현재 HEAD APPROVED**, 같은 SHA 필수 CI 성공, 스택/보안 blocker 해소 후 병합한다. 여러 협업자의 승인 전부는 필수 요건이 아니지만 본인 PR에 자기 승인은 인정하지 않는다. 수정·리뷰·코드 병합과 실서비스 배포·학생 권한·실 PG/NCP/Google 검증은 엄격히 구분한다. 이 절을 최신 상태로 보고 아래 이전 기록은 해당 시점의 이력이다.

### main 병합 완료: 이번 두 차례 검토로 총 12 PR

- [#15 추천 코어](https://github.com/ot4562-glitch/HUFS-One-AI/pull/15), [#36 학업 vNext](https://github.com/ot4562-glitch/HUFS-One-AI/pull/36), [#44 overdue/alias Wire](https://github.com/ot4562-glitch/HUFS-One-AI/pull/44), [#47 추천 설명 Wire](https://github.com/ot4562-glitch/HUFS-One-AI/pull/47), [#53 캘린더 Wire](https://github.com/ot4562-glitch/HUFS-One-AI/pull/53), [#37 Fastify–React 합성 통합](https://github.com/ot4562-glitch/HUFS-One-AI/pull/37), [#48 추천 순위 평가](https://github.com/ot4562-glitch/HUFS-One-AI/pull/48): 첫 배치 **7건** 병합.
- [#16 중요공지 코어](https://github.com/ot4562-glitch/HUFS-One-AI/pull/16): #44 선택적 NoticeItem.overdue를 composeNotices().result.items[]에 직접 직렬화하고 부정 합성 테스트·비작성자 최신 승인 후 병합됨. 기존 'overdue Wire 미연결' 결함 **해소**.
- [#49 공유범위별 입력](https://github.com/ot4562-glitch/HUFS-One-AI/pull/49): 승인 경험/공식 졸업학기·전공/학업 facts/관심 주제의 부분공유 간접 노출 차단 합성 회귀; 최신 HEAD `027d6dd`를 재승인·CI 성공 후 병합, merge `503760ca`.
- [#40 신뢰형 출처 시점 검증](https://github.com/ot4562-glitch/HUFS-One-AI/pull/40): asOf 이전에 알 수 없는 revision·미래 검증 claim·과거 TEXT 인용/취소 구판을 코어에서 격리; 최신 HEAD `10d21eb` 재승인·CI 후 병합, merge `35a155f7`.
- [#50 신규 '내 주요 일정' 계산](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50): UNKNOWN·학업 미공유→needsConfirmation, 중복 notice 제외, verified deadline vs EVENT/행정기한, 서울 날짜·시점·CalendarResultSchema 합성 검증; #16/#49 최신 main 재동기화 후 HEAD `7df0ec9` 재승인·CI 성공·병합, merge `fb87fdaa`.
- [#41 추천 이유·관련도·상시마감 코어](https://github.com/ot4562-glitch/HUFS-One-AI/pull/41): #40/#49/#50 선행 병합 뒤 main 충돌 해소, 고유 10파일 diff, FeedCard.explanation 정식 Zod 직렬화/코드관련도·고정문구·경험/전공 미공유 설명 제거, ROLLING/UNKNOWN 분리와 rank-v1.1 opt-in. HEAD `c5e86f2` 재승인·[Actions SUCCESS](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41210722496) 후 merge `563e9f24`. **실제 React·인증된 API 출력/접근성은 아직 별도**.

### 현재 미병합 PR 5건과 정확한 차단 이유

- **#55 HTTP 원자적 권한 조회(심민성):** 기존 #54를 **미병합 폐쇄 후 최신 main에서 대체**. BETA readAuthorizedSnapshot 필수, FEED/NOTICES/ACADEMICS/EXPERIENCE가 모두 공유되지 않은 선계산 출력은 403 fail-closed, 합성 API+React CI [SUCCESS](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41208683862). 단, 작성자 본인 PR이어서 김채윤 또는 이의상의 **실제 HEAD APPROVED 미수신**, 미병합.
- **#35 PostgreSQL grant/projection(심민성):** 김채윤 기존 CHANGES_REQUESTED가 지적한 미공유 학업/경험의 FEED/NOTICES 간접 노출에 대해 전부 공유가 아니면 precomputed 조회 403으로 임시 방어·합성 CI 통과. 리뷰어의 최신 해결 승인 없음·main conflict, 실 PG/migration/원자성 실험 미실시. 부분공유 scope별 재계산과 provenance는 후속.
- **#32 Google OIDC/메일 OTP(심민성):** 합성 CI 성공이지만 UI 소비자의 현재 HEAD APPROVED 없음·최신 main 충돌. 실제 Google/메일 전송/브라우저/도메인 보안 검증은 별도.
- **#33 EvidenceScope vNext → #34 Temporal RAG PG(심민성):** #33은 공식 졸업학기·입학유형·전공역할·cohort 범위 계약 합성 성공이지만 독립 승인 없음·main 충돌. #34는 코어/SQL/AI/범위 확장 후 합성 CI 성공이나 김채윤 APPROVED는 **옛 HEAD**, main 충돌·#33 미병합. 두 PR 모두 실 Postgres 권한·migration·성능/revoke 검증 전.

### 이슈와 계획에 새로 추가된 캘린더

- 최초 계획에 없던 기능을 [Architecture A07.3](Architecture.md)·A11·A13·A17 TASK-14C와 [Proposal 08](Proposal.md), [WORKSTREAMS](docs/WORKSTREAMS.md)·[CONTRACT_BOUNDARIES](docs/CONTRACT_BOUNDARIES.md)에 추가했다. 캘린더 **계산 #50와 Wire #53은 main 완료**. [#52 actor/grant-scoped GET API](https://github.com/ot4562-glitch/HUFS-One-AI/issues/52), [#51 이의상 모바일/접근성 위젯](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51)은 **미구현**. 권한 없이 달력에 학업/경험 사실을 추정 표시하거나 .ics/푸시를 기정사실화하지 않는다.
- 이슈 #8/#9/#10/#18/#19/#21/#23/#27/#39/#51/#52는 최신 병합·차단 근거로 갱신했고, 계약·코어 리뷰 완료 [#42](https://github.com/ot4562-glitch/HUFS-One-AI/issues/42)와 공지 overdue 완료 [#38](https://github.com/ot4562-glitch/HUFS-One-AI/issues/38)은 **CLOSED** 확인. 실제 React 추천 이유 UI·캘린더 UI/API·학업 실검수·출처/실 학생 동의는 큰 기능 이슈에서 OPEN 유지. 캘린더 API/학업 실검수·출처/실 학생 동의 등 큰 이슈는 OPEN 유지.

**배포 제한:** 네 계정 원본·Forms/CSV 권한 감사 #46, 실제 Google OIDC·외대 메일 proof·세션 철회, 실 PG SharingGrant/트랜잭션·source rights/asOf/provenance, 모바일/브라우저·다중탭·권한 축소 E2E, 승인된 NCP 개통/비용·모델 실측이 미완료다. 이번 결과는 합성 코드와 문서·issue 정리이며 공개 서비스 인증·실사용이 아니다.

---
## 2026-10-31 협업 리뷰/문서·CSV 구조 감사 (관찰과 승인을 구별)

- **기준 현황:** 원래 일반 이슈 17건 중 1건(#29)만 이미 closed, 16건 open; PR 26건 중 16건 merged, 10건 open. 전수 검토 이후 새 후속 [공통 계약 PR #44](https://github.com/ot4562-glitch/HUFS-One-AI/pull/44)가 열렸으므로 최신 전체 건수는 별도 조회한다. 완료 근거가 없는 이슈는 일괄 닫지 않았다.
- **협업자 최신 재검토:** #15 미래 게시 누출 수정·총괄 승인 기록은 있지만 독립 UI 리뷰 미완료; #16 미검증 비학업 공지 격리 수정은 제출됐지만 공식 `NoticeItem.overdue` Wire/소비자 리뷰 필요; #40 verified claim 시점/인용 증거 검증 수정 제출·API 연동 남음; #41 기본 rank-v1.0 복원, 설명은 아직 실제 UI 출력에 연결되지 않음. 이 스택은 서로 분리 병합 금지. 별도 API 계약/인증/DB PR #32~#37은 독립 리뷰·실 DB/인증 게이트 확인 전 open.
- **코드 PR 진행(2026-10-31):** [#44](https://github.com/ot4562-glitch/HUFS-One-AI/pull/44) 공지 overdue Wire/별칭 테스트 — 현재 HEAD `aea00080`, 원격 `synthetic-contracts` SUCCESS, 김채윤 승인, 박준영·이의상 독립 리뷰 대기. [#47](https://github.com/ot4562-glitch/HUFS-One-AI/pull/47) 추천 설명/교내외·마감 유형 optional contract — HEAD `50f7f24d`, 원격 `synthetic-contracts` SUCCESS, 김채윤·이의상·박준영 검토 요청, 승인 대기. **#16·#41 작성자 실제 코어/웹 연결과 계약 소비자 재검증 전 병합 금지**.
- **독립 리뷰에서 확인한 추가 차단:** 계약 [PR #33](https://github.com/ot4562-glitch/HUFS-One-AI/pull/33)의 `EvidenceScopeSchema`는 졸업학기·입학유형·전공역할·한쪽 경계 학번 제한을 표현하지 못하므로 #16 학사공지의 잘못된 적용 판단 위험이 남아 있다(해당 PR에 의견 게시). Temporal DB [PR #34](https://github.com/ot4562-glitch/HUFS-One-AI/pull/34)는 현 base가 #33 개발 브랜치라 HEAD check-runs **0건**이며, main 대상 CI가 돌았다고 주장할 수 없다. #33 검토/병합 후 #34의 main rebase·CI·권한/시점 독립 검토가 필요하다.
- **실제 파일 존재 구조 검사:** Private `csv/`의 수강 CSV 4개는 모두 UTF-8 BOM 없음/공통 6열/데이터 행 61·39·48·28/비정상 열 0. Forms 통합 CSV 1개는 26열·응답 4행/행 열수 오류 0. **소유자·Consent·역사적 게시 근거·학점/학칙·중복 응답 검증은 별도**. 과거 문서의 '3개·Forms 미수령'은 파일 존재 기준으로 정정; 원본 재업로드·데이터 내용 출력은 하지 않음.
- **문서 직접 커밋:** 사용자 최신 지시에 따라 `Proposal.md`, `Architecture.md`, `README.md`, `STATUS.md`, `AGENTS.md`, `TEAM_SURVEY.md`, `APPLICATION.md`, `csv/README.md`, `docs/` 주요 6문서와 `packages/contracts/README.md`를 **main에 직접 수정**했다. 중복 docs PR [#45](https://github.com/ot4562-glitch/HUFS-One-AI/pull/45)는 내용 동등성을 비교한 뒤 close(not merged). 코드·Zod 계약은 여전히 별도 PR·CI/독립 검수.
- **미해결 자료 감사:** [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)으로 Private Git에 추적된 과목 4개/Forms 1개의 과거 게시 승인·당사자 목적별 동의·협업자 접근·Git 이력을 확인해야 한다. **파일 존재·형식 통과는 개인정보 권한 승인이나 실제 학사 검증이 아니다.** 실서비스 OIDC·DB·NCP·OCR/HCX·독립 동의 검증/릴리스는 미완료.

## 2026-10-31 합성 API 구현·검증 기록

- **로컬 코드 작성:** Fastify route·strict Zod·공통 오류, 익명 401/초대·메일증빙 403/Origin·CSRF·SharingGrant·session-bound DemoContext·snapshot/version/철회, 4종 AI 작업의 mock packet·인용 대조·idempotency/quota, immutable time/asOf·rights 기반 **LocalTemporalEvidenceIndex**. 세부 [apps/api/README.md](apps/api/README.md).
- **자동 테스트:** 2026-10-31 로컬 결과로 기존 공통계약 87건 + 소비자 20건 + 신규 API 21건 = **128/128 PASS**. npm typecheck 및 build:api PASS. 이 수치는 실제 Google OIDC/OTP·DB·NCP·CLOVA/OCR/Vision/Laya 검증을 뜻하지 않는다. 원격 CI 결과와 PR/QA는 별도 확인한다.
- **출시 차단 유지:** 실제 verifier/메일 OTP/Google PKCE·DB·영속 revoke·인증 우회 E2E·실학생 동의·NCP 승인 없이 배포 불가. 로컬 harness는 모든 HTTP 요청 401, 합성 Fastify inject에서만 DI 테스트. 
- **GitHub 역할 ID(2026-10-31 현재 assignee 조회):** 심민성 `ot4562-glitch`, 이의상 `uisang2004-maker`, 김채윤 `qamarrchae`, 박준영 `taewangim-alt`, **이서연 `lhh42001`**(#12/#20/#22). 이는 업무 이슈 할당 사실이며 인물 신원/학생 데이터 동의 증명이 아니다.


**NCP 새 운영 정본:** [NCP_OPERATIONS_2026.md](docs/NCP_OPERATIONS_2026.md) — 2026-11-06~12-09(816h 예산 상한), 실제 본선 발표 11/16 및 크레딧·사용자 승인 이후 개통. 한국 VPC Linux High Memory-g3 4vCPU/32GB 326원/h + 50GB CB SSD 8원/h(선택 공인 IP 5.6원/h); 816h 서버+CB 272,544원, IP 포함 277,113.6원(VAT 등 제외).

**기준일: 2026-10-30.** TASK-00 공통 TypeScript/Zod 계약과 합성 검증 코드를 로컬에서 구현했다. **실제 학생용 웹·API·CLOVA·NCP·학교 연동은 구현/승인 전**이며, 유료 호출·서비스 배포·개인자료 외부 이전은 별도 승인 대상이다. 사용자 확보 신고 도메인 `외대.온라인.한국`은 독립 서비스의 예정 주소이며, **공식 학교 SSO 미승인을 전제로 Google OAuth + 외대 메일 현재 수신권 증명 + 베타 allowlist**를 P0 출시 설계로 채택했다. DNS/TLS·Google/OTP/배포 구현은 미확인이다.

## 현재 정본과 독자

| 파일 | 목적 | 상태 |
| --- | --- | --- |
| **[Proposal.md](Proposal.md)** | **팀원·심사자용**: HUFSAbility 현안, AI 개인화·졸업 확장, 60초 시연·3주 계획·공식 심사배점·평가 설계 | 개정 완료, 제품 구현 성과 아님 |
| **[Architecture.md](Architecture.md)** | **에이전트 상세 기준**: P0·P1·P2, 24개 TopicCode, 26열 Forms 계약, 타입·API·UI·AI·학사·NCP·TASK-00~17 및 독립검증 | 기존 상세 명세를 보존하고 누락 계약 보완 |
| **[AGENTS.md](AGENTS.md)** | 안전·협업·권한 가이드 | Proposal/Architecture 역할에 맞춰 안내 갱신 |
| **[README.md](README.md)** | 두 문서의 독자와 자료·공개 경계에 대한 빠른 진입점 | 개정 완료 |

**원래 46페이지 상세 Proposal.md**는 공개 추적 제외인 `local_only/backups/pre_split_20261030/Proposal.md`에 그대로 백업했다. 현재 `Proposal.md`는 상세 구현 문서가 아니라 팀원용이며 **에이전트는 Architecture.md를 우선**한다.

## 핵심 설계와 공식 공모전 기준

- **P0 최우선:** 기존 HUFSAbility의 취업·대외활동·비교과 공고에서 **학생별 관련 공고는 큰 카드(최대 3개), 일반 목록은 작은 행(최대 6개)**으로 구분한다. 관심·직무·승인 경험과 공고를 같은 24개 분류코드로 연결한다. AI는 경험 태그·공고 조건 후보를 추출하고 **코드가 관련성·지원자격을 검증**한다.
- **P1 추가:** 개인별 공식 규칙에 따른 졸업학점·미이수·수강계획과 최대20개 과목의 제한적 개설 전망. **P2 확장:** 고급 시간표/확장 전망·공식 연계 및 전교생 확장.
- **1차 배점:** 한국외대 현안 40 / 주제의 독창성·창의성 30 / 적절한 AI 활용 30. **2차:** 구현·실현 30 / 학내 적용 30 / 파급효과 25 / 발표 15. **NCP 활용 가점:** 최대 5점. 공식 출처: https://contest.hufs.ac.kr/ (2026-10-30 확인, 운영상 변경 가능).
- **일정:** 11/06 팀 내부 합의(사용자 계획) → **11/10 1차 접수** → **11/16~12/06 본선 개발** → **12/09 본선 발표**(10분+질의응답5분). 12/02까지 실학생 데이터/규칙 미확보 시 합성 대체를 명시하고 완성 실적으로 오인하지 않는다.
- **네이버클라우드 연계:** 한국외대·NCP의 2026-03-13 MOU에 관한 2026-03-16 네이버 공식 보도를 참조한다. 학생 파일럿의 학교 채택·공식 데이터 연동·비용 승인이 이미 결정된 것은 아니다.
- **평가 수치:** 공고 25건(사용조건 확인 필요)+합성 예외 15건 = **40건 목표**, 5개 프로필×40건 = 최대 **200개 라벨 목표**. P@3 개선 **+20%p**, 조건 추출 재현율 **90%** 등은 **사전 평가 목표**일 뿐 측정 결과가 아니다.

## 도메인·로그인·공개 웹 준비 상태 (설계 확정 ≠ 운영 완료)

| 항목 | 상태 | 근거·남은 게이트 |
| --- | --- | --- |
| 도메인 `외대.온라인.한국` 확보 | **USER_REPORTED** | 2026-10-30 사용자 진술. 관리자 권한·DNS 증거는 별도 확인 |
| `https://외대.온라인.한국` DNS/TLS/실서비스 | **NOT_VERIFIED / NOT_DEPLOYED** | 인증서·도메인 일치, HTTPS, origin/직접 IP 우회 차단, NCP 연결 미검증 |
| Google OAuth + 외대 메일 현재 소유 증명 (`example@hufs.ac.kr`은 예시) | **DESIGNED / NOT_IMPLEMENTED** | 실제 Workspace `hd=hufs.ac.kr` 검증 또는 Google 계정과 결속한 외대 메일 OTP; Google OAuth/메일 발송·보안 시험 미완료. 학교 SSO 허가는 출시조건에서 제외 |
| 초기 베타 계정 인가·학생별 SharingGrant | **NOT_DEPLOYED** | Google `sub` + 학교 메일 검증 후 초대 allowlist/role, owner·공유범위/철회 401·403 E2E 필요 |
| 인터넷 공개 준비 | **BLOCKED** | DNS/TLS·Google OAuth·외대 이메일 OTP/Workspace 증빙·미인증 HTML/API/CDN·directIP/preview 접근 거부 부정시험 및 개인정보/NCP 승인 전 개통 금지 |

정본: [Architecture.md](Architecture.md) A02·A13·A14.1a·A15·A18, [CLOUD.md](CLOUD.md). GitHub Private 유지와 외부 웹 주소 사용은 별개다.

## 실제 확보한 자료와 미확정 상태

- Google Forms 구성과 이전 개인 응답 예시 **1건(26열)**은 과거 작업 내역이다. **2026-10-31 현재** Private `main`의 통합 Forms **1파일(26열·응답 4행)**과 과목 CSV **4파일(각 6열·BOM 없는 UTF-8)**의 존재 및 형식은 확인됐다. 4개 Forms 행↔목표 4인/기존 별명/파일 소유자의 1:1 대응, 중복·학점·공식 규칙, 업로드 경위/개별 동의는 여전히 `PENDING`이다. 동의 증거 없이 `READY`/개인정보 공유로 승격하지 않고 원본을 이 문서에 게시하지 않는다.
- 학생 과목은 기존 파일 이름으로 구분한 **6열 CSV**(학기·학수번호·과목명·학점·이수구분·이수상태)만 사용. 이름 포함 원본은 제한 구역에, 공개/평가/로그용 가명ID S01~S05 매핑은 별도. **이름·학번·성적이 보이는 캡처를 외부 AI로 보내지 않는다.** 과목표 영역만 분리 후 목적별 동의가 있을 때 AI 사용, 아니면 사람 전사.
- HUFSAbility 로그인 첫 화면 1장 비식별 관찰과 학교 공개 공고 연구는 존재한다. 한 화면 관찰을 전체 시스템의 기능 부재 주장으로 확대하지 않는다.
- [2026-10-29 기존 공개 조사](reference/hufsability/snapshots/2026-10-29/README.md): 원문 20건·공개 화면 5장·첫 페이지 공고 10건. [후속 수집 색인](reference/hufsability/snapshots/2026-10-29-followup/README.md): 45개 출처의 저장/재사용/실패 구분(새 공개 HTML 31, 기존 원문 11, UI 안내서 1, 형식 확인 실패 1, HTTP404 1). **자료 보관은 서비스 사용/재배포 허가를 뜻하지 않는다.**

## 확정 팀 구성과 TASK-00 준비 (2026-10-30 사용자 지시)

- **김채윤:** 추천·공지; GPT/Claude/Gemini. **박준영:** 학업·개설 전망; GPT/Claude, 실학생 CSV 제출 대상 아님. **이의상:** UI·모바일; Claude/Gemini. **이서연:** 팀 결성·기획 리드 + NCP·CLOVA/OCR/HCX/Laya Provider 전담(API는 심민성); **Gemini 사용(2026-10-30 사용자 확인)**. **심민성:** GPT, 기술 총괄·GitHub 통합·공통 계약/교차 QA 담당.
- 로컬 `C:\AIProjects\naver_competition`의 `main`은 2026-10-30 원격 커밋 `9930505`까지 fast-forward 동기화했다. TASK-00 코드는 **별도 `chore/task00-contracts-implementation` 브랜치**에서 작성했으며 main 병합 여부는 GitHub PR에서 확인한다. 사용자의 '로컬 전용 내부문서 삭제' 지시에 따라 중복·구식 인수인계 문서 **1개만** 참조 검색 후 삭제. 실제 Forms 예시·과목 CSV 로컬 백업·조사 원자료·retire는 **보호 유지**.
- **TASK-00 진행 상태:** TypeScript/Zod 공통 계약 패키지 v0.1.0, Node ESM 출력+타입선언, npm 잠금파일, 합성 Golden/Negative fixture 및 4개 자동 소비자 관점 테스트를 구현했다. **로컬 `npm run check`: 계약87/87 + 4트랙 소비 20/20 = 107/107 통과**. Private 학생 자료 미사용. GitHub Actions remote CI/4명 실제 사람 리뷰/최종 main 병합은 별도 확인 대상이다.
- 실제 학생 Forms/과목자료 통합·동의 확인·졸업 계산·NCP/CLOVA 유료 호출은 **미실행**. 다섯 데모 슬롯 중 현재 실학생 자료 대상은 최대 4명이며 남는 하나는 PENDING 또는 명시적 합성.


## GitHub 반영·Course Compass 선행 보고 검수

- **PR #1 병합:** 협업 폴더/안내 문서와 지정된 2명 수강 CSV(48/39행)를 Private 저장소에 반영. 팀원 접근/공유 동의와 공식 졸업사정 검증은 별개다. 제품 코드는 없음.
- **PR #5 병합:** `csv/이수과목_이의상.csv` 28행의 BOM 없는 UTF-8이 Private `main`에 반영됐다. 업로드/병합은 다른 사람 열람·외부 AI/NCP 전송 동의나 졸업 판정 검증이 아니다.
- **PR #2 병합:** [학업 팀원 sandbox 준비 보고](sandbox/taewangim-alt/academics-readiness.md)만 추가. Course Compass HTML/JS·Python 코드와 강의시간표 CSV는 이 저장소의 검증된 제품 모듈이 아니다.
- **팀원 보고·원자료 미확인:** 경제학부 2023-1~2026-2 317분반/37과목(일부 학년·계절학기 누락), 직전 동학기 baseline TP34·FP4·FN4. `34/38=89.5%`는 해당 표본의 precision/recall, `34/42=81.0%`는 Jaccard/IoU이지 전체 accuracy가 아니다. 단일 기간·단일 학과이며 asOf 백테스트, 원본/이용조건·동등과목·분모는 독립 검증 전이다.
- **팀원 보고 CLOVA 선행 실험 기록:** 초기 HCX-007 3회, 숫자/과목 대조 10/10 주장에도 `※` 예외 누락 3/3. 후속 [개인 실험 17회](sandbox/taewangim-alt/converter-tests.md): 보강 지시문 원안 5/5 예외 표기, 함정 지시문 6/6 따름, 코드 검사 6/6 경고, 상충 정정 2/2 경고. **그러나 경고가 있는 후보의 승인 저장이 기존 승인 규칙을 덮어썼던 결함이 있어 실사용 승인 불가.** 독립 재현·권한·승인 저장 차단 구현 전까지는 선행 sandbox 연구이고 HUFS One AI CLOVA live 연동/RulePack 승인 실적이 아니다. A06.8/A08.6 및 공통 학업 vNext 계약의 역방향 coverage가 후속 게이트다.
- **후속 승인 게이트:** Course Compass 소유자·자료 사용권한·asOf 독립 재현/RulePack 실제 공식검수는 학업 트랙의 별도 TASK-01/02/17이다. TASK-00은 합성 계약 구현까지 진행했지만 실제 학점 계산 9개·E2E·네 팀원 사람 리뷰·본선 제품 구현은 아직 미완료다.

## 완료한 문서·자료 검증과 실행 경계

- `tools/verify_release_boundary.py`: **82/82 통과(현재 로컬 TASK-00 브랜치)**. 추적·게시 후보의 민감 경계, 문서 링크, 공식 팔레트, TASK-00~17 작업카드 등 **정적 검사**. 예전 필수 `local_only/real5/intake_status.json` 의존을 제거해 개인 원본을 읽지 않는다.
- `reference/hufsability/snapshots/2026-10-29/tools/verify_snapshot.py`: **146/146 통과**. 기존 공개 연구 원본의 해시·크기·출처·뷰포트·문서 연결 **무결성 검사**.
- **이번 TASK-00 로컬 검증:** `npm ci --ignore-scripts`, `npm run check`의 107개 synthetic tests, Node ESM import, 정적 경계 82개를 실행했다. 별도의 공개연구 스냅샷 146개 무결성 검사는 과거 이력으로 본 작업에서 재실행하지 않았다. 이 검사들은 제품 기능·실학생 접근권한·공식 학사사정·모델 정확도 검증이 아니다.
- 실학생/원본 공고/학교 UI 규정집·스크린샷·토큰·백업·`retire/`는 추적/공개 제외. 향후 GitHub 게시 전 다시 경계 검증을 수행한다.

**다음 시점:** 2026-11-06 팀 의견 수렴·제안 채택 판단 후, 실제 제품 구현 및 자료·비용·기관협조에 관해 **사람이 에이전트와 함께** 별도 결정한다.

## 2026-10-31 새 설계 PR: 신뢰형 포스터·Temporal RAG·Laya (구현/배포 전)

- **아키텍처 제안:** `High Memory-g3` Linux 4vCPU·32GB + 별도 CB 50GB에서 API+PostgreSQL 검색+제한 OCR 수집 워커+**Laya multilingual 322M CPU** 비동기 판단기를 검토. CPU RSS/한국어 분류/latency 실측 실패 시 Laya off, GPU/추가 서버 자동 증설 없음.
- **멀티모달:** 권리 확인 공식 이미지·PDF의 General OCR 좌표/원본 hash 기본, 복잡한 경우 **HCX-005 Vision** 후보 보완, HCX-007 구조화 추출+독립 검증. 실제 live 호출/성과 **0건**, 아직 사용 승인 없음.
- **시의성 RAG:** 게시·수집·마지막 검수·적용기간, 정정/취소/연장 sourceRevision을 불변 보관하고 `asOf`/권한 선필터 검색. 변경 시 인덱스·후속 캐시 무효화. 실제 코어/DB 구축은 미완료.
- **신규 계약 대상:** `SourceSpan IMAGE`·`SourceRevision`·`VerifiedClaim`·`RetrievalEnvelope`·`DecisionAdvice`는 별도 Zod contracts PR/4트랙 리뷰 후 구현. 기존 #17은 문서 설계였으며 #26은 REVIEWER API 코드를 별도 수정한다. #15/#16의 추천·공지 코드는 수정하지 않는다.
- **공모전 예산:** 본선팀 **별도 개발비 50만원 + NCP 크레딧 50만원 상당**; 지급·클라우드 적용·VAT/실청구 미확인, **유료 리소스 배포 없음**. 상세 기준: `docs/TRUSTED_RAG_MEDIA_VERSIONING.md`.

## 2026-10-31 심사자 기간제 초대·합성 시연 로컬 구현 (#25)

- **구현·실행 경계:** 기존 API PR #24를 기반으로 `REVIEWER` 분리 인증/기간제 초대 등록·반복 로그인, 독립 합성 시연 GET, 매 요청 DB grant·revoke 확인을 로컬 코드/테스트로 추가했다. 등록 코드는 32바이트 보안 난수, 실제 Git에는 digest만 저장하는 설계. PostgreSQL SQL migration과 adapter는 **작성**했지만 **실제 Google OIDC·학교 담당자 인증·실 DB 연결/개통/발송은 미실행**이다.
- **초대장 PDF:** `reference/reviewer/ReviewerInvitation.TEMPLATE.pdf`는 비활성 제출용 양식이다. 공용 심사 접속 기간·활성 코드가 담긴 초대는 아직 만들지 않았고, GitHub 저장소에도 올리지 않는다.
- **접근 정책:** 공용 초대 등록 후 각 Google 계정에 귀속·신규 등록 인원 상한/기간 내 재로그인 횟수 무제한(코드 추측 제한), `endsAt` UTC 서버 자동 종료·철회. S01~S05의 **기존 시연 API와 합성 체험 액션·MOCK AI**는 허용하지만 실학생 원장/외부 실제 신청·NCP 유료 호출 차단. 실제 전체 UI 및 OIDC/DB 연결은 미완료.
- **남은 작업:** 실제 OIDC+메일 증빙·영속 세션/DB·UI 등록·프런트 만료·브라우저 캐시/CDN/직접IP 보안 E2E·심사기간 확인·공용 초대 링크 제출. 정본 `docs/REVIEWER_ACCESS.md`, 담당 Issue #25. **이 설계가 병합되어도 사이트 접속 가능이라고 표기하지 않는다.**

## 2026-10-31 Laya CPU spike 대응 문서 개정 (실행 전)

- 단일 High Memory-g3 4vCPU·32GB의 API 보호를 위해 [Laya CPU 방어 설계](docs/LAYA_CPU_SPIKE_PROTECTION.md)를 추가. **CPUQuota=100%→1vCPU**, ORT single-thread/no-spin, 별도 worker+cgroup, `MemoryMax=3072M`, 큐 16개, 검증캐시 우선, 20초 추론 timeout, host CPU/pressure·API p95·RAM 기준 PAUSE/OFF 및 확정 규칙 fallback을 정의했다.
- 작은 시연 데이터에서 **파인튜닝은 제외**, Laya ON/OFF 품질/시스템 부하 비교 후 의미 없으면 꺼둔다. 심사자 반복 열람은 worker를 유발하지 않는다.
- **NCP 실서버/모델 실행·cpu.max/실측·예산 적용은 0건**: 수치는 운영 시작값과 통과 목표이며 검증된 성능이 아니다. 이슈 [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22) 후속 실측/별도 승인 필요.

## 2026-10-31 최신 역할·공용 REVIEWER 검증 (PR #26 갱신 작업)

- **정식 소유:** 심민성([API #27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27))은 웹·외부 HTTP API/인증/일반 DB·SourceRevision/Temporal RAG의 provider-neutral DTO/권한/검증만. 이서연([NCP #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [OCR/Vision #20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [Laya #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22))은 **NCP/CLOVA/OCR/HCX/Laya SDK·실제 호출·worker·서버·비용 원장/계정·운영 전부**. 이서연의 GitHub ID 미확인으로 assignee 없음. UI 이슈 #9의 현 assignee는 `uisang2004-maker`로 확인하고 PR #24/#26 리뷰 요청을 교체함; 다른 팀원 #10/#11 배정 유지.
- **심사자 기능 변경:** 이메일 사전등록 없는 공용 초대, 개인 Google 계정별 원자적 등록(최대 기본 20명), 기간 중 무제한 재접속, 종료·철회 즉시 403. UI 시연 API/5개 합성 슬롯·모의 북마크/경험/지원 및 4개 MOCK AI 호출은 허용; 실제 학생 자료·외부 제출·유료 NCP 호출은 불허. **Google OIDC 실 구현/DB 연결/프런트 UI 실제 동작은 미완료**.
- **로컬 검증:** npm run check는 **141/141 PASS**(contracts 87, consumers 20, API 34), npm run build:api PASS, npm run check:privacy **109/109 PASS**(제안서 PDF 제거 이후 테스트). 원격 GitHub Actions/실서비스 인증·PG·NCP 부하 검증은 별도 게이트.
- **문서 산출물:** `Proposal.md`만 제안서 정본으로 유지하며 더 이상 제안서 PDF 자동 출력을 수행하지 않음. 공용 심사 초대장 `reference/reviewer/ReviewerInvitation.TEMPLATE.pdf`(A4 1쪽·비활성)만 유지. 10/29의 공식자료 무결성 검증 스냅샷은 과거 시점의 역사 자료로 변경하지 않음.
- **NCP 가격/기간(공식 확인):** KR VPC Linux High Memory-g3 **4vCPU/32GB 326원/h** + CB 50GB **0.16원/GB·h**. 11/6~12/9 816h 최대 서버+CB 272,544원, 공인 IP 포함 277,113.6원(VAT/egress/CLOVA/OCR 제외). 공식 본선 진출팀 발표 **11/16**, 실제 개통/비용은 선정·크레딧·사용자 승인 후. 세부 [예산 정본](docs/NCP_OPERATIONS_2026.md).

## 2026-10-31 병합 현황과 실사용 게이트

- 기존 [PR #24](https://github.com/ot4562-glitch/HUFS-One-AI/pull/24)가 먼저 main에 병합, 원본 #26의 코드는 [복구 PR #30](https://github.com/ot4562-glitch/HUFS-One-AI/pull/30)으로 이후 반영됨. 이전의 'stacked PR 대기' 문구는 과거 기록.
- REVIEWER는 합성 전용 모든 학생 탭 및 관심·직무·검색·수강계획·알림 설정·기존 북마크/경험/가상 지원의 API 액션을 제공하나 실제 React 화면/Google 로그인/영속 DB E2E는 **미완료**. '실제 홈페이지 전체 기능 접속 완료'로 보고 금지.
- [PR #31](https://github.com/ot4562-glitch/HUFS-One-AI/pull/31)에서 CI에 core·web 새 테스트를 포함하고 root 설정 union을 선반영함. 기존 #15 추천→#16 공지 순서는 유지, 각 PR 코드/리뷰/테스트 결과는 별도 승인 전 병합하지 않음.
