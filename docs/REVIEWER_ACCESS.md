# HUFS One AI — 외부 심사자 초대·기간제 접근 계약

> 2026-10-31 · 기술 설계 및 API **로컬/합성 구현**. 아직 학교 심사자에게 실제 이메일·링크를 발송하거나 Google OIDC·실사이트·NCP를 개통하지 않았다. 설계 기준은 `Architecture.md` A02/A14와 이 문서, 구현은 `apps/api/src/modules/auth/reviewer*.ts`.

## 결정

**심사자는 5명 개발 팀원에 포함되지 않으며 학생 프로필 S01~S05를 추가하거나 실제 학생 파일을 열람하지 않는다.** 별도 서버 role `REVIEWER`로 **합성 시연 자료만** 읽을 수 있다. PDF 초대장은 보안을 우회하는 통행증이 아니다. **인증 완료 + 이메일/Google sub 결속 + 초대장 등록 + 유효기간 재검사**가 모두 필요하다.

| 항목 | 결정 |
|---|---|
| 접속 자격 | 기술 총괄이 지정한 **심사 담당자 이메일 한 개당 초대장 한 개**를 원칙으로 함 |
| 로그인 | Google OIDC Authorization Code+PKCE, 서버의 JWKS/iss/aud/nonce/state 검증, Google `sub` 고정; `email_verified`와 최신 이메일 소유증거가 있는 계정만 사용(제3자 도메인은 별도 OTP 권장) |
| 초대 | 암호학적 난수 **32바이트 / 43자 base64url**, PostgreSQL에는 **SHA-256 digest만** 저장. PDF와 개별 발송 링크에 원문 초대 코드를 넣되 **Git·CI·로그에는 절대 게시하지 않음** |
| 초대 URL | `https://외대.온라인.한국/reviewer/invite#code=...` 형식 **예정**, 브라우저의 Fragment를 POST body로 전달하고 URL 기록/history에서 제거. query string, Referer, analytics, 서버 접근로그로 코드 전송 금지 |
| 첫 사용 | 신뢰된 Google/메일 identity proof → 정확히 같은 **초대 수신 이메일** 검사 → 최초 `sub`·등록시각을 서버 기록. 이미 다른 `sub`에 등록된 초대는 새 사용자에게 거부 |
| 반복 접속 | **유효기간 중 페이지 열람·재로그인 횟수 제한 없음**. 같은 계정의 여러 세션에서 이용 가능. 초대 등록은 한 번, 초대 코드 재입력은 **같은 계정일 때만** 멱등 허용 |
| 접근시간 | `startsAt <= now < endsAt` **서버 UTC 기준**, 화면은 Asia/Seoul KST 명시; 설계 최대 기간 45일, 정확한 평가 시작/종료 일시는 행사 담당자 확인 뒤 발급 |
| 기간 종료 | 추가 타이머/cron에 의존하지 않고 **매 HTTP 요청마다** DB에서 초대 상태 재확인. 종료시각이 지난 세션의 GET/POST는 즉시 403. 서버/캐시 재시작 후에도 DB가 정본 |
| 권한 철회 | 운영 담당자만 DB의 `revokedAt` 설정. 기존 세션도 다음 요청부터 403; 재발급 시 새 코드·새 DB 행 |
| 범위 | `GET /api/reviewer/demo/profiles`, `GET /api/reviewer/demo/subjects/:id/snapshot` 등 **별도 리뷰 전용 route**, 문서화된 read-only UI. 모든 개별 응답은 `datasetMode=SYNTHETIC` 및 공고 카드 dataMode 검증 |
| 불허 | 학생 원장, 동의/공유 변경, 관리자 화면, 일반 `/api/demo`·`/api/ai`, 실제 HCX/OCR 유료 호출, 제출/삭제/원본 export, 원본 Forms·과목 CSV·성적 |
| 반복/과금 | **횟수 제한 없는 열람**은 인증 코드 무제한 추측/AI 유료 호출 허용이 아님. 등록 시도는 기본 **5회/15분/actor**; 실서비스에서는 DB/공유 rate limiter+IP 이상징후 차단 추가. 읽기 트래픽도 DDoS 보호·합리적인 API resource budget 적용 |

## 단계별 브라우저 시나리오 (프런트 구현은 별도 UI PR)

