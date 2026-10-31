# 인증·API

> **2026-10-31 확정 최신 배정·운영:** API/인증/DB/AI검증/수집/RAG/테스트 코드는 **심민성 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)**, NCP/CLOVA/OCR/Vision/Laya **Provider 구현·운영 환경 전체**은 **이서연 [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)**만 준비. 이의상(UI #9), 김채윤(추천 #10), 박준영(학업 #11) 책임 불변. 공용 초대장 REVIEWER는 합성 전체 시연 기능을 평가 기간 동안 사용하며 실제 학생·유료 작업은 금지. NCP Standard-g3 4vCPU·16GB + 별도 CB 50GB, 공식 본선 발표 11/16 이후 조건부 개통. 제안서 정본은 Proposal.md(제안서 PDF/출력기 폐기).


- 주 소유자: **심민성** (웹·외부 HTTP API, 인증·일반 데이터 조회/권한·provider-neutral DTO 검증). **NCP/CLOVA/HCX/OCR/Vision/Laya Provider SDK/worker/비용·클라우드는 이서연** 전담. Architecture.md A02~03,A06,A13~14와 docs/WORKSTREAMS.md 참조.
- Actor와 demoSubject 권한, Snapshot, API, 사용량·DB. UI 소스와 계약 변경은 통합 담당에 요청.
- 다른 담당 경로는 읽기/리뷰만 가능하며 사전 합의 없는 동시 편집은 금지. **2026-10-31 기술 총괄의 명시 요청으로 로컬 API 코드 작업만 허용**. 실제 Google OIDC·외대메일 OTP/Workspace 증명·NCP·CLOVA/OCR/Vision 과금 및 서비스 배포는 별도 승인 전 차단한다.
- 엔드포인트는 검증된 server-side session adapter가 없으면 401; 신분·email·hd·actor 헤더를 직접 믿지 않는다. 합성 MemoryRepository/AI provider injection은 자동화 테스트에서만 사용하고, 실제 출시 전 DB·다중 인스턴스 세션 철회·CSRF·인증·권한 E2E를 완성한다. [README](README.md) 확인.
