# Fastify API·인증·PostgreSQL·AI 담당 규칙

**심민성 `ot4562-glitch` 소유:** 공통 API/SQL·OIDC·학교메일 OTP/초대/CSRF·owner/REVIEWER/ADMIN, SourceRevision/Temporal RAG·이미지/PDF·OCR/HCX·Laya/예산/worker·보안·CI/배포 코드. [루트 AGENTS](../../AGENTS.md) · [작업 #253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253).

- actor/session/context·SharingGrant·Consent·SourceRights·RulePack/asOf/SourceRevision을 서버·SQL에서 독립 검증한다. 브라우저의 email/`hd`/XFF/자칭 actor/LLM confidence는 권한·학칙/지원 적격·현재 메일 소유의 증거가 아니다.
- SQL 기본 7개 역할 및 확장 role은 최소권한/CA TLS/FORCE RLS/미검증 pool 거부·SECURITY DEFINER 경계를 적용. 현재 adminUsage role/function은 코드 준비 단계이며 실 GRANT/배포 전이다.
- 잘못된 actor·만료/철회/구버전/late response/403·409·429·503·원본 권리 불명 때 영수증·학업/공고 원문/계정 존재·비공유 메타데이터까지 비노출.
- 외부 OCR/HCX/학생 원본/모델 다운로드/NCP 비용 발생은 **#252 실제 권리·비용 승인 전 금지**. 합성/격리 PG/Chrome 및 fake provider 테스트만 수행. Laya OFF, `AI_ENABLED=false`, `RELEASE_BLOCKED`.
- 코드 PR은 현재 HEAD 독립 리뷰/필수 CI/권한·정정·취소 부정시험. 다른 담당자 UI·추천·학업 코어를 허락 없이 대체하지 않음. [API 계약](README.md) · [팀 소유](../../docs/WORKSTREAMS.md).