1. 승인된 심사자가 **본인 이메일로 발송된 개인 PDF 초대장**을 받고 링크를 연다. 링크는 한 번 등록 후 재접속에 다시 필요하지 않다.
2. Google OIDC 로그인 후 `sub` 및 실제 이메일 소유 증거를 서버가 검증한다. 심사자로 자가 가입하거나 `role=REVIEWER` 요청 필드를 보내는 방식은 금지.
3. 브라우저 `/reviewer/invite#code=...`의 코드는 **DOM 메모리에서만** 추출하고, 주소 표시줄 fragment를 즉시 지운 뒤 정확한 `Origin`·CSRF와 함께 `POST /api/reviewer/invitations/redeem`로 1회 제출한다. 초대 코드 자체는 session cookie가 아니다.
4. 서버는 `reviewer_invitations` 행을 `SELECT...FOR UPDATE` 트랜잭션으로 검사해 처음 쓰는 Google `sub`를 결속한다. 코드가 틀리거나 수신 이메일/기간이 불일치하면 **동일한 403**만 반환하여 수신 대상 유무를 노출하지 않는다.
5. 합성 전용 홈에서 S01~S05 슬롯을 볼 수 있다. `PENDING` 슬롯을 실제 프로필로 위장하지 않는다. 시연 화면에는 **SYNTHETIC/REPLAY 및 모델 MOCK 여부**를 눈에 띄게 표시한다. 실제 학생자료/타인 consent를 기반으로 이 화면을 채우지 않는다.
6. 동일 심사자는 해당 기간 동안 브라우저를 닫고 로그인해도 재등록 없이 계속 조회한다. 모든 API 호출에 현재 초대 DB 행을 조회해 계정·수신 이메일·철회·유효기간을 확인한다.
7. `endsAt`에 도달하면 화면에서 만료 안내를 표시하고 새 API 요청은 403을 반환한다. 기존 표시 내용도 지우도록 UI 처리하며 Service Worker·CDN·브라우저 캐시 재생을 금지한다(`Cache-Control: no-store`).

## 현재 구현과 아직 없는 연결

| 항목 | 범위 |
|---|---|
| **코드 구현** | `VerifiedReviewerActor`·권한 allowlist·Zod 검증, `issueReviewerInvitation`(32바이트), digest, `MemoryReviewerAccessStore`(합성 테스트 전용), `PostgresReviewerAccessStore`(트랜잭션/row lock), SQL migration·안전한 중단/철회, reviewer 전용 read-only endpoints |
| **자동 검증** | 재접속 70회, 새 세션, 다른 이메일/계정으로 코드 재사용, CSRF, 기간 직전/직후, revoke, 혼합/실제 자료 차단, 임의 `/api/demo`·AI 호출 거부, 코드 추측 429, mock PostgreSQL 트랜잭션 |
| **남은 필수** | 실제 Google OAuth/OTP 인증 adapter, 합성 demo snapshot **5슬롯 콘텐츠**, PostgreSQL 구성·DB migration 권한/실트랜잭션 E2E, 리뷰어 UI `/reviewer/invite`·KST 만료화면, 실제 초대장 채우기·이메일 개별 발송, 운영 domain/TLS/프리뷰·직접IP 보호, 분산 rate limiter, 민감정보/브라우저 캐시 보안 E2E |
| **미사용** | NCP·학교 IdP/SSO·학생 실자료·유료 CLOVA·Laya·OCR·Vision·발표 공개 전환 |

## 초대 발행·운영 프로세스

**실제 기간과 이메일을 모르는 상태에서 활성 초대장을 만들어 GitHub에 올리지 않는다.** 제공한 PDF는 **비활성 서식**만 포함한다.

- 기술 총괄이 심사자 이메일, UTC 시작/종료시각, 내부 승인 및 실제 사이트 인증/DB 준비를 확인한다.
- 권한 있는 운영 스크립트가 `issueReviewerInvitation(store,{recipientEmail,startsAt,endsAt,label},{now})`를 호출한다. 초대 코드는 **그 호출에서만 반환**하고 저장소에는 digest만 저장한다. 발급 실패 시 코드/PDF를 보내지 않는다.
- 운영자가 개인 초대장 PDF에 접속 링크·이메일·KST 기간을 **비공개로 주입**해 해당 심사 담당자에게만 보낸다. 심사 담당자 이메일 목록을 public issues/CI/기본 logs에 넣지 않는다. 수신자 수가 여러 명이면 계정마다 별도 초대장을 생성한다.
- 발급·등록·접속 실패율은 개인자료/코드 없이 최소 메타데이터만 감사, 유출·오발송이면 즉시 revoke하고 새 초대장 발급.
- 평가 종료는 UI 타이머가 아닌 **서버에서 자동으로 종료**. 별도 관리자 확인 없이 접속이 차단되지만 DB 보관/파기는 별도 retention 정책을 따른다.

## 테스트/병합 게이트

