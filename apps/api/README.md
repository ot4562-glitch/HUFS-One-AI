# HUFS One AI — Fastify API·PostgreSQL·권한/AI

**현재 구현:** TypeScript/Fastify·Zod 계약과 여러 PostgreSQL role/영속 SQL 어댑터, Owner/REVIEWER/ADMIN·합성 계정, 승인 SourceRevision/Temporal RAG·이미지/PDF 근거·AI 4작업/예산 API가 `main`에 존재합니다. **production 조립·실 Google/학교메일·운영 PG TLS/RLS·NCP/유료 Provider·실원본은 미승인**입니다. `APP_ENV=production` 기동 거부·미검증 SQL 포트 거부, `AI_ENABLED=false`, Laya OFF 및 `RELEASE_BLOCKED`를 유지합니다.

현재 상태 [STATUS](../../STATUS.md) · 개발 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253) · 실인수 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).

## 계층과 책임

```text
Fastify server / integrated composition
  ├─ verified actor/session/CSRF/Google OIDC & school-email OTP ports
  ├─ current SharingGrant / SourceRights / Consent / request-asOf
  ├─ owner, workspace, academic, plan/What-if, experience, saved/actions
  ├─ reviewer synthetic invite + separate ADMIN authority
  ├─ SourceRevision / review / temporal + bounded IMAGE/PDF evidence
  ├─ approval-gated OCR/HCX 4-task result and atomic budget
  └─ PostgreSQL TLS/FORCE RLS, independent least-privilege roles
```

UI·동일 사용자의 다른 브라우저/탭이 보낸 raw actor/email/`hd`/XFF는 인증되지 않은 신뢰 정보다. 실제 서버 세션의 actor와 현재 목적별 consent/grant/원본 rights/version을 **DB I/O 전후/비동기 응답 직전** 확인해야 한다. 다른 subject·철회/구버전·미인가 SQL pool의 데이터/메타데이터는 403/404/409/503 또는 공통 보류·비노출로 응답한다.

## 주요 현재 API 종류

경로의 **실제 등록 수·DTO·코드·소비자 테스트 정본은** [`tools/api_contract_inventory.json`](../../tools/api_contract_inventory.json) 및 [`audit_api_contracts.mjs`](../../tools/audit_api_contracts.mjs)이다. 설계 문서에 존재해도 실제 등록되지 않은 경로를 노출 가능하다고 쓰지 않는다.

| 영역 | 현재 주요 엔드포인트·포트 | 핵심 거부 조건 |
| --- | --- | --- |
| Auth | `/api/auth/session`, Google start/callback, 외대메일 OTP·logout, reviewer invite | OIDC/PKCE/JWKS·메일 소유·역할·CSRF·만료/철회 |
| Demo/owner | `/api/demo/contexts`/snapshot/calendar/overlay/reset, `/api/demo/profiles`, 개인 profile·consents | actor/session/subject/grant/version/asOf·rate quota |
| Academic | transcript/courses/offerings/What-if/major·study plans | owner/RulePack·해당 학년도·추정/확정 분리 |
| Personal | experience cards/approval, saved/bookmark, application drafts/action plan | 현재 owner+expectedVersion·승인 변경 원자 무효화 |
| Source | 승인 수집 job·source revisions/media evidence·source review/retrieval | collect/store/display/AI transmit 각각 허용·불변 SHA·시점/검수·revocation |
| AI | 4 task job/상태·provider results·budget/receipt | safe packet·인용 exact match·취소/늦은 예약·불명확 과금 |
| ADMIN | `GET /api/admin/usage`, synthetic preflight/club moderation | 검증된 독립 admin authority, SQL role·공유/원본 정보 비노출 |

**설계 직접 미매핑 9경로:** 기존 비밀번호 로그인 `POST /api/auth/login`은 retired. `/api/academics/import/preview|apply`는 **private operator 명령** 경계이며 공개 HTTP API가 아니다. 나머지 demo-context experiences/saved/actions, plans/simulate, outlook/scenarios, corpus approve 등은 실제 대체/미구현/보안상 제외 판정 후에만 변경. 상세 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253).

