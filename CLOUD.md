# HUFS One AI | 도메인·Google 로그인·외대 이메일 검증·클라우드 경계

**2026-11-02 #125 후속 보안 검토 정정:** [동아리 합성 코어 #125](https://github.com/ot4562-glitch/HUFS-One-AI/pull/125)의 미래 수정`updatedAt>asOf`/승인 후 편집된 게시글 노출을 새 HEAD에서 차단하고 최신 타인 APPROVED·Actions 2/2 성공 뒤 **main `8f76c388` 병합**. 코어에서 승인 시간 필드를 검사하는 것은 **독립 서버 관리자 권한 확인/승인 영수증·실제 동아리 게시권한**이 아니다. #123 UI/포스터/관리자 권한 API는 미구현. 이번 main 병합 3건, 열린 PR 7건/Issue 30건. HUFSAbility #124/개인정보 #46 검사 실패/공개 #89 RELEASE_BLOCKED는 여전히 남음. 아래 #125 차단 표기는 구 HEAD 당시 기록.

**2026-11-02 출시 게이트 최신:** [#122](https://github.com/ot4562-glitch/HUFS-One-AI/pull/122) 정정 회귀 및 [#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72) 캘린더 UI가 합성/PG CI·비작성자 승인 후 main `bb5b76d`·`717ce979`로 병합되었으나 실 운영을 허가하지 않는다. [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) 기존 HUFSAbility 원래 메뉴 수용·미지원 🚫, [#123](https://github.com/ot4562-glitch/HUFS-One-AI/issues/123) 합성 동아리 게시판/AI 포스터는 **학교 공식 SSO/브랜드·실동아리·에브리타임 원문·클라우드 업로드와 무관한 데모 제안**. [#125](https://github.com/ot4562-glitch/HUFS-One-AI/pull/125) 과거 시점 미래 `updatedAt` 게시물 노출 문제 미수정/미병합. 개인정보 #46 Private 전체 153/155 PASS·2 FAIL/보호 추적 6경로, 학교·학생 자료 이용권/동의/운영 Google OIDC/NCP/TLS 미검증. **#89 RELEASE_BLOCKED 유지.**

**2026-11-01 당시 보안/출시 경계:** [#118](https://github.com/ot4562-glitch/HUFS-One-AI/pull/118) 결과 캐시의 권한 정책 버전 키는 비작성자 승인·CI 성공 후 main merge `fdf0b09b`로 구현했다. 이는 실제 소스 권리 resolver·학생 동의 철회/다중 브라우저·운영 인증/클라우드 보증이 아니다. [#117](https://github.com/ot4562-glitch/HUFS-One-AI/pull/117)은 추천 설명 오판 수정 대기, [#120](https://github.com/ot4562-glitch/HUFS-One-AI/pull/120)→[#121](https://github.com/ot4562-glitch/HUFS-One-AI/pull/121)은 독립 승인 및 실제 source/rights/RulePack provider 부재로 미병합. #46 전체 Privacy 검사 153/155 PASS·2 FAIL, #89 `RELEASE_BLOCKED` 유지.

**2026-11-01 출시 게이트 재확인:** main의 #83 서버 인증·원자 PG·합성 REVIEWER 및 #89 관련 오프라인 검사 구현은 실제 인터넷 NCP/Google/TLS 가동 증거가 아니다. 신규 UI #72~#76은 현재 HEAD 리뷰 5건만 완료·병합 0건(#72/#75 변경 요청/CI 미확인). [#46 개인정보 검사](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)는 전체 Private checkout에서 153/155 PASS·2 FAIL이고 [#89 출시](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)는 `RELEASE_BLOCKED`; 운영 자료·기관 허가·예산 승인 전 개통·AI 호출·공개 이전 금지. [STATUS.md](STATUS.md).


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
