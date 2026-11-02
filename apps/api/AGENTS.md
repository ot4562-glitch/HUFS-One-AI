# API·권한·AI 공급자 코드

**2026-11-03 사용자 확정 담당: 심민성 `ot4562-glitch`.** [루트 AGENTS](../../AGENTS.md), [WORKSTREAMS](../../docs/WORKSTREAMS.md), [#20 OCR/HCX 코드](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [#88 fake provider chaos](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88), [#143 Laya worker](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143).

- **심민성 소유 코드:** Fastify 인증/Google OIDC·세션·CSRF/actor·SharingGrant·일반 PostgreSQL/SourceRevision/Temporal RAG, provider-neutral DTO뿐 아니라 **CLOVA OCR/HCX SDK/HTTP adapter·bbox·리트라이·원자적 비용 예약/하드 차단·권한/버전/출처 검증·worker/queue·테스트·CI/배포 자동화도 모두 포함**. 브라우저 UI·추천·학업 팀의 핵심 로직을 임의 대체하지 않음.
- **이서연 `lhh42001`의 NCP 운영은 #12/#22로 분리:** 실제 계정·entitlement·endpoint/quota·키 관리 권한·VPC/호스트/요금·성능 영수증(비코드)만 제공. NCP provider/worker 코딩 담당이 아니다.
- 검증된 server-side 세션이 없으면 401. 임의 `email`, `hd`, actor 헤더, 브라우저 주장, LLM confidence를 권한·학칙·지원 자격의 최종 사실로 믿지 않는다. `UNKNOWN/NEEDS_REVIEW`·403/409·폐기 revision·철회·취소를 fail-closed 유지.
- 합성 REVIEWER/빈 계정·`/api/reviewer/capabilities`·actions는 실제 학생·학교 로그인/공개 배포와 구별한다. 테스트는 fake provider/합성/일회용 PG. 승인 전 실제 NCP 키·유료 모델·학생 raw를 열람/전송/PR/CI에 넣지 않음.
- 코드 PR은 최신 HEAD 비작성자 리뷰·합성/PG/Chrome CI·권한/정정 회귀를 거치고, 실제 환경 개통은 사용자 별도 승인 + #46/#89 게이트 후. [운영 문서](../../docs/NCP_OPERATIONS_2026.md).
