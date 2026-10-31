# HUFS One AI API — 로컬 합성 구현 (2026-10-31)

이서연의 담당 API 영역을 기술 총괄 요청으로 로컬에서 대신 구현한 첫 단계입니다. **Google OAuth·외대 메일 인증, NCP·CLOVA·OCR·Vision 실제 호출, 실학생 데이터/DB 연동, 배포는 전부 미실행**입니다. 구현/테스트 결과를 실서비스 준비 완료로 표현하지 않습니다.

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
