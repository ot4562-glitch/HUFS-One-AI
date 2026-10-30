# 인증·API

- 주 소유자: GPT 트랙. Architecture.md A02~03,A06,A13~14와 docs/WORKSTREAMS.md 참조.
- Actor와 demoSubject 권한, Snapshot, API, 사용량·DB. UI 소스와 계약 변경은 통합 담당에 요청.
- 다른 담당 경로는 읽기/리뷰만 가능하며 사전 합의 없는 동시 편집은 금지. **2026-10-31 기술 총괄의 명시 요청으로 로컬 API 코드 작업만 허용**. 실제 Google OIDC·외대메일 OTP/Workspace 증명·NCP·CLOVA/OCR/Vision 과금 및 서비스 배포는 별도 승인 전 차단한다.
- 엔드포인트는 검증된 server-side session adapter가 없으면 401; 신분·email·hd·actor 헤더를 직접 믿지 않는다. 합성 MemoryRepository/AI provider injection은 자동화 테스트에서만 사용하고, 실제 출시 전 DB·다중 인스턴스 세션 철회·CSRF·인증·권한 E2E를 완성한다. [README](README.md) 확인.
