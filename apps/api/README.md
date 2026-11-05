# HUFS One AI API — 권한 기반 플랫폼 구현

## 2026-11-04 로컬 추가 구현 (원격 미병합)

- **인증·메일:** `createOperatorGoogleIdentity` → 기존 OIDC/JWKS·PKCE, `createOperatorSchoolMailProof` → 승인된 계정/제한 DB·OTP, `createOperatorSmtpMailSender` → 운영자 승인 SMTP/TLS(465). 설정은 운영자만 소유하며 소스/브라우저·CI에 인증 정보를 넣지 않는다.
- **PostgreSQL:** `prepareOperatorPostgres`는 기본 7개 역할에 REVIEWER·OTP용 4개 제한 역할을 선택적으로 추가한다. 시작 전 모든 풀의 현재 역할·TLS/권한을 검사한다. `PostgresDemoProfileQuota`는 사전 승인된 `20261104_demo_profile_distributed_quota.sql` 적용·전용 EXECUTE 허가 후에만 주입한다.
- **SourceRevision:** `createOperatorApprovedSource`의 exact URL·COLLECT/STORE 권리·분리 DB 풀·pinned egress가 모두 필요. `platform.sourceIngestion`으로 명시 주입하고, 운영자 권한 없는 큐/작업과 unreviewed 원문은 거부한다.
- **OCR/HCX:** `createPostgresProviderRuntime`의 `OCR_GENERAL`은 허용된 OCR endpoint 또는 검수된 offline transport가 필요하고 기본 OFF다. OCR 입력은 HCX 학생 목록에 노출하지 않는다. 비용·철회·출처·인용 검증은 기존 executor/PG 원장을 따른다.
- **검증 경계:** 합성 테스트 통과와 실제 Google/SMTP/운영 PG·NCP/OCR·기관 허가/실학생 자료 검수는 다르다. 운영 비밀·유료 호출/공개 배포는 수행하지 않았으며 기존 `RELEASE_BLOCKED`를 유지한다.