## 보안·데이터

- Google OIDC/PKCE code exchange의 `iss/aud/exp/nonce/state/JWKS/sub` 서버 검증, 학생 외대메일 **현재 소유** 증명, beta allowlist·CSRF/Origin·HttpOnly/Secure host-only 쿠키. 학교 공식 SSO로 오인 금지.
- BETA·REVIEWER·ADMIN 별도 role/초대/기간·비밀, 5가상 학생/EMPTY/실원본 4명 namespace 분리. 원본·공고·학사·AI 고급 조회는 권한 없는 section까지 파싱·반출하지 않음. **권한 축소·늦은 응답·다중탭**에서 이전 학생 정보가 다시 나와서는 안 된다.
- PostgreSQL 기본 7-role 및 선택 확장 role의 별도 pool/DSN/CA TLS/role verification·FORCE RLS·`SECURITY DEFINER search_path` 경계. 가짜 준비 포트와 미검증 raw SQL pool은 **startup/prepare에서 거부**하고 무단 SQL 소켓 열지 않는다.
- `GET /api/admin/usage`는 권한 recheck·read-only aggregation/정확한 금액 문자열·metric coverage `NOT_COLLECTED`; 별도 `adminUsage` SQL 역할과 `ai_budget_admin_usage()` migration은 **실DB 미적용·미GRANT**. 토큰/오류의 관측값을 0으로 위조하지 않는다.
- 401/403/409/422/429/503은 사용자 상태에 맞게 분리하고 다른 사용자/스냅샷·SQL/Provider 원문·토큰/키를 error/log/headers에 넣지 않는다.
- 실학업 CSV/Forms는 승인된 `/etc/hufs-one/private/` **private intake factory**의 `plan→preview→apply`와 영수증/원자 4-owner CAS로만 처리. 현재 실원본 실행 NOT_RUN.

## SourceRevision·Evidence·AI

- 수집: 허용된 HTTPS source URL·필드/권리·DNS/IP pin/redirect/content bound·동시 global lease·원본/paragraph SHA·304 observation·리비전·취소/재시도·권한 전후 검사.
- 이미지: PNG/JPEG·bounded PDF 원본/페이지 raster/OCR bbox·원문 SHA/좌표/asOf·reviewer 별도 권한·temporal retrieval. PDF v1 형식/크기/지원 범위는 [runtime](../../infra/ai/PDF_RUNTIME.md).
- AI: `experience_skills`, `opportunity_terms`, `personal_action_brief`, `graduation_explanation`는 권리·actor/asOf·SafeLlmPacket의 정확한 허용 출처만. 추론 문장·숫자/마감·공식 학칙을 확정 결과로 사용하지 않음. budget RESERVED→DISPATCHED→SETTLED/UNKNOWN_BILLING·중복/취소/late-result 안전 폴백.
- 외부 OCR/HCX/모델 다운로드/Laya ON·학생 원본 외부 전송은 별도 권리·비용/운영/비작성자 품질 승인 전 **비활성**.

## 개발과 테스트

지원 Node.js `^22.22.2 || ^24.15.0`. 실제 운영 DB를 테스트용으로 초기화하지 않는다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:api
npm run typecheck
npm run test:api
npm run audit:api-contracts
npm run audit:entrypoints
npm run check:privacy
```

격리 disposable PostgreSQL/Chrome의 실제 실행·SKIP 상태는 해당 CI job/실행 log로만 확인한다. 로컬 합성 API는 `npm run start:api:synthetic-accounts` 또는 별도로 `npm run start:api:synthetic-empty-demo`; 서로 다른 목적/권한 가드를 혼합하지 않는다. 실제 운영 entrypoint를 간단한 환경변수 전환으로 열지 않는다.

**기술 계약:** [Architecture](../../Architecture.md), [공통 contracts](../../packages/contracts/README.md), [RAG/미디어](../../docs/TRUSTED_RAG_MEDIA_VERSIONING.md), [REVIEWER](../../docs/REVIEWER_ACCESS.md), [데이터 거버넌스](../../docs/DATA_GOVERNANCE.md).