- 익명 → 401, 미등록 reviewer → 403, 미일치/철회/기간 외 → 403, 반복 인증된 열람 → 200, 등록 오입력 과다 → 429.
- REVIEWER가 BETA/ADMIN으로 승격하거나 **실데이터 API·유료 AI 호출·민감 storage**에 접근하는 경로 0.
- SQL migration에서 `email+sub` 바인딩의 원자성·경쟁 요청·DB 장애 시 fail closed, 서버 재시작·동시 사용자·시각/시차, 실제 로그인 E2E, 샘플 초대장 PDF 발행/회수 시험.
- 기존 팀원 5명·S01~S05 슬롯과 UI/추천·학업 계약을 깨지 않으며 [API PR #24](https://github.com/ot4562-glitch/HUFS-One-AI/pull/24)의 CI와 부정시험을 이어받는다. `REVIEWER` 공통 계약 승격은 심민성/각 소비자 리뷰 및 별도 version 관리 뒤 진행.
- 본 구현은 **API PR #24에 의존한 독립 stacked PR**이며 API가 main에 병합되기 전에는 이 PR도 단독 main 병합하지 않는다. 실제 계정/이메일/DB/도메인을 연결할 수 없다는 사실을 완료라고 주장하지 않는다.

## 실제 초대장 발급 도구 (운영 승인 이후, 코드 포함)

**전제:** 실 도메인·HTTPS·OIDC/메일 수신권 인증·DB migration/접속 보안이 먼저 완성되어야 한다. 아래는 **발급 도구 사용법**이며, 이 PR에서 실제 계정·DB/학교 담당자에게 실행한 것은 아니다. 등록 링크를 GitHub 이슈나 배포 CI 값에 넣지 않는다.

1. 승인받은 PostgreSQL에 `infra/sql/20261031_reviewer_invitations.sql`을 적용하고, 제한된 API/운영 DB 역할과 TLS를 설정한다.
2. 비공개 운영자 실행 환경에 `REVIEWER_DATABASE_URL`(원격이면 `sslmode=verify-full`/CA 검증), `REVIEWER_ORIGIN`(HTTPS 정확 origin), `REVIEWER_RECIPIENT_EMAIL`, `REVIEWER_START_UTC`, `REVIEWER_END_UTC`, `REVIEWER_LABEL`, `REVIEWER_OPERATOR_APPROVED=yes`를 설정한다. 비밀값/개인정보를 셸 히스토리·CI/스크린샷에 남기지 않는다.
3. 저장소 루트에서 `npm run admin:reviewer -- issue`를 실행한다. 서버 DB에는 digest·기간·이메일만 저장되고, **원문 링크는 `local_only/reviewer_invitations/<uuid>.json` 1개에만** 남는다. 파일 접근권한/클라우드 자동 동기화를 별도 점검한다.
4. `python3 reference/reviewer/export_invitation_template.py --private-json local_only/reviewer_invitations/<uuid>.json`를 실행하면 **같은 private 폴더**에 개인별 `.pdf`가 생성된다. 이 PDF만 해당 이메일 수신자에게 보내고, 제출/공개용에는 `reference/reviewer/ReviewerInvitation.TEMPLATE.pdf`만 사용한다.
5. 심사기간 만료 전 긴급 정지는 `REVIEWER_INVITE_ID=<uuid>`·운영 승인 설정 후 `npm run admin:reviewer -- revoke`로 실행한다. 다음 요청부터 DB 확인 결과로 403 차단한다.

**운영 주의:** 실제 링크 발송·관리자 지급·이메일 리스트 확보는 별도 승인. PostgreSQL pool 연결/외부 OIDC 검증·브라우저 등록 페이지 미구현 상태에서는 발급만 해도 서비스에 접속할 수 없다. 실연동 E2E까지 확인한 뒤 심사 기간을 정한다.

## Laya CPU 보호와 반복 심사 열람

심사자는 기간 중 무제한 **읽기 전용** 재접속이 가능하지만 **CPU·Laya·CLOVA 호출량 무제한을 뜻하지 않는다.** `REVIEWER` API 요청은 별도 합성 저장소의 검증된 replay/캐시만 읽고 Laya worker·warm-up·동기 OCR·HCX API 호출 및 신규 인제스트 작업을 만들지 않는다. 따라서 심사자 70회 연속 조회로 Laya 새 작업 **0건**이 되도록 실제 UI/API E2E를 검증한다. CPU 스파이크 대응은 [LAYA_CPU_SPIKE_PROTECTION.md](LAYA_CPU_SPIKE_PROTECTION.md); 모델 설치/실측 전 `LAYA_ENABLED=false` 유지.
