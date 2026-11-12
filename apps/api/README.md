# HUFS One AI — Fastify API·PostgreSQL·권한/AI

**현재 구현:** `main`에는 TypeScript/Fastify·Zod·다중 PostgreSQL 역할·Owner/REVIEWER/ADMIN 및 SourceRevision/Temporal RAG·이미지/PDF·AI 4작업·예산 API가 있습니다. 소유자 확인 프로젝트 이용/모델/운영 승인은 **`OWNER_CONFIRMED_APPROVED`**입니다. 미병합 [PR #264](https://github.com/ot4562-glitch/HUFS-One-AI/pull/264)에는 별도의 production factory·관리 PG 역할·경험 AI·What-if/사설 컨테이너 조립이 있습니다. 이 승인/코드는 실제 Google/학교메일, PG CA TLS/RLS migration, NCP/유료 Provider, 실학생 원본의 설치·실행·결과를 뜻하지 않습니다. `main.js`의 안전 거부와 production-only `production-main.js --apply`는 명확히 분리하며, 실환경은 `CONFIGURATION_REQUIRED/NOT_RUN/RELEASE_BLOCKED`입니다.

현재 상태 [STATUS](../../STATUS.md) · 개발 [#253](https://github.com/ot4562-glitch/HUFS-One-AI/issues/253) · 실인수 [#252](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252).

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

**설계 직접 미매핑 9경로:** `tools/api_contract_inventory.json` 및 실행 가능한 정적 감사에서 분류 완료. 비밀번호 로그인은 `INTENTIONALLY_RETIRED`, demo 계획 시뮬레이션·전망 시나리오는 `IMPLEMENTATION_REQUIRED`, 경험·보관함·행동 엔드포인트는 실제 권한/DTO가 다른 `ALTERNATIVE_SCOPED_API`, academic import preview/apply 및 corpus approve는 `OPERATOR_PRIVATE`입니다. 관련 API를 설계 URL의 정확한 별칭으로 간주하거나 존재하지 않는 라우트를 구현 완료로 세지 않습니다. [#253](https://github.com/ot4562-glitch/HUFS-One-AI/issues/253).

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
- 외부 OCR/HCX/모델 다운로드/Laya ON·학생 원본 외부 전송의 **프로젝트 승인 상태는 완료 확인**입니다. 실제 사용은 독립 원본 권리·학생별 현재 동의/철회·비용 상한·신뢰할 수 있는 서버 구성 및 실측 검증이 일치할 때만 활성화합니다. 현재 제공자 설정이 없으면 `CONFIGURATION_REQUIRED`, 미실행이면 `NOT_RUN`입니다.

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

**기술 계약:** [Architecture](../../Architecture.md), [공통 contracts](../../packages/contracts/README.md), [RAG/미디어](../../Architecture.md#trusted-rag-media-versioning), [REVIEWER](../../docs/REVIEWER_ACCESS.md), [데이터 거버넌스](../../docs/DATA_GOVERNANCE.md).
