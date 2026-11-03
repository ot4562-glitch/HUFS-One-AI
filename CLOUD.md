# HUFS One AI | 도메인·Google 로그인·외대 이메일 검증·클라우드 경계

> **NCP 합성 SSH 미리보기 실행서:** [NCP 설치·접속·네트워크·PuTTY/WinSCP](infra/ncp/README.md) 및 [운영 인수인계 양식](infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md). 이 문서는 [Draft #156](https://github.com/ot4562-glitch/HUFS-One-AI/pull/156)의 검토용이며 실제 개통·공개·유료 호출·운영 배포는 **NOT_RUN / RELEASE_BLOCKED**입니다.

<!-- 2026-11-03-owner-boundary:start -->
> **2026-11-03 운영/코드 소유 확정:** **이서연 `lhh42001`은 NCP 계정·크레딧·VPC·서버/스토리지·서비스 entitlement/키·IAM/TLS·비용/호스트 실측·중단/반납만 담당하며 SDK·worker·코드·스크립트/CI/IaC 구현을 하지 않는다**([#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)·[#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22)). **심민성 `ot4562-glitch`은 일반 API뿐 아니라 NCP General OCR·HCX Vision/Studio provider SDK/HTTP·bbox·비용/권한 hard gate·Laya ONNX worker/cgroup·OS/CI/배포 자동화 코드 전부 담당**([#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20)·[#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)·[#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)). **비밀·학생 원본·유료 자원·운영 공개는 사용자 명시 승인/기관 권리·#46/#89 전 미실행**. 아래의 과거 PR/이슈 수치·역할은 작성 당시 기록이며, 최신 검증 결과는 [STATUS](STATUS.md)·[TEAM_PROGRESS](docs/TEAM_PROGRESS.md) 우선.
<!-- 2026-11-03-owner-boundary:end -->

**2026-11-03 현재 코드/운영 경계:** [#145 General OCR·HCX 오프라인 wire](https://github.com/ot4562-glitch/HUFS-One-AI/pull/145) `cade7c9b`와 [#148 AI 원자 예산 원장](https://github.com/ot4562-glitch/HUFS-One-AI/pull/148) `e102516`은 각각 비작성자 승인·합성/일회용 PG/Chrome CI 뒤 **main 병합**됐습니다. [#150 provider 전송/권한 재검증·Laya worker/배포 템플릿](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150)은 **Draft/충돌/독립 승인 0건, 미병합**이며 실 NCP·model inference·운영 실행은 하지 않았습니다. [#131 설정 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/131) 역시 main `6efc532`의 **합성/역할 안전 코드**일 뿐 실 Google/실자료/유료 NCP 승인 아님. **#46 privacy 2 FAIL·#89 RELEASE_BLOCKED** 유지. 이서연의 계정/크레딧/호스트 **비코드 운영**과 심민성의 모든 SDK/worker/CI/IaC 코드 책임은 위 최신 역할 경계가 우선합니다. 이전 날짜별 감사/당시 OPEN PR 수치는 [Git 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/CLOUD.md)에 보존되어 있습니다.

**NCP 새 운영 정본:** [NCP_OPERATIONS_2026.md](docs/NCP_OPERATIONS_2026.md) — 2026-11-06~12-09(816h 예산 상한), 실제 본선 발표 11/16 및 크레딧·사용자 승인 이후 개통. 한국 VPC Linux High Memory-g3 4vCPU/32GB 326원/h + 50GB CB SSD 8원/h(선택 공인 IP 5.6원/h); 816h 서버+CB 272,544원, IP 포함 277,113.6원(VAT 등 제외).

기술 계약 정본: [Architecture.md](Architecture.md) A02·A13·A14.1a·A15·A18. 아래는 **예정 아키텍처**로, DNS·Google OAuth·NCP가 설정/배포됐다는 뜻이 아니다.

## 공개 주소와 접근 제한

- 사용자 확보 신고 접속 주소: `https://외대.온라인.한국`. 실제 DNS/TLS/연결 검증은 미완료.
- 공개 인터넷 주소를 쓰되 **비로그인 사용자는 서비스 React HTML/JS·API·이미지·파일에 접근하지 못한다.** 최소 로그인 안내·인증 왕복만 허용한다.
- 학교의 **공식 SSO/IdP 연동 허가를 기대하지 않는다.** 학교 인증 시스템과 연계하지 않고 **Google OAuth 로그인 + 현재 외대 이메일 수신권 확인 + 베타 초대 allowlist**를 별도로 구현한다.
- 학교가 운영/보증하는 공식 서비스가 아니며 GitHub 저장소는 Private 유지. `example@hufs.ac.kr`은 외대 이메일 **형식 예시**다.

## Google 로그인과 외대 이메일 검증

```text
인터넷 → 외대.온라인.한국 HTTPS → 인증 전 기본 거부
  → Google OAuth/OIDC authorization-code + PKCE (제안)
  → 서버 검증: 서명/JWKS·iss·aud·exp·nonce·state·sub
  → 외대 메일 현재 수신권:
       A. Google Workspace 소속이 확인될 때만 token의 hd=hufs.ac.kr
          + email_verified=true + 정확한 @hufs.ac.kr 이메일 검증
       B. 그 외(개인 Gmail 포함) 실제 @hufs.ac.kr 메일함으로 OTP 발송·검증
  → 승인된 베타 actor allowlist + 역할
  → 권한 있는 React / same-origin Fastify → owner/SharingGrant 검사
  → 비공개 PostgreSQL + 승인된 요청만 CLOVA worker
```

Google 토큰의 `email_verified` 또는 요청의 `hd` 힌트 단독으로 **외대 메일 현재 소유 여부를 판단하지 않는다**. `hd`가 없는 비Gmail 외부 이메일은 Google이 현재 메일함의 소유자를 보증하지 않는다. 인증되지 않은 개인 Google 계정만으로 사용 불가. 학교가 실제로 Google Workspace를 쓰는지 미확정이며, 그렇지 않으면 **OTP 이메일 전달 경로가 필수**다. 학교 메일 소유 증명은 재학생 신분 인증과 다르다. 계정별 승인과 수시 권한 철회를 유지한다.

메일 OTP는 10분·1회·서버 해시·시도/재발송 제한을 제안한다. 학교 메일 주소·Google `sub`·세션에 결속하며 주기/이상 로그인 시 재검증한다. Google OAuth client/consent screen과 OTP 발송자 설정은 별도 이용 조건·비용 검토 대상. 학교 비밀번호는 절대로 받지 않는다.

## 배포 보안과 개인정보

- 로그인 시작/Google callback/검증된 Google 세션의 OTP 경로와 비민감 오류 안내 이외 경로는 **edge + API에서 기본 거부**. 직접 origin IP·staging·preview·CDN/Object Storage·다른 포트·WebSocket/SSE·관리자/API 문서도 점검.
- TLS, Secure/HttpOnly/SameSite/host-only 쿠키, CSRF/Origin, Google `sub` 식별, rate limit, session/SharingGrant 철회. 개인 응답 `Cache-Control: no-store`; 정적 앱·서비스워커/공용 캐시·로그에 원본 넣지 않음.
- 실제 과목/Forms 입력자는 최대4명이며 시연 선택 슬롯은5개. **외대 메일 소유 증명과 베타 로그인 자체는 NCP 업로드·CLOVA 전송·타 팀원 데이터 공유 동의가 아니다.** [자료 정책](docs/DATA_GOVERNANCE.md) 우선.
- 제품 CLOVA는 네 작업만, 서버 비밀키·원자적 예산 상한·kill switch. 클라우드 개통·유료 서비스·실자료 이전은 별도 승인 대상.

## 개통 전 필수 부정시험

Google ID token 위조/만료, Gmail 단독, `hd` 요청값 변조, 외대 이메일 미소유, OTP 만료/재사용/다른 Google `sub` 가로채기, 미초대 actor, 동의 철회, 익명 HTML·API·저장소·직접 IP·preview·캐시·로그아웃 후 접근을 모두 막는지 검증한다. DNS/TLS·Google OAuth·OTP 메일 발송·인가·부정 E2E 중 하나라도 미검증/실패면 **인터넷 서비스 배포 BLOCKED**다. 학교 **공식 SSO 허가 부재만으로는 차단하지 않는다**.

검증 근거: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect) · [Google 서버 로그인 검증](https://developers.google.com/identity/sign-in/web/backend-auth).

## 2026-10-31 High Memory-g3·Laya·OCR/Vision·Temporal RAG 설계 (미구현)

- **NCP 단일 VPC 서버(본선 선정·크레딧·사용자 승인 후):** KR Linux High Memory-g3 4 vCPU/32GB 326원/h + CB SSD 50GB 8원/h(공인 IP 필요 시 5.6원/h). 11/6~12/9 예산 상한 816h 서버+CB **272,544원**, IP 포함 **277,113.6원**(VAT/egress/OCR/HCX/backup 제외). 11/16 본선 발표일~12/9 상한 576h 서버+CB **192,384원**, IP 포함 **195,609.6원**. 실제 유료 개통 11/16보다 빠르다고 간주하지 않음. [공식 단가·계산·작업표](docs/NCP_OPERATIONS_2026.md).
- **Laya:** Apache-2.0 `laya-multilingual` 322M, ONNX FP32 CPU pinned revision, 워커 1개·최대 RSS 3GiB 가설. peak/지연/한국어 분류 성능 검증 실패면 `LAYA_ENABLED=false`로 폴백. 실제 weight 다운로드/프로세스 가동은 별도 승인.
- **이미지:** General OCR을 허용된 새 이미지/변경 이미지에 1차 실행. 좌표·원본 해시 보존 후 필요한 경우에만 HCX-005 Vision 후보 호출, HCX-007은 허용 근거 텍스트 구조화. 인증·자료권한을 우회하거나 학생 raw를 AI로 전송하지 않음.
- **시간 기반 RAG:** 동일 NCP 서버 PostgreSQL의 승인 문서 revision·인용좌표·적용기간/`asOf` 선필터 + 경량 lexical 검색, 변경/취소 시 검색 인덱스·검증캐시 무효화. 별도 vector DB는 검증 후 opt-in.
- **크레딧:** 공식 공모전 안내 본선 10팀의 50만원 상당 NCP 크레딧은 발급·SKU·VAT·사용기간 미확인. 816h 전체 상한의 VM+CB+IP+예상 VAT 약 305,000원, HCX 80,000원, OCR 20,000원, 네트워크/백업 25,000원, 예비비 70,000원 계획(총 500,000원). 크레딧이 세금·전 상품에 적용된다고 전제하지 않으며 개통·과금은 승인 전 금지.
- **릴리스:** `AI_ENABLED`, `MEDIA_INGEST_ENABLED`, `VISION_ENABLED`, `RAG_ENABLED`, `LAYA_ENABLED` 기본 false; 예산 미설정/권한 실패/자료 stale/모델 장애는 fail closed. 상세 게이트: [docs/TRUSTED_RAG_MEDIA_VERSIONING.md](docs/TRUSTED_RAG_MEDIA_VERSIONING.md).

## 심사자 기간제 REVIEWER 접근: 별도 VM 없이 (계획)

심사자도 기존 한 서버·독립 HTTPS origin에서 로그인하되, 학교 공식 SSO/IdP를 사용한 척하지 않고 Google OIDC + 이메일 proof + 영속 REVIEWER 초대 원장으로 인가한다. 새 VM/유료 서비스 자동 생성은 필요하지 않다. SHA-256 digest만 PostgreSQL `reviewer_invitations`에 보관, `endsAt` 종료/철회는 매 요청 권한 검사(별도 Cron/JS 타이머 없이 403)로 적용. reviewer synthetic repository/route는 팀원·실학생 DB/AI API와 분리. 외부 IP/preview/CDN/static 번들, 키/메일·DB 계정·HTTPS 설정과 E2E가 모두 준비되기 전 **실제 외부 접속 불가**. 새 설계: [docs/REVIEWER_ACCESS.md](docs/REVIEWER_ACCESS.md).

## Laya CPU 스파이크·High Memory-g3 보호 계약 (2026-10-31)

NCP 단일 4vCPU·32GB에서 API/DB를 우선 보호한다. Laya는 `LAYA_ENABLED=false`가 기본이며 별도 cgroup `CPUQuota=100%`(**1vCPU 상한**, 4vCPU 전체 CPU 시간의 25%), ORT 단일스레드/spin OFF, MemoryMax 3072M, queue≤16/worker=1. API p95/CPU pressure/RAM 악화 시 PAUSE/OFF하고 확정 코드로 폴백. 실제 High Memory-g3 부하 실측 전 모델 실행 금지. [CPU 방어](docs/LAYA_CPU_SPIKE_PROTECTION.md).
