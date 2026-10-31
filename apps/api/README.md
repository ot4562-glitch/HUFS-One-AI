# HUFS One AI API — 로컬 합성 구현 (2026-10-31)

> **2026-10-31 확정 최신 배정·운영:** API/인증/DB/AI검증/수집/RAG/테스트 코드는 **심민성 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)**, NCP/CLOVA/OCR/Vision/Laya **Provider 구현·운영 환경 전체**은 **이서연 [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)**만 준비. 이의상(UI #9), 김채윤(추천 #10), 박준영(학업 #11) 책임 불변. 공용 초대장 REVIEWER는 합성 전체 시연 기능을 평가 기간 동안 사용하며 실제 학생·유료 작업은 금지. NCP High Memory-g3 4vCPU·32GB + 별도 CB 50GB, 공식 본선 발표 11/16 이후 조건부 개통. 제안서 정본은 Proposal.md(제안서 PDF/출력기 폐기).


심민성 소유 API 영역을 기술 총괄이 직접 구현한 첫 단계입니다. **Google OAuth·외대 메일 인증, NCP·CLOVA·OCR·Vision 실제 호출, 실학생 데이터/DB 연동, 배포는 전부 미실행**입니다. 구현/테스트 결과를 실서비스 준비 완료로 표현하지 않습니다.

## 구현한 코드

| 모듈 | 현재 상태 |
|---|---|
| Fastify HTTP API | Zod 입력 및 공통 오류 형태, no-store/보안 헤더, Origin/CSRF 검사 |
| 세션 경계 | 검증된 세션 어댑터 없으면 전 경로 401; 현재 학교 메일 증빙·베타 허용 필요 |
| 시연 목록/컨텍스트 | 5개 슬롯, SharingGrant·actor/session·철회/버전 검증, 원자적 DemoSnapshot |
| AI 경계 | 계약상 네 작업만, 서버가 승인한 SafeLlmPacket reference, 인용문/TopicCode 검사, 가짜 모델 후보는 NEEDS_REVIEW, 중복요청/사용량 상한 |
| LocalTemporalEvidenceIndex | 불변 revision/hash/정정·취소, 권한/검수/게시·수집/적용시각 필터, 한국어 lexical 후보 검색 |
| 테스트 | Fastify inject 합성/부정 테스트. 실제 브라우저·학교 인증·CLOVA/NCP·DB E2E는 아님 |

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

## 미구현·병합 후속

1. 실제 Google OIDC 서명·nonce/PKCE, 학교 메일 수신권 OTP/Workspace hd 확인, 베타 계정 allowlist 및 세션 영속 철회/쿠키. 인증·익명 HTML/API/storage/preview/직접IP 우회 부정시험 전 공개 배포 금지.
2. PostgreSQL 저장/거래·공유 철회·동시성 검증 및 UI와 온전한 API E2E. 지금 MemoryApiRepository는 영속 데이터베이스가 아닙니다.
3. 추천 PR #15 / 공지 PR #16은 기존 CHANGES_REQUESTED 해결·병합 후 공통 API 데이터 생성에 연결합니다.
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

Laya는 Fastify HTTP handler/REVIEWER GET/일반 데모의 동기 의존성이 **아니다**. 나중에 승인된 ingestion에서만 권한 있는 sourceRevision별 저우선순위 비동기 작업으로 예약. OS cgroup `CPUQuota=100%` (**1vCPU**), 단일 worker, queue 16, ONNX threads=1/spin OFF, `MemoryMax=3072M`로 CPU/메모리 급증을 가둔다. CPU/pressure/API p95/RAM 경계 초과 시 pause/off 및 `UNKNOWN/NEEDS_REVIEW`+규칙 폴백. 실제 queue/worker/systemd/model download/NCP 부하 실측은 **이 PR에서 구현하지 않았다**. 게이트·샘플: [docs/LAYA_CPU_SPIKE_PROTECTION.md](../../docs/LAYA_CPU_SPIKE_PROTECTION.md).

## PR #31: 심사자 전체 메뉴 합성 체험 및 제어 API 계약

- `GET /api/reviewer/capabilities`: 매 요청 active grant 검사 후 REVIEWER가 체험할 학생용 TODAY/OPPORTUNITIES/NOTICES/EXPERIENCE/GRADUATION/COURSE_PLANNER/OUTLOOK/SAVED/APPLICATIONS/SETTINGS 메뉴 목록과 지원 action을 반환한다. 이 manifest는 실제 React 라우터 구현 완료를 보증하지 않는다(`actualBrowserUiVerified:false`).
- 기존 action에 `SET_INTERESTS`(공용 24 TopicCode), `SET_DESIRED_JOBS`, `PLAN_COURSE`, `SET_SEARCH`, `SET_NOTIFICATIONS`, `RESET_SANDBOX` 추가. 오직 synthetic ID/validator를 받고 invite+actor+subject마다 격리. 일반/외부 학생·학교 실자료, 지원 제출, 외부 유료 NCP 호출은 불가.
- `GET /api/auth/session`과 초대 redeem이 `readOnly:false,sandboxOnly:true`를 반환해 합성 수정 허용과 실제 원장 읽기/쓰기를 명확히 구분한다. 인증되지 않은 local main.ts는 여전히 401 전부 차단.
- 루트 `npm run check`는 API/공통 계약/추천 core/웹 UI synthetic 테스트 **전체**를 실행하도록 확장; PR #28 UI 코드가 merge되기 전 해당 테스트의 실 실행은 별도 확인 필요. 실제 브라우저 Google OAuth/JWKS/PKCE/OTP·PostgreSQL E2E가 없으면 외부 심사자에게 배포하지 않는다.
- [NCP 추천 SKU/공식 비용·기간](../../docs/NCP_OPERATIONS_2026.md), API 담당 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), UI [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), NCP [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12).