> **2026-11-04 통합 후 현재 정본:** 2026-11-04: [PR #216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216) main f23b86bb에 #183/#213의 7분리 PostgreSQL ROLE/TLS 및 루프백 운영자 진입점·Source/Provider/owner SQL이 통합됐다. 열린 PR **0건**, main TASK-00/NCP IaC/Chrome **3/3 SUCCESS**. **실 Google code exchange·학교메일·운영 PostgreSQL/RLS·TLS/공개 production 기동은 NOT_RUN / RELEASE_BLOCKED**. 아래 과거의 'main 미병합', 스택 PR 대기·옛 HEAD CI 표현은 당시 이력이다. [STATUS](../../STATUS.md) · [잔여 구현](../../docs/REMAINING_IMPLEMENTATION_20261104.md).

## 비공개 운영자 인입 명령 (#27 · A03.3)

`apps/api/src/admin/intake.ts`는 기존 `PostgresRestrictedIntakeImport`의
운영자 전용 소비자다. 브라우저 라우트나 자동 파일 탐색 없이, 별도로 준비한
비공개 factory가 전달하는 4개 대상 Forms/CSV와 독립 목적 권한만 사용한다.

먼저 API를 빌드한 후, 설정이나 원본을 읽지 않는 계획 확인을 실행할 수 있다.

```bash
npm run build:api
node dist/apps/api/src/admin/intake.js --plan
```

실제 인입은 독립 검토를 마친 Linux 운영자 환경에서만 준비한다.
`HUFS_INTAKE_OPERATOR_MODE=private-staging`,
`HUFS_INTAKE_OPERATOR_ACK=PRIVATE_INTAKE_NOT_RELEASE`와
`HUFS_INTAKE_CONFIG_MODULE`을 명시해야 한다. 모듈은
`/etc/hufs-one/private/` 바로 아래 root 소유의 일반 `.mjs` 파일이며,
중첩 폴더·상위 이동·비정규 경로와 symlink/hardlink 및 group/world 접근을 거부한다. 상위 디렉터리도 root 소유이며
group/world 쓰기를 허용하지 않아야 한다. 모듈 크기는 64 KiB 이하로 제한한다.
`APP_ENV=local`, `NODE_ENV=development` 같은 비공개 검증 환경을 사용하며,
production 또는 미등록 환경값은 비공개 설정을 읽기 전에 거부한다.

모듈의 `createRestrictedIntakeConfig()`는 `RestrictedIntakeConfig`
(`input`, `authority`, 저장 시 `database`)를 반환한다.
권한 어댑터는 실제 운영자와 대상의 `LOCAL_TRANSCRIPT_REVIEW` 목적·원본 이용권·
현재 동의를 독립 확인해야 한다. 기본 권한, 기본 자격증명, 저장소 이력 CSV를
읽는 구현은 제공하지 않는다. 저장용 DB는 기존 pool factory의
`environment: 'production'` TLS/전용 nonprivileged LOGIN 검사를 사용한다.
이 값은 DB 연결의 보안 모드이며 공개 앱의 production 기동을 허용하지 않는다.

다음은 승인된 비공개 환경에서 사용할 명령 형식이다. 토큰·해시·버전은
그 환경의 현재 값을 사용하고, 실명이나 학번을 인자로 넣지 않는다.

```text
node dist/apps/api/src/admin/intake.js --preview
node dist/apps/api/src/admin/intake.js --apply --preview-hash <64자리 소문자 SHA256> --expected-version <익명대상A>=<현재버전> --expected-version <익명대상B>=<현재버전> --expected-version <익명대상C>=<현재버전> --expected-version <익명대상D>=<현재버전>
```

- `--preview`는 DB pool을 생성하거나 SQL을 실행하지 않는다. 원본·이름·경로·
  대상별 레코드 대신 검토 해시, 전체 행 수, 오류 코드별 수, 학점 비교 결과 수만 출력한다.
- `--apply`는 서로 다른 4개 익명 대상의 버전을 각각 받는다. 모든 값은
  정규형 0 이상의 안전한 정수이며, 전체 입력·actor·대상/파일 매핑에 결속된
  preview 해시와 일치해야 한다. 이 값들은 원본 열람·처리 권한을 대신하지 않는다.
- 권한·동의·preview 확인에 실패하면 pool을 열지 않는다. 각 대상의 현재 head와
  CAS를 확인하고 네 대상을 한 트랜잭션에 저장한다. 같은 배치 재실행은 재사용하며,
  다른 배치의 오래된 버전은 전체 롤백한다. DB 연결·잠금·저장 대기 뒤에도
  COMMIT 직전 네 대상의 현재 목적 권한을 다시 확인한다.
- 결과는 항상 `STUDENT_REVIEW_PENDING`이다. 불명확한 학점이나 동의를
  임의로 확정하거나 `DEMO_READY`·공식 졸업요건으로 승격하지 않는다.
  명령 종료 때 pool을 닫고, 실패는 원본/경로/DB 오류를 숨긴
  `INTAKE_COMMAND_REFUSED_OR_UNCONFIRMED`만 출력한다.
  이 메시지는 이미 저장된 커밋의 롤백을 보증하지 않는다.

검증은 `tests/api/intake-operator.test.ts`와
`tests/api/intake-postgres.test.ts`의 합성 SQL 프로토콜 검사 및 빌드된
`--plan`/미승인 `--preview` 거부 확인이다. 실제 비공개 factory, 원본 파일,
운영 PostgreSQL/RLS·권한/동의 증명은 **NOT_RUN**이며 공개 출시는
**RELEASE_BLOCKED**다.

## 승인 이미지·PDF OCR의 저장·검수·검색 (#19/#20, 로컬 코드)

`createApprovedDurableSourceExecutor`의 선택 항목 `imageExtractor`에
`createApprovedImageExtractor`를 명시적으로 연결하면 PNG/JPEG의 원본 SHA,
OCR 필드/좌표와 IMAGE 인용을 불변 판본으로 저장할 수 있다.
PDF는 별도 `pdfExtractor: createApprovedPdfExtractor(...)`와
`createPopplerPdfRenderer(...)`를 연결한다. `pdfRuntimeIdentity(runtime)`의
정확한 렌더러 해시를 권한 영수증에 결속하며, 원본 PDF·페이지별 PNG·OCR 필드·
원본 페이지 좌표 변환을 함께 보존한다. 조립·제한·검증 범위는
[PDF_RUNTIME](../../infra/ai/PDF_RUNTIME.md)을 따른다.
기본값은 OFF이며, 독립 `TRANSFORM`·`EXTERNAL_AI` 영수증과 기존
COLLECT/STORE/EXTERNAL_TRANSFER 권한, 별도로 주입한 예산·취소 통제 OCR 포트가
모두 필요하다. 비동기 처리 전후 같은 권한을 재검증한다. 실제 provider나
자격증명은 기본 제공하지 않는다.

업데이트한 reader/writer를 배포하기 전에 별도 검토한
`infra/sql/20261105_source_image_evidence.sql`을 기존
`20261101_source_review.sql` 뒤에 적용하고, 이어서
`20261105_source_pdf_evidence.sql`을 적용해야 한다. 이 작업은 마이그레이션을
실행하지 않는다. 기존 비공개 ingest 역할에는 revision/paragraph 메타데이터 조회와
봉인 확인을 위한 originals의 `SELECT(revision_id)`가 필요하다. 새 마이그레이션은
권한을 자동 부여하지 않으며, 검색 역할에는 원본 바이트 접근을 추가하지 않는다.
PDF ingest/review 역할의 `source_pdf_rasters_vnext` 접근도 별도로 검토해야 한다.
검색 view는 검증용 페이지 메타데이터만 제공하며 PDF/PNG 바이트는 제공하지 않는다.

새 이미지는 항상 `NEEDS_REVIEW`다. 독립 검수자가 원본·문단·OCR/bbox 묶음의
정확한 해시를 확인한 뒤에만 effective view와 검색이 IMAGE 근거를 사용한다.
원본 묶음을 저장한 뒤 IMAGE 문단을 추가하는 순차 INSERT를 거부하며,
동시 쓰기는 기존 source-head 잠금 프로토콜을 따라야 한다.
같은 원본은 확인 시각만 갱신하고, 정정 이미지는 미검수 후속 판본을 만든다.

네트워크 원본 상한은 256 KiB다. PNG/JPEG는 identity raster v1의 단일 페이지,
PDF는 최대 4쪽의 `pdf-full-page-v1`만 지원한다. PDF는 암호화·첨부·스크립트·
양식/주석·회전·잘라낸 페이지·비단위 UserUnit을 거부한다. 페이지당 PNG 256 KiB,
원본과 모든 PNG 합계 1 MiB, 렌더러 10초 상한을 적용한다. pypdf 6.21.4와
독립 검토한 Poppler/Python/라이브러리/폰트 전체 rootfs의 정확한 해시가 필요하다.
패키지나 바이너리를 자동 설치하지 않으며 승인되지 않은 host 폴더를 mount하지 않는다.
정규화 성공은 OCR 의미·레이아웃의 인적 정확성 판정이 아니다.
`source-image-ingestion.test.ts`, `source-pdf-ingestion.test.ts`,
`source-pdf-persistence.test.ts`는 합성 권한/취소/저장/검수/검색을 검사한다.
두 `source-*-live-slice.ts`를 기존 opt-in PostgreSQL CI에 연결했으나 로컬 실 PG는
미실행이다. 그 fixture는 admin writer/reviewer와 제한된 reader를 사용하므로
운영 ingest/review 역할 설정이나 실제 포스터/PDF 평가를 증명하지 않는다.
실제 합성 PDF를 렌더링한 worker 검증과 전체 bubblewrap 실행/운영 허가는 구별한다.
기본 OFF 및 **RELEASE_BLOCKED**는 유지한다.

## 공유 컨텍스트 자원과 해제 (#203)

`POST /api/demo/contexts`의 프로세스별 전역 200개 제한에 사용자당 100개,
세션당 50개 제한을 더한다. 기존 5개 대상의 20개 방향 전환(40회 선택)과
별도 탭·지연 요청, 사용자당 2세션을 수용하는 합성 시나리오를 기준으로 하며,
다른 사용자의 컨텍스트를
강제 퇴출하지 않는다. 서버 조립의 `contextLimits: {perActor, perSession}`으로
1~200 범위에서 조정할 수 있고 `perSession <= perActor`여야 한다.
동일 사용자 여러 세션과 BETA/REVIEWER에 같은 정책을 적용한다.
만료 회수·상한 검사·저장은 비동기 권한 재검사 후 동기적으로 실행한다.
429는 내부 사용자/용량 정보 없이 `Retry-After: 300`을 반환한다.

`DELETE /api/demo/contexts/:id`는 검증된 현재 actor/session의 컨텍스트만
해제한다. Origin/CSRF가 필수이며 없거나 다른 세션의 ID도 동일한 빈 204를
반환한다. 만료·공유/초대 철회 뒤에도 유효한 로그인 세션으로 해제할 수 있다.
해제된 컨텍스트를 읽던 지연 응답은 반환 전에 403으로 차단한다. 로그아웃은
해당 세션의 컨텍스트만 해제한다. 브라우저는 별도 UI 연결 전까지 기존 5분
만료를 사용하며, 이 프로세스별 Map을 다중 서버 공통 quota로 보장하지 않는다.

## 2026-11-03 최신 서버/AI 실제 코드 경계

- **main 병합:** [#145 오프라인 CLOVA General OCR/HCX-005·007 wire](https://github.com/ot4562-glitch/HUFS-One-AI/pull/145) `cade7c9b` (request/response·bbox/candidate 검증) 및 [#148 원자 PostgreSQL 예산 원장](https://github.com/ot4562-glitch/HUFS-One-AI/pull/148) `e102516` (phase/actor reserve/idempotency·UNKNOWN_BILLING hold/초과 정산 OFF). 각각 최신 HEAD 비작성자 승인·합성/일회용 PG/Chrome CI **3/3 SUCCESS**. SQL은 검토용이며 **운영 migration이나 AI 호출을 활성화하지 않음**.
- **현재 main 미병합:** [#150](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150) provider runtime·권한/동의/출처 재검증·bounded transport/timeout·결과 영속 조회·Laya child worker·현재 이중전공/빈 시연 계정 API·프라이빗 배포 템플릿은 **Draft, 선행 #145/#148/#131 squash와 충돌, 최신 HEAD 타인 APPROVED 0건**입니다. 이 문서 뒤의 “필요한 추가 구현/통합”은 **main 기준**이며 #150 체크포인트를 승인된 API로 오해하지 않아야 합니다.
- **릴리스 차단:** [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 원본 Git 게시/권리·privacy **2 FAIL**, [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) Google/학교메일·실 PG/TLS/직접 IP·권한 철회·NCP 실호스트/유료 provider 미검증. `AI_ENABLED=false` 기본·`RELEASE_BLOCKED`; 실학생 자료 외부 전송·NCP 개통/과금은 별도 승인 전 금지. [STATUS](../../STATUS.md), [PR_WORKFLOW](../../docs/PR_WORKFLOW.md) 우선.

## 소비자 리뷰 후속: 비공개 근거·학점·수동 저장본

학업 source는 가린 과목의 분반/선수 근거 ref와 URL도 제거한다. 필요한 근거가 숨겨진 확정 경고는 `NEEDS_REVIEW`이며, 승인 receipt 자체가 가린 근거를 포함하면 응답을 만들지 않는다. 일반 승인 학점 상한은 공개 가능한 경우 유지한다. 종료 학기는 저장소 조회 전에 공통 `422 INVALID_INPUT`으로 거절하고, 로컬 계정 학점은 공통 스키마에서 0.5학점 단위만 받는다. 화면의 십진수 입력 파서와 step은 UI 담당이 이 계약을 소비한다.

`importSavedCurriculum({sourceUrl, originalBytes, csv, authority, now, previous})`는 private operator 전용 수동 저장본 입력이다. 승인된 #138 등의 변환 결과를 받고 HTML을 변환하거나 fetch하지 않는다. authority의 `OPERATOR_SAVED` 정책은 `robots: NOT_APPLICABLE`, 기존 수집/보관/약관 허가·정확한 URL/증거/만료, `savedArtifactSha256`, `normalizedCsvSha256`, `capturedAt`, `converterVersion`, `redistribution: ALLOWED|DENIED`를 모두 요구한다. 원본 5MB/CSV 1MB 한도·두 hash와 전후 권한을 확인하고 원본 검수시각을 보존한다. `DENIED`는 로컬 검수용 보존만 뜻하며 재배포·시연·운영 catalog 등록 권한이 아니다. 이 함수는 원본/이름/경로를 반환하거나 DB/파일에 쓰지 않는다.

**2026-11-03 수동 WIS importer 인계:** [#138](https://github.com/ot4562-glitch/HUFS-One-AI/pull/138) HTML 파서와 [#149](https://github.com/ot4562-glitch/HUFS-One-AI/pull/149) 8열 CSV/`.handoff.json`/원본·CSV SHA가 각각 **main `605144c`, `efa13368` 병합**. #149의 `UNKNOWN` 캠퍼스 임의 확정 결함은 HEAD `f797787`에서 수정·음성 테스트, 비작성자 승인·CI 3/3 확인. **파일 변환기는 로컬만**이며 실제 운영 import/이용허가 제공 아님. 현 `CurriculumAuthority.resolve(sourceUrl, now)` 인터페이스는 WIS 페이지가 학과·학기와 관계없이 동일 URL인 복수 저장본에 대해 **파일별 권리 receipt 조회 식별자가 부족**합니다. [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)·[#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133)에서 `sourceUrl` + `savedArtifactSha256`(또는 동등한 승인받은 복합 키)로 pre/post/철회·무결성·각 파일 보관권을 별도로 검증하고, `details`/withheld 인계 계약·Git 외 제한 전달을 결정할 때까지 실제 학교 저장본을 승인 카탈로그에 반입하지 마세요.

자동 `collectCurriculum`은 수동 정책을 거절하고 robots `ALLOWED`를 계속 요구한다. 수동 저장·브라우저 접근 가능 여부가 이용권을 대신하지 않는다. `cohort: UNKNOWN`, 9자리 원본 분반 코드와 category 원문을 허용하며 공식 RulePack을 추론하지 않는다. 실제 변환/수집물·권리 심사·운영 등록은 별도이며 현재 합성 테스트만 수행했다.

## 2026-11-02 로컬 후속: PostgreSQL 본인 수강계획 입력 연결

`createPostgresPlatformServices`의 선택 항목 `ownerCatalog: {pool, authority}`는 기존 승인 카탈로그를, `studyPlanCheck: {pool, authority, rights, approvalGate}`는 `PostgresOwnerStudyPlanSnapshotLoader`와 기존 학업 순수 코어를 연결한다. 모든 인자는 서버 운영자가 독립적으로 제공하며 기본값·실자료 fallback·자동 활성화는 없다. `rights`는 조회 전후 개인 목적·정확한 공개 근거를, `approvalGate`는 학업 코어·RulePack의 현재 승인을 별도로 확인해야 한다.

기존 `20261101_owner_approved_catalog.sql`의 `PLAN_INPUT` projection은 학기(`entity_id`)별 **검수된 원장·교과목 학점/개설·학기 규칙·출처 링크·허용 공개 범위**를 `ApprovedOwnerPlanInputSchema`로 저장하는 private operator 입력이다. 학생 계획은 이 승인 입력에 복사하지 않고 같은 read-only repeatable-read 거래에서 `api_self_workspace_records`의 현재 본인 `STUDY_PLAN`을 읽는다. 편집/삭제/추가를 포함한 행 집합으로 `plan-<sha256>` 버전을 계산하므로 오래된 브라우저 버전은 HTTP 409이며 현재 계획 계산을 대체하지 않는다. 공개 응답에는 원장 행·attempt token을 싣지 않는다. 승인 입력이 없으면 workspace도 읽지 않고 HTTP 503이다.

조회 토큰은 actor와 source/consent/projection/계획 행 fingerprint에 결속되고 128개·단회·최대30초로 제한한다. 카탈로그/계획 모두 승인 projection과 SQL SEARCH 권리의 만료 시각으로 토큰 수명을 추가 제한하고, 마지막 비동기 검사 완료 시에도 만료를 재확인한다. 과거 `asOf`는 원본 시점으로 보존하며 권리 만료/철회는 현재 시각으로 검사한다.

새 migration·학생 자료 import·공식 규칙 자동 승인·운영 프로세스는 추가하지 않았다. 검증은 합성 SQL-protocol 및 Fastify HTTP 테스트이며 **실 PostgreSQL/RLS/운영 로그인 검증은 NOT_RUN**이다. 최신 수치와 이행 경계는 [STATUS](../../STATUS.md)를 따른다.

**2026-11-01 미병합 구현 제안:** #119 정정 비교·#86 추천 제외 이유 계약/API,
#82 read-only What-if gate, #81 계획 검사 통합/신뢰 snapshot→기존 학업 코어 adapter와
네 브라우저 메서드를 추가했다. 명시적 source/rights/approval 주입 전에는 503이다.
[경로·주입 계약·소비 방법·남은 게이트](../../docs/OWNER_API_IMPLEMENTATION_20261101.md).


> **2026-11-01 최신 `main` 코드 정본:** 플랫폼 [#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83) 병합, 비동기 REVIEWER 등록/목록 grant 재확인 #105, 출처 원본·문단 정합 검수 #99, 동의 철회/삭제 원자 PG #102/#112, 다중 인스턴스 ingest worker lock #113, 보관함 단계 owner-only HTTP #97/브라우저 #106·#115, 학기계획 read-only 권한 gate #103·[학업 #116 strict 응답 호환](https://github.com/ot4562-glitch/HUFS-One-AI/pull/116), 가상 전공 What-if Zod DTO(계산 아님) #107, 캘린더 늦은 응답 방어 #95, REVIEWER 합성 탭 격리/fragment 보호 #100/#110 모두 main 병합. `createIntegratedApi`의 실제 인증/provider/학사 RulePack/자료 권리 포트를 갖추지 않으면 미검증 학업 READY·실학생 응답을 반환하지 않는다.
>
> **실제로 남은 게이트:** UI #72 비합성 `AppServices.loadCalendar` 연결 및 동일 epoch snapshot 교체 잔상 버그, 후속 #73→#76 UI/접근성 미병합. Google OIDC·외대메일 OTP 발송·운영 PostgreSQL/NCP·기관 자료권리/학생 동의·TLS/CDN/직접 IP·실브라우저 E2E 검증이 없어 공개 배포는 `RELEASE_BLOCKED`. 과거의 '#83 미병합' 아래 기록은 당시 이력이다. [STATUS](../../STATUS.md).

> **2026-11-01 최신 main 검증 기록:** 서버 #58은 합성/일회용 PG 인증·권한·SourceRevision/Temporal RAG·캘린더 GET 구현을 main에 병합했다. 브라우저 [#77](https://github.com/ot4562-glitch/HUFS-One-AI/pull/77) `HufsApiClient.getCalendar`·bounded same-origin/no-store 및 401/403/409/503/Abort 테스트는 비작성자 승인·Actions [41279165323](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41279165323) SUCCESS 후 **main squash `552ad35e` 병합**, [#71](https://github.com/ot4562-glitch/HUFS-One-AI/issues/71)은 API 범위 CLOSED. [#69](https://github.com/ot4562-glitch/HUFS-One-AI/pull/69) 오늘·기회·공지 UI main merge `5617222f`. #72 비합성 `AppServices.loadCalendar` 미연결·CHANGES_REQUESTED, UI 나머지 #73~#76 미병합. 후속 [#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83) 신규 SQL/인증/원본검수/overlay/태그승인은 Ready review / 타인 승인·신규 PG opt-in 30건 실제 실행 전 미병합. 아래 '#58 main 미병합'은 당시 기록. 실 Google/SMTP/TLS/운영 DB·기관/실학생 동의/NCP 및 브라우저 실서비스 E2E는 미확인이다.

## 2026-11-01 통합 브랜치 당시 구현 내역 (#58 main 병합됨)

`feat/platform-integration-20261101`에서 #32/#33/#34/#35/#55를 통합했고 다음 기능을 추가했다(main 미병합).

- `GET /api/demo/contexts/:id/calendar`: no-store, 서버 context·현재 grant/source/asOf·전체 receipt 재검증, 부분공유 입력부터 재계산. 미정/상시/적용 미확인과 취소 head를 확정 일정으로 승격하지 않는다.
- **2026-11-01 리뷰 수정:** 승인된 `api_calendar_input_projections.input_json.deadlineProofs`는 `CalendarDeadlineProofSchema`가 현재 revision+reviewer+checkedAt≤asOf+유니코드 exact TEXT 인용을 확인하며, 실제 출처의 원문 문단은 불변 `source_paragraphs_vnext`에서 같은 트랜잭션으로 재조회해 증빙 문단 위조를 차단하고, API 읽기 시에도 `resolveDeadlineClaims`로 **실자료 APPLY/STUDENT/ADMIN 날짜를 새로 계산**한다. 원본 projection에 마감일만 있고 증빙이 없으면 확정 날짜는 삭제하고 FIXED 지원마감을 UNKNOWN으로 변경한다(합성 시연만 예외). 공지의 `evidenceRefs` 및 추천 카드/캘린더 엔트리의 `evidenceRefs`에 채택한 claimId를 남기며 임의 학생자료/IMAGE 인용을 승인하지 않는다. `ScopedApiRepository`는 `versions.rankConfig`를 이번 권한별 `composeFeed`가 실제 사용한 버전으로 재표시한다. 별도 승인 projection writer의 사람 검수·원본 자료 이용권은 이 코드로 대신하지 않는다.
- **A13 본인 계정 REST (통합 DI에서 명시 주입 시에만)**: `GET/PATCH /api/profile`, `GET/PUT /api/consents`는 `PostgresSelfAccountStore` + `20261101_self_account.sql` 사용. verified BETA actor `sub`·Origin/CSRF·독립 owner authority·`expectedVersion`·`FORCE RLS`·동의 버전/변경 purpose 메타 감사. `personalStorage=false` 철회 시 해당 actor의 프로필·개인 작업 기록을 같은 트랜잭션에서 물리 삭제; 공유/AI/NCP/녹화 동의 boolean은 **실제 외부 권한 발급이 아니다**.
- **A13 소유자 작업 REST**: `GET/POST /api/experience/cards`, `GET/PATCH/DELETE .../cards/:id`, `GET/POST /api/study-plans`+`PUT /:id`, `GET/POST /api/saved-items`+`DELETE /:id`, `GET/POST /api/action-plans`+`PATCH /:id`, `POST /api/experience/from-opportunity`. `PostgresOwnerWorkspaceStore` + `20261101_self_workspace.sql`로 actor 단위 `FORCE RLS`, 원자 버전/CAS·감사 및 kind별 200건 보존 상한. 독립 fixture/owner-purpose authority 없으면 모든 모드 거부; 다른 시연 대상 원장 수정 불가능. 공고에서 경험을 가져올 때 최신 권리/판본 `revalidate` 뒤 **DRAFT만 생성**, 실제 지원·이력 공식 확인 없음.
- **A13 승인된 자료 조회 REST**: `GET /api/academics/transcript`, `GET /api/courses`, `GET /api/courses/:id/offerings`, `GET /api/opportunities`, `GET /api/opportunities/:id`. 별도 승인 `TrustedCatalogPort`가 검증된 BETA actor에 귀속된 최신 source head/기관 이용권/학사 소유권을 조회하고, 응답 전에 **scopeToken·시점·actor 권한을 재검증**해야만 동작한다. 현재 실제 학사/공고 provider 또는 개인 원본 자동 조회 어댑터는 미주입이며 임의 가상 자료를 실운영 응답으로 사용하지 않는다. 검색/목록 상한 50, 시점·출처·ACTIVE 검수 상태·미래 근거/교차 대상 누출 검사. 2026-11-01 학업 리뷰에 따라 승인 성적표에서 PLANNED를 거절하고, 학기별 개설 목록은 `YYYY-1|YYYY-2`의 `CONFIRMED_OFFERED|CONFIRMED_NOT_OFFERED|UNKNOWN`만 사용한다. 과거 개설 패턴은 이 조회로 확정하지 않으며, 실확정은 독립 검수된 `ACTIVE` 출처·시점이 필요하다. 개설 목록의 정렬/페이지 `afterId`/`nextCursor`도 서버에서 재검사한다.
- `POST/GET /api/demo/contexts/:id/personal`, `GET/PUT/DELETE .../personal/:itemId`: actor는 인증 세션에서만 도출, 쓰기는 Origin/CSRF와 expectedVersion 검사, 개인자료 동의·검증된 합성 승인 별도. POST `{itemId,value}`, PUT `{expectedVersion,value}`, DELETE `{kind,expectedVersion}`, GET `?kind=...`(목록은 afterId/limit 가능).
- `GET /api/evidence/sources/:sourceId/revisions`는 통합 DI가 명시적으로 설치할 때만 노출한다. BETA 세션 및 현재 permission/source/head/검증된 학사 scope를 SQL 조회 전후 검사하고, 최신 정정·취소/미검수 판본의 **메타데이터만** 반환한다. 원본 텍스트·개인 학적 자료·OCR 이미지·권한 토큰은 반환하지 않는다.
- `PostgresSourceIngestionQueue` (`src/modules/opportunities/source-ingestion-queue-postgres.ts`): 운영자가 별도 trusted authority+durable draft executor+전용 DB pool을 주입할 때만 `enqueue`/`runOne`으로 작동한다. 큐 최대 16, DB 전역 동시 lease 1, 멱등 키, 30초 초과·오류/모호한 처리결과는 **인적 재검토 격리, 자동 재시도 금지**. 비동기 타이머·외부 fetch·OCR·모델 호출/실제 크롤링을 시작하지 않는다. `20261101_source_ingest_queue.sql` 적용 및 소유자 권한 검토가 선행되어야 한다.
- `createApprovedDurableSourceExecutor` + `ApprovedPlainTextExtractor` (`src/modules/opportunities/`): 관리자가 exact HTTPS URL/rights/주입된 pinned network transport를 별도 승인한 후에만 원문 SHA/본문 해시, revision current head와 PG 불변 초안을 연결한다. 200 OK 동일 원문 및 **버전·URL에 묶여 PostgreSQL에 보관한 ETag/Last-Modified 기반 304**는 verification 날짜를 승격하지 않고 `observeUnchanged`; 새판은 `NEEDS_REVIEW`. 조건부 응답이 원본의 최신 head와 맞지 않으면 거부한다. 텍스트/HTML/RSS/Atom은 보수적 문단 파싱; PDF/image OCR은 **심민성이 구현·검증하는 별도 승인 extractor/provider adapter**가 필요하다(이서연은 NCP 서비스 계정/키 권한·비용/환경 준비만 담당). 동작 시 실제 네트워크를 임의 시작하지 않는다.
- `PostgresReviewerSandboxStore` (`src/modules/auth/reviewer-sandbox-postgres.ts`): 별도 최소권한 pool + `20261101_reviewer_sandbox.sql`의 활성 초대 검사/철회 직렬화 SQL 함수로 invite/actor/S01–S05별 행동을 PG 영속화. `RESET_SANDBOX`/200 액션 한도, 실 학생 DB와 격리. `createIntegratedApi`의 `reviewer.sandbox`에 명시적 제공 필요.
- `PostgresRestrictedIntakeImport` (`src/modules/academics/intake-postgres.ts`): A03.3의 **비공개 운영자 전용 포트**, 실제 CSV/Forms 자동 수집·HTTP 업로드 기능 없음. 목적별 권한 주입 후 4인 Forms(26열)+CSV(6열)의 preview, 정확한 subject/file binding·학점 자기보고 차이(UNKNOWN/MISMATCH/MATCH), SHA receipt, APPLY에서 모든 학생 CAS/멱등/불변 `STUDENT_REVIEW_PENDING` 원장을 단일 PG 트랜잭션으로 저장. 목적별 당사자 동의 없이는 불가하고 DEMO_READY/공식 졸업 인정으로 자동 승격하지 않는다.
- `createPostgresPlatformServices` (`src/platform-postgres.ts`): 검증된 역할별 pool과 서버 EvidenceRightsResolver를 받아 ScopedApiRepository·calendarSource·personalState·temporalEvidence를 구성한다. `createIntegratedApi({...services, googleAuth, allowedOrigin, reviewer})`로 인증/provider-neutral 포트를 연결한다. 이 조립은 연결/마이그레이션/키 생성이나 production 차단 해제를 수행하지 않는다. REVIEWER calendar는 별도 합성 source가 필요하며 team source로 fallback하지 않는다.
- DB 적용 순서: 기존 `infra/sql/20261031_*.sql`의 의존 순서 후 `20261101_calendar_inputs.sql`, Temporal Evidence migration 뒤 `20261101_source_http_validators.sql` 및 `20261101_source_ingest_queue.sql`; `20261031_reviewer_invitations.sql` 뒤 `20261101_reviewer_sandbox.sql`; 시연/운영 자료와 분리된 `20261101_intake_staging.sql`(private import 포트 전용); 별도 owner API에서는 `20261101_self_account.sql` 다음 `20261101_self_workspace.sql` 적용과 **전용 non-owner 계정/최소권한 role** 검증 필요. **운영 DB 반영은 모두 별도 승인·최소권한 검토 전 금지**. 실제 운영 적용은 별도 검토한다. 입력은 승인된 정규화 projection과 서버 provenance/목적별 source permission registry이며 기존 csv/Forms를 자동 import하지 않는다.
- `npm run check`, `npm run build:api`, `python tools/verify_release_boundary.py`. build 출력은 루트 `dist/apps/api/src/`이며 start/admin npm scripts도 이 경로를 사용한다. 기본 local main은 인증 adapter 없이 127.0.0.1에서 401/no-store로 차단한다.

실제 로컬 PostgreSQL 재현(빈 disposable DB만 허용): `HUFS_A2_PG_LIVE=1`/`HUFS_A2_PG_LIVE_URL` → `hufs_one_a2_test`; `HUFS_PG_FULL_LIVE=1`/`HUFS_PG_FULL_URL` → `hufs_one_full_test`; `HUFS_PG_CALENDAR_LIVE=1`/`HUFS_PG_CALENDAR_URL` → `hufs_one_calendar_test`. 정확한 환경변수와 거부 조건은 각 `tests/api/pg-*-live-opt-in.test.ts` 헤더를 따른다. GitHub Actions는 원본 없는 sparse checkout과 공식 PostgreSQL 서비스에서 세 suite를 실행한다.

아래 2026-10-31 설명은 기존 모듈·설계 기록이다. 현재 브랜치 구현과 당시 미구현 상태는 위 절을 우선한다.


심민성 담당 Fastify 합성 API는 `main`에 반영됐다. Google OAuth·외대 메일 증빙·영속 DB 연결은 별도 출시 검증 대상이며, NCP·CLOVA·OCR/Vision SDK/HTTP·Laya ONNX worker 등 모든 공급자 코딩은 **심민성** 담당이며, 이서연은 **NCP 비코드 운영 #12/#22** 전담이다.

## 구현한 코드

| 모듈 | 현재 상태 |
|---|---|
| Fastify HTTP API | Zod 입력 및 공통 오류 형태, no-store/보안 헤더, Origin/CSRF 검사 |
| 세션 경계 | 검증된 세션 어댑터 없으면 전 경로 401; 현재 학교 메일 증빙·베타 허용 필요 |
| 시연 목록/컨텍스트 | 5개 슬롯, SharingGrant·actor/session·철회/버전 검증, 원자적 DemoSnapshot |
| AI 경계 | 계약상 네 작업만, 서버가 승인한 SafeLlmPacket reference, 인용문/TopicCode 검사, 가짜 모델 후보는 NEEDS_REVIEW, 중복요청/사용량 상한 |
| LocalTemporalEvidenceIndex | 불변 revision/hash/정정·취소, 권한/검수/게시·수집/적용시각 필터, 한국어 lexical 후보 검색 |
| 테스트 | Fastify inject 합성/부정 테스트 통과. 브라우저·학교 인증·CLOVA/NCP·DB E2E는 별도 검증 |

## 로컬 검증 및 실행

저장소 루트에서 다음 명령을 사용합니다.

~~~bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run build:api
npm run check:privacy
npm run start:api:local
~~~

로컬 실행은 127.0.0.1에만 바인딩합니다. APP_ENV=production에서 실행이 차단됩니다. **실제 OIDC/OTP 세션 제공자가 없으므로 모든 API 요청은 401**입니다. 테스트만 private Fastify inject 세션 verifier와 합성 MemoryApiRepository를 사용하며 HTTP 인증 우회 헤더를 제공하지 않습니다.

### 현재 등록한 API

- GET /api/health, GET /api/auth/session, POST /api/auth/logout (세션 무효화 연동 전에는 503)
- GET /api/demo/profiles, POST /api/demo/contexts, GET /api/demo/contexts/:id/snapshot
- GET /api/demo/contexts/:id/notices, /graduation, /outlook
- POST /api/ai/:task (4개 공개 작업의 합성 packet만), GET /api/ai/jobs/:id (MOCK/NEEDS_REVIEW)

브라우저가 actorId/hd/email_verified/sourceTokens를 보내서 권한을 만들 수 없습니다. 사전에 승인된 별도 서버 세션 어댑터/Repository가 필수입니다. 오류 응답에 raw 모델/DB/학생 문장을 담지 않습니다.

## 추가 기획: 캘린더 권한 API (2026-10-31)

- `GET /api/demo/contexts/:contextId/calendar`는 [#52](https://github.com/ot4562-glitch/HUFS-One-AI/issues/52)의 **예정 엔드포인트로 현재 서버 라우트는 미구현**이다. 결과 `CalendarResultSchema`/[#53](https://github.com/ot4562-glitch/HUFS-One-AI/pull/53)과 순수 계산 [#50](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50)은 main에 병합됐지만 인증된 API GET 및 UI [#51](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51)는 미연결이다.
- 실제 구현은 인증 actor/context/subject, 현재 SharingGrant/grantVersion, 만료/철회, FEED/NOTICES/ACADEMICS/EXPERIENCE 섹션 및 신뢰된 원천 provenance를 원자 검증한 후 `asOf`·출처권리·정정/충돌·sourceRevision·scopeKey가 일치한 결과만 `no-store`로 제공한다. 미확인 적용여부·상시/미정은 확정 날짜에 승격하지 않는다. REVIEWER는 합성만 허용하고, 부분공유 데이터/철회/시점/경쟁 부정 E2E가 필요하다.
- `readAuthorizedSnapshot` 강제 [#55](https://github.com/ot4562-glitch/HUFS-One-AI/pull/55), PostgreSQL 허가 [#35](https://github.com/ot4562-glitch/HUFS-One-AI/pull/35)는 미병합/재검토 대기이고, 추천·공지 `scopeInputsToGrant` [#49](https://github.com/ot4562-glitch/HUFS-One-AI/pull/49)는 **main에 병합됐으나 서버 신뢰 provenance 실제 경로 연동 전**이다. 기존 분리 조회가 실제 BETA를 보호한다고 간주하지 않는다.
## Google OIDC 신원 검증 코어 (심민성 TASK-07/08 · #27)

- `apps/api/src/modules/auth/google-oidc.ts`는 서버 생성 `state`·`nonce`·PKCE S256 인증 요청, 5분 만료 callback state digest 검사, 서명된 Google ID 토큰의 JWKS/RS256·issuer·앱 audience·nonce·iat/exp·email_verified·Google `sub` 검증을 제공한다.
- 운영 JWKS 주소는 Google의 고정 공개키 엔드포인트이고, 테스트는 **로컬 RSA 키와 합성 JWT만** 사용한다. 검증에 성공해도 역할·베타 허용·세션이 자동 생성되지 않는다.
- `schoolWorkspaceVerified`는 검증된 `hd=hufs.ac.kr` **및** 확인된 `@hufs.ac.kr` 주소가 동시에 있을 때만 true이다. 일반 Gmail 심사자에게는 별도 공용 초대 등록 권한이 필요하고, 그 밖의 학생/베타 계정은 학교 메일 OTP·베타 allowlist를 추가 검증한다.
- `google-auth-flow.ts`는 **옵션으로만 활성화되는** `/api/auth/google/start` → `/api/auth/google/callback`과 서버 발급 `__Host-` HttpOnly/Secure/SameSite 쿠키, 5분 만료 상태의 원자적 소비, 로그인 후 CSRF 수령 `GET /api/auth/csrf` 및 서버 세션 철회를 구현한다. 등록 전 REVIEWER는 CSRF 증명 획득·초대 등록 및 별도 승인된 학교 메일 인증만 시도할 수 있고, 합성 데이터 접근은 유효한 초대 기간에만 허용한다. 초대 만료·철회 뒤에도 CSRF 검증을 통과한 로그아웃은 가능하다.
- `google-auth-store.ts`는 합성 메모리 저장소, `google-auth-postgres.ts`는 `DELETE ... RETURNING` 기반 영속 1회 콜백/세션/철회 어댑터, `infra/sql/20261031_google_auth.sql`은 미적용 migration이다.
- `beta-admission.ts`·`beta-admission-postgres.ts`·`infra/sql/20261031_beta_admission.sql`은 Google `sub`+사전 승인된 `@hufs.ac.kr` 메일+유효한 학교 증명을 결합한다. Google 로그인이 일반 Gmail이어도 **관리자 승인과 실제 외대 메일 OTP 검증이 완료된 같은 Google `sub`**인 경우에만 베타 자격을 얻는다. 서명된 Workspace `hd` 경로는 OIDC 메일과 학교 주소가 정확히 같아야 한다. `createBetaSessionRechecker`는 매 요청 승인·증명 철회를 검사한다.
- `google-authorization.ts`는 고정 Google 토큰 엔드포인트의 authorization-code+PKCE POST를 구현한다. OAuth 앱 클라이언트 인증은 서버의 `createGoogleClientAuthenticator` 또는 보호된 런타임 어댑터로만 주입한다. 다른 리다이렉트/앱 ID·입력 위변조·과대한 제공자 응답은 거부하며, 반환된 ID 토큰은 기존 `google-oidc.ts`에서 서명을 검증한다.
- `school-mail-proof.ts`·`school-mail-postgres.ts`·`infra/sql/20261031_school_mail.sql`은 8자리 메일 인증(10분 만료·코드당 5회 검증·Google 계정당 시간당 3회 발송 제한), HMAC digest 저장, PostgreSQL 원자적 발급/소모와 **관리자가 미리 승인한 행의 UPDATE 전용 증명 반영**을 제공한다. 발송 전에 `SchoolProofApprover.mayIssue`로 **Google 계정과 정확한 학교 주소의 사전 승인·철회 여부**를 검사하고, 승인 데이터 조회 오류·미승인 주소에는 메일을 발송하지 않는다. 메일 발송/런타임 HMAC 키는 외부 서버 어댑터가 필요하다. 검증 완료만으로 새 허용 명단을 만들지 않는다.
- **출시 전 필수**: 승인된 실제 Google OAuth 클라이언트·검증된 PostgreSQL pool/마이그레이션·외대 메일 발신 권한·관리자 승인 명단과 인증서/키 공급·분산/IP 발송 차단·실브라우저 E2E를 연결한다. `apps/api/src/main.ts`는 여전히 OAuth/PG/메일을 주입하지 않고, 로컬 401/운영 시작 차단을 유지한다.
- 검증: `npm run test:api`, `npm run check`, `npm run build:api`, `npm run check:privacy`; 합성 JWT/SQL stub으로 검증하며 실제 Google 자격증명·유료 NCP 호출·사용자 원자료는 사용하지 않는다.

### React UI 연결 계약 (#9 이의상과 교차 검토)

로그인/심사 초대 화면은 이의상 UI 트랙에서 연결한다. 현재 API 경계는 다음과 같다.

1. **브라우저 최상위 탐색**으로 `/api/auth/google/start?intent=REVIEWER` 또는 `intent=BETA`를 요청한다. 서버가 Google 로그인으로 리다이렉트하고, OAuth 상태·PKCE·세션 쿠키는 브라우저 JavaScript에 공개하지 않는다.
2. 콜백 후 같은 출처의 `/reviewer` 또는 `/`로 이동한다. React 앱은 `credentials: 'include'`로 `GET /api/auth/csrf` 및 `GET /api/auth/session`을 호출한다. 심사자 초대 미등록이면 `/api/auth/session`이 403일 수 있으나, CSRF를 받은 후 `/api/reviewer/invitations/redeem`으로 등록한다.
3. **학교 메일 베타 등록**은 Google 신원 세션에서 CSRF를 받은 뒤 `POST /api/auth/school-mail/request` (`schoolEmail`)로 8자리 코드를 메일에 발송한다. 서버는 발송 전 이 Google `sub`와 학교 메일 주소가 관리자 승인 명단에 있는지 확인하며, 승인 정보가 없으면 메일을 보내지 않고 거부한다. `POST /api/auth/school-mail/confirm` (`schoolEmail`, `challengeId`, `code`)으로 검증 완료한 후 `GET /api/auth/google/start?intent=BETA`를 다시 시작한다. 베타 승인은 별도 관리자 명단과 일치해야 한다. 합성 테스트에서는 개인 Gmail + 외대 OTP도 처리한다.
4. 심사 초대 코드가 URL fragment로 전달되면 최초 화면 진입 시 **메모리에만 추출하고 URL에서 즉시 제거**한다. 코드/ID 토큰/세션 쿠키를 로컬 저장소나 React 번들에 기록하지 않는다. 상태 변경은 같은 출처 + `x-csrf-token` 요청만 사용한다.
5. 401/403/409/철회/초대 만료 시 렌더링된 합성 프로필·캐시·진행중 요청을 지우고, 타 탭·타 계정 응답을 섞지 않는다. 실제 React 페이지·모바일 접근성·브라우저 E2E는 UI #9에서 확인한다.
## SourceRevision + Temporal RAG vNext API (심민성 TASK-19/21, PR #33 계약 의존)

- **선행 계약:** `@hufs-one/contracts@0.2.0` PR #33에 정의한 SourceRevision/SourceSpan/Claim/RetrievalEnvelope/RevisionInvalidation. 기존 `SourceSnapshot`·REVIEWER/DemoSnapshot API 형태는 변경하지 않는다.
- `modules/opportunities/revision-ledger.ts`: 합성용 불변 원본 바이트+문단 SHA-256, 시점별 최신 revision, 승인이 빠진 정정·취소가 구버전 ACTIVE 인용을 가리는 규칙, 대상 학번/캠퍼스/전공·출처권한·유효기간 검사, 304 확인일과 인적 검수일 분리, 검색/claim/feed/notice/AI cache invalidation event.
- `approved-fetch.ts`: HTTPS 고정 source allowlist이며 **신뢰된 `transport`가 주입되지 않으면 네트워크 요청 자체를 시작하지 않는다.** 실제 연결 전송기는 DNS 재검증/사설·링크로컬 IP 거부/네트워크 egress allowlist를 별도 구현·검증해야 한다. 리디렉트·인증정보·256KiB 이상 응답은 거부. ETag/304/동일 SHA는 검증시각을 승격하지 않고, 새 내용은 `NEEDS_REVIEW`로만 추가. 서버 추출기는 허용 원문만 텍스트로 반환하며 HTML 스크립트를 실행하지 않는다.
- `temporal-postgres.ts`: SQL `DISTINCT ON(source_id)`에서 **asOf 당시 가장 최신 revision을 먼저 선택**한 후 상태/권리/검수시간/캠퍼스·전공·학번 조건을 적용. 질의는 매개변수 바인딩, 키워드당 position 기반 low-cost lexical, topK≤12. 신규 미검수/취소 버전 뒤에 과거 ACTIVE를 재노출하는 경로 차단.
- `temporal-writer-postgres.ts`, `infra/sql/20261031_temporal_evidence.sql`: 개별 source head `FOR UPDATE` + 짧은 transaction으로 revision/paragraph/invalidation event를 함께 INSERT; 304 검사는 별도 observation 트랜잭션이며 verifiedAt 갱신 없음. 마이그레이션 초안은 동일 source 버전만 supersede하는 FK 및 원문·문단 UPDATE/DELETE 차단 trigger를 포함한다. **실 DB 미적용**. DB owner/writer/reader 역할 분리·실제 동시성/인덱스/권한 성능 검증 필요.
- `temporal-gateway.ts` + 옵션 API `GET /api/evidence/search?q=...&asOf=...&topK=...`: BETA/ADMIN의 서버 세션만 허용, REVIEWER·익명·미래 asOf·브라우저가 임의 지정하는 permissionRefs/actorId는 거부. `EvidenceRightsResolver`를 **SQL 조회 전후** 호출하고 정책 세트/버전 변화 시 응답 근거 전체를 폐기한다. SQL hits와 인용 span의 revision/paragraph/quote 일치 검증; 다른 계정의 cache 공유 금지. 운영의 동시 철회는 별도 DB 트랜잭션/RLS·배포 E2E가 필요하다.

**실제 활성화 게이트:** 서비스 `main.ts`는 현재 `temporalEvidence`를 주입하지 않으므로 신규 검색 경로는 미인증 401/인가되었어도 provider 503을 반환한다. 실 PostgreSQL pool/TLS/승인 source rights/수집비용·트랜잭션 E2E/인적 검수 절차와 허용 원본 데이터가 확보되기 전 운영 데이터 검색·외부 크롤링·NCP/CLOVA 호출은 수행하지 않는다.
## PostgreSQL projection repository and SharingGrant transactions (TASK-27)

`repository-postgres.ts` replaces the **synthetic** `MemoryApiRepository` contract
with a SQL-backed, read-only `ApiRepository` that can be injected by a trusted
server runtime after DB/TLS/security approval. No live connection is created
by importing this module. Queries always bind parameters for the independently
authenticated Google actor ID, exact S01–S05 subject ID, packet task/reference
and trusted server time. No browser-provided actor ID or grant scope is accepted.

- `listProfiles`: requires exactly five approved public display projections,
  with Zod validation and subject binding; missing/malformed or ambiguous data
  fails closed. Unshared names/sections remain redacted in `server.ts`.
- `readGrant`: reads only active non-revoked SharingGrant rows for exactly one
  OIDC actor + subject; verifies allowed sections, expiry, actor/subject and
  version before any section-specific API projection is returned.
- `readSnapshot`: reads only current, size-bounded Zod `DemoSnapshot` JSON
  (not raw course/Forms data); rejects another subject, future `asOf` and
  internally inconsistent feed/notices timing. Fastify still rechecks sharing
  grants, actor/session and version on every context fetch.
- `readSafePacket`: fetches only curator-approved, unexpired, non-revoked
  `SYNTHETIC_CLEARED` records for the actor/task/reference pair. Real NCP
  provider inputs remain disabled until separate rights/worker approval.
- `modules/auth/sharing-grant-postgres.ts`: privileged **operator-only**
  ShareGrant issuance/revocation; an independently injected consent authority
  must approve each operation. Display-name and recording visibility require
  separately verified consent references. Grant issuance uses insert-only
  `ON CONFLICT DO NOTHING`, revocation uses version CAS with `RETURNING`.
  Both operations atomically write an append-only audit event; SQL failure
  rolls the entire transaction back.

`infra/sql/20261031_api_projections.sql` is a **review-only migration** for
display projections, scoped grants, synthetic packet storage and audit events,
with PUBLIC access revoked. Do not import raw CSV, Forms, identity-alias
mapping or student source documents into these tables. The migration/role
grants, actual DB transport, consent administration and parallel transaction
tests have **not** been executed. All tests use fake SQL connections and
synthetic fixture data.

Run locally:

```sh
npm run check
npx vitest run tests/api/repository-postgres.test.ts tests/api/sharing-grant-postgres.test.ts tests/api/pg-api-integration.test.ts
npm run build:api
npm run check:privacy
```

The current `main.ts` intentionally injects `closedRepository` and refuses
production startup. PR #32 OIDC and PR #33/#34 evidence features are
**separate** review gates. Nothing here turns on Google, external NCP requests
or an unaudited student-data upload.

## 미구현·병합 후속

1. 구현된 OAuth 교환·학교 메일 OTP·베타 승인·Postgres 어댑터를 **실제 운영 런타임**에 안전하게 연결하고, 관리자 허용 명단·실제 SMTP 발송 승인·OAuth 비밀관리·IP/전역 발송 차단·실 PostgreSQL 다중 인스턴스·브라우저 로그인을 E2E 검증한다. 현재 합성 환경 전용이며 외부 배포는 차단한다.
2. PostgreSQL 저장/거래·공유 철회·동시성 검증 및 UI와 온전한 API E2E. 지금 MemoryApiRepository는 영속 데이터베이스가 아닙니다.
3. 추천 #15·공지 #16과 [계약 #44](https://github.com/ot4562-glitch/HUFS-One-AI/pull/44)의 `NoticeResult.items[].overdue` 실제 출력은 **main 병합 완료**입니다. 신뢰형 출처 코어 #40, 부분공유 원천 입력 #49, 캘린더 계산 #50도 코어로 병합됐으나 진짜 BETA 입력 출처 권한·SharingGrant API 소비는 미연결입니다. 설명 Wire [#47](https://github.com/ot4562-glitch/HUFS-One-AI/pull/47)과 카드 직렬화 코어 [#41](https://github.com/ot4562-glitch/HUFS-One-AI/pull/41)은 검토·CI 뒤 **main 병합했지만** 실제 React 렌더링/권한 있는 API 소비 검증은 따로 남았습니다. 합성 코드 통과만으로 실제 실학생 데이터·운영 API 연결을 허용하지 않습니다.
4. 이 PR의 LocalTemporalEvidenceIndex는 설계형 로컬 계산 모듈일 뿐 Postgres/RAG API/이미지 OCR이 아닙니다. 공통계약 #18, 수집 #19, OCR/Vision #20, Temporal RAG #21에 따라 별도 구현합니다.
5. 실제 NCP·Laya·CLOVA/OCR 비용은 #22에서 승인·실측 전까지 사용하지 않습니다. 실제 개인정보와 외부 공식 포스터 사용권한도 별도 확인합니다.

참고: docs/WORKSTREAMS.md의 이슈 assignee 기반 담당 계정, Architecture.md A02/A06/A13/A14, docs/TRUSTED_RAG_MEDIA_VERSIONING.md. 기술 총괄 최종 병합 이전에는 다른 팀원이 main에서 API가 실행된다고 전제하지 않아야 합니다.

## 신규 REVIEWER 초대·기간제 권한 API (PR #24 + #30 병합, PR #31 확장, 미배포)

- `POST /api/reviewer/invitations/redeem` — OIDC trusted `role=REVIEWER` / verifiedEmail/identityProofExpiresAt가 유효한 세션 + CSRF/Origin + 43자 초대 코드로 이메일·Google sub에 등록. 같은 인증 주체가 등록 코드를 재시도해도 멱등 성공하지만 다른 sub/email은 403. 등록 시도 5회/15분, 합성 자동 테스트 전용 메모리 구현.
- `GET /api/reviewer/demo/profiles` — 합성 전용 독립 demo source의 5개 슬롯, `dataMode=SYNTHETIC`만 허용.
- `GET /api/reviewer/demo/subjects/:id/snapshot` — 공유 없는 실데이터 접근 차단, 개별 synthetic snapshot과 카드 데이터 모드 재검증. `PENDING`/실제/혼합/유료-live는 403.
- 매 요청 `ReviewerAccessStore.readActive`로 `startsAt <= now < endsAt`, 이메일/sub 바인딩·철회 검사. 만료된 세션도 403; 반복 방문 횟수 제한 없음. REVIEWER는 기존 `/api/demo` 조회·컨텍스트 및 `/api/ai` 네 작업에 **오직 SyntheticSnapshot/Packet으로만** 접근하며 팀원 실제 데이터·NCP Provider 호출 불허.
- `PostgresReviewerAccessStore` 트랜잭션+DDL `infra/sql/20261031_reviewer_invitations.sql`을 준비했으나 실제 DB pool/Google verifier/개별 이메일 발송은 미구현. 운영 전 데이터 영속성·리브래시·rate-limit 보안 테스트가 추가로 필요하다.
- PDF 초대장 **비활성 양식**: `reference/reviewer/ReviewerInvitation.TEMPLATE.pdf`. 실제 공용 초대 코드는 본선 선정·운영 승인 이후 비공개 발급해야 함. 정본 [docs/REVIEWER_ACCESS.md](../../docs/REVIEWER_ACCESS.md).

### 운영용 심사자 초대 CLI (실 DB 연결 및 승인 전 **실행 금지**)

- `npm run admin:reviewer -- issue`: PostgreSQL 저장과 공용 링크의 비공개 JSON 생성. `REVIEWER_DATABASE_URL`, `REVIEWER_ORIGIN`(HTTPS), `REVIEWER_MAX_ACCOUNTS`, `REVIEWER_START_UTC`, `REVIEWER_END_UTC`, `REVIEWER_LABEL`, `REVIEWER_OPERATOR_APPROVED=yes` 필요. 원격 DB는 검증된 TLS. 실제 코드/이메일·DB URL을 로그에 찍지 않는다.
- `python3 reference/reviewer/export_invitation_template.py --private-json local_only/reviewer_invitations/<uuid>.json`: 활성 초대장을 **로컬만** PDF로 출력. 자료 비공개/메일 개인 발송.
- `npm run admin:reviewer -- revoke`: `REVIEWER_INVITE_ID`를 사용해 기한 전 revoke. DB 행은 즉시 철회되며 서버 다음 요청이 거부해야 한다.
- 이 기능은 **독립 서버 인증/DB 연결이 완료되기 전에는 실행하지 않는다**. 사용 가능한 PDF와 템플릿을 혼동하지 않는다.

## AI 비용 원장 (#20/#88, 실제 호출 미연결)

`modules/ai/budget-postgres.ts`와 검토용 `infra/sql/20261103_ai_budget.sql`은 전역 phase·actor별 비용/시도 한도를 PostgreSQL에서 원자적으로 예약합니다. 단위는 정수 micro-KRW(1 KRW=1,000,000 units)이며 단가를 추정하지 않습니다. trusted quote/tokenizer가 payload·model·prompt/schema·source/permission/consent 판본을 포함한 request SHA와 각 시도 worst-case 비용을 계산해야 합니다. `task`는 과금 provider operation(`OCR_GENERAL`, `HCX_005`, `HCX_007`)이며 제품 AI task·모든 판본은 request SHA에 결속해야 합니다.

- phase 기본값 **enabled=false, 모든 한도0**. operator만 기간·전역/actor 비용·시도 한도를 준비합니다. 코드 import/배포로 migration 적용·활성화하지 않습니다.
- 독립 migration 검토 뒤 신뢰된 BYPASSRLS 소유자가 함수를 소유해야 합니다. runtime 역할은 schema USAGE와 `ai_budget_reserve(text,text,text,text,bigint)`, `ai_budget_transition(text,uuid,text,text,bigint,text)` EXECUTE만 받고, 세 테이블 SELECT/DML/configuration은 주지 않습니다. FORCE RLS·PUBLIC 권한 회수·함수의 고정 search_path/명시적 actor 검사가 유지돼야 합니다.
- 인증된 server actor를 transaction-local로 결속합니다. 브라우저의 actor/비용/receipt는 신뢰하지 않습니다. `reserve().changed=true`는 새 예약만 뜻하며 **송신 허가는 별도 DISPATCHED transition의 changed=true**에서 한 번만 얻습니다. 응답/commit 손실은 재전송 허가가 아닙니다.
- RESERVED(아직 전송 안 됨)만 RELEASED로 비용/시도 예약을 한 번 반환합니다. DISPATCHED 이후 timeout/crash/취소는 UNKNOWN_BILLING 또는 미정산 DISPATCHED로 남아 계속 예산을 점유하며 자동 환급/재시도하지 않습니다. 실제 검증된 사용량/과금 영수증의 SHA와 비용이 있어야 SETTLED로 정산합니다. 같은 영수증·비용 재정산은 중복 차감하지 않습니다.
- 실제 과금이 예약보다 크면 **실제 비용을 그대로 기록하고 phase를 OFF**로 바꿉니다. 예약/정책 상한은 10^12 units, 실제 건별 영수증은 JS safe integer 범위까지 별도로 받고 DB 누적액은 numeric(30,0)으로 보존합니다. 이미 송신된 요청은 OFF/만료 뒤에도 정산할 수 있습니다. 금액을 예약 상한에 맞춰 숨기지 않습니다. 미정산 예약은 자동 만료하지 않으며 운영 reconciliation이 필요합니다.
- 원장은 권한 승인/사실 검증/가격 계산기나 HTTP transport가 아닙니다. 매 전송 전/응답 후 current source/actor/grant/asOf/동의/철회 검사, 실제 provider usage 검증·tokenizer·bounded HTTP·retry/취소·로그/secret 보호·#88 chaos·#143 worker가 추가로 필요합니다. 현재 제품 HTTP 경로에 연결하지 않았고 유료 호출0입니다.

검증: `vitest run tests/api/ai-budget-postgres.test.ts`(SQL 프로토콜 단위), 기존 opt-in disposable `pg-full-live-opt-in.test.ts`(실 PG의 동시20·idempotency/actor·unknown 정산·취소·OFF/만료·overrun). 실제 PG 성공은 해당 CI HEAD 결과로 따로 확인하며 기본 SKIP을 성공으로 표시하지 않습니다.

## Laya CPU 스파이크로부터 API 보호 (설계, 미구현·미배포)

Laya 워커는 Fastify HTTP handler·REVIEWER GET·일반 데모 요청 경로와 분리한다. 나중에 승인된 ingestion에서만 권한 있는 sourceRevision별 저우선순위 비동기 작업으로 예약. OS cgroup `CPUQuota=100%` (**1vCPU**), 단일 worker, queue 16, ONNX threads=1/spin OFF, `MemoryMax=3072M`로 CPU/메모리 급증을 가둔다. CPU/pressure/API p95/RAM 경계 초과 시 pause/off 및 `UNKNOWN/NEEDS_REVIEW`+규칙 폴백. 실제 queue/worker/systemd/model download/NCP 부하 실측은 **이 PR에서 구현하지 않았다**. 게이트·샘플: [docs/LAYA_CPU_SPIKE_PROTECTION.md](../../docs/LAYA_CPU_SPIKE_PROTECTION.md).

## PR #31: 심사자 전체 메뉴 합성 체험 및 제어 API 계약

- `GET /api/reviewer/capabilities`: 매 요청 active grant 검사 후 REVIEWER가 체험할 학생용 TODAY/OPPORTUNITIES/NOTICES/EXPERIENCE/GRADUATION/COURSE_PLANNER/OUTLOOK/SAVED/APPLICATIONS/SETTINGS 메뉴 목록과 지원 action을 반환한다. 이 manifest는 실제 React 라우터 구현 완료를 보증하지 않는다(`actualBrowserUiVerified:false`).
- 기존 action에 `SET_INTERESTS`(공용 24 TopicCode), `SET_DESIRED_JOBS`, `PLAN_COURSE`, `SET_SEARCH`, `SET_NOTIFICATIONS`, `RESET_SANDBOX` 추가. 오직 synthetic ID/validator를 받고 invite+actor+subject마다 격리. 일반/외부 학생·학교 실자료, 지원 제출, 외부 유료 NCP 호출은 불가.
- `GET /api/auth/session`과 초대 redeem이 `readOnly:false,sandboxOnly:true`를 반환해 합성 수정 허용과 실제 원장 읽기/쓰기를 명확히 구분한다. 인증되지 않은 local main.ts는 여전히 401 전부 차단.
- 루트 `npm run check`는 API/공통 계약/추천 core/웹 UI 합성 테스트 전체를 실행한다. PR #28 UI 상태관리 테스트도 `main`에 병합됐다. 실제 브라우저 Google OAuth/JWKS/PKCE/OTP·PostgreSQL E2E가 없으면 외부 심사자에게 배포하지 않는다.
- [NCP 추천 SKU/공식 비용·기간](../../docs/NCP_OPERATIONS_2026.md), API 담당 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), UI [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), NCP [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12).


## Internal operator PostgreSQL/OIDC acceptance launcher (stacked on #183)

`apps/api/src/operator-postgres-runtime.ts` connects **seven distinct, restricted
PostgreSQL LOGIN roles** through the existing TLS-verified pool factory, verifies
each role/SQL readiness before binding Fastify to `127.0.0.1`, and closes every
pool on startup failure and shutdown. A real Google OIDC code-exchange callback,
independent current evidence rights, protected 32+ byte digest key and role DSNs
must be injected from an **operator-controlled private module**; they are never
generated or committed. No migrations, reviewer admission, paid AI or crawling
are enabled by this launcher.

Plan (no private module, network or SQL):
```bash
node dist/apps/api/src/operator-main.js --plan
```

After independent approvals, an operator can stage an *internal* SQL/OIDC
acceptance on an already approved host by placing a **root-owned,
non-group-writable** `.mjs` adapter under `/etc/hufs-one/private/` that exports
`createOperatorConfig()`. Keep credentials there or in the approved external
secret manager, not in the repository. The operator must explicitly supply
`HUFS_OPERATOR_CONFIG_MODULE`, `HUFS_OPERATOR_MODE=loopback-acceptance`,
`HUFS_OPERATOR_ACK=INTERNAL_ONLY_NOT_RELEASE`, and `HUFS_OPERATOR_LOOPBACK_PORT`
(default 3000), then use `node dist/apps/api/src/operator-main.js --apply`.
The application must remain `NODE_ENV=development`/`APP_ENV=local`
for this restricted acceptance path. **Never use this configuration to expose
traffic publicly or claim a production release.**

`main.ts` and `createIntegratedApi` still **reject production** until the
independent #46/#61/#89 human, live-identity, domain/TLS, revocation, RLS,
NCP and publication gates are accepted in a separate, reviewed release PR.
This branch demonstrates real SQL/OIDC startup wiring but does not claim those
external checks ran. Start/stop tests use synthetic managed-pool doubles;
the parent #183 disposable PostgreSQL integration is separately verified in CI.
