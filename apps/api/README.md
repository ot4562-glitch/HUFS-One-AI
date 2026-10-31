# HUFS One AI API — 로컬 합성 구현 (2026-10-31)


심민성 담당 Fastify 합성 API는 `main`에 반영됐다. Google OAuth·외대 메일 증빙·영속 DB 연결은 별도 출시 검증 대상이며, NCP·CLOVA·OCR/Vision 제공자 연동은 이서연 트랙에서 담당한다.

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

## Laya CPU 스파이크로부터 API 보호 (설계, 미구현·미배포)

Laya 워커는 Fastify HTTP handler·REVIEWER GET·일반 데모 요청 경로와 분리한다. 나중에 승인된 ingestion에서만 권한 있는 sourceRevision별 저우선순위 비동기 작업으로 예약. OS cgroup `CPUQuota=100%` (**1vCPU**), 단일 worker, queue 16, ONNX threads=1/spin OFF, `MemoryMax=3072M`로 CPU/메모리 급증을 가둔다. CPU/pressure/API p95/RAM 경계 초과 시 pause/off 및 `UNKNOWN/NEEDS_REVIEW`+규칙 폴백. 실제 queue/worker/systemd/model download/NCP 부하 실측은 **이 PR에서 구현하지 않았다**. 게이트·샘플: [docs/LAYA_CPU_SPIKE_PROTECTION.md](../../docs/LAYA_CPU_SPIKE_PROTECTION.md).

## PR #31: 심사자 전체 메뉴 합성 체험 및 제어 API 계약

- `GET /api/reviewer/capabilities`: 매 요청 active grant 검사 후 REVIEWER가 체험할 학생용 TODAY/OPPORTUNITIES/NOTICES/EXPERIENCE/GRADUATION/COURSE_PLANNER/OUTLOOK/SAVED/APPLICATIONS/SETTINGS 메뉴 목록과 지원 action을 반환한다. 이 manifest는 실제 React 라우터 구현 완료를 보증하지 않는다(`actualBrowserUiVerified:false`).
- 기존 action에 `SET_INTERESTS`(공용 24 TopicCode), `SET_DESIRED_JOBS`, `PLAN_COURSE`, `SET_SEARCH`, `SET_NOTIFICATIONS`, `RESET_SANDBOX` 추가. 오직 synthetic ID/validator를 받고 invite+actor+subject마다 격리. 일반/외부 학생·학교 실자료, 지원 제출, 외부 유료 NCP 호출은 불가.
- `GET /api/auth/session`과 초대 redeem이 `readOnly:false,sandboxOnly:true`를 반환해 합성 수정 허용과 실제 원장 읽기/쓰기를 명확히 구분한다. 인증되지 않은 local main.ts는 여전히 401 전부 차단.
- 루트 `npm run check`는 API/공통 계약/추천 core/웹 UI 합성 테스트 전체를 실행한다. PR #28 UI 상태관리 테스트도 `main`에 병합됐다. 실제 브라우저 Google OAuth/JWKS/PKCE/OTP·PostgreSQL E2E가 없으면 외부 심사자에게 배포하지 않는다.
- [NCP 추천 SKU/공식 비용·기간](../../docs/NCP_OPERATIONS_2026.md), API 담당 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), UI [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), NCP [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12).
