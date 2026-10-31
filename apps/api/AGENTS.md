# 인증·API


- 주 소유자: **심민성** (웹·외부 HTTP API, 인증·일반 데이터 조회/권한·provider-neutral DTO 검증). **NCP/CLOVA/HCX/OCR/Vision/Laya Provider SDK/worker/비용·클라우드는 이서연** 전담. Architecture.md A02~03,A06,A13~14와 docs/WORKSTREAMS.md 참조.
- Actor와 demoSubject 권한, Snapshot, API, 사용량·DB. UI 소스와 계약 변경은 통합 담당에 요청.
- 다른 담당 경로는 읽기/리뷰만 가능하며 사전 합의 없는 동시 편집은 금지. 심민성은 웹/외부 REST API·인증·일반 DB·provider-neutral 계약을 담당한다. 실제 Google OIDC·외대메일 OTP/Workspace 증명·NCP·CLOVA/OCR/Vision 과금 및 서비스 배포는 별도 승인 전 차단한다.
- 엔드포인트는 검증된 server-side session adapter가 없으면 401; 신분·email·hd·actor 헤더를 직접 믿지 않는다. 합성 MemoryRepository/AI provider injection은 자동화 테스트에서만 사용하고, 실제 출시 전 DB·다중 인스턴스 세션 철회·CSRF·인증·권한 E2E를 완성한다. [README](README.md) 확인.

## REVIEWER 합성 전체 기능 계약 (PR #31)

서버는 합성 전용 `GET /api/reviewer/capabilities`로 학생용 전체 메뉴 목록을 노출하고, `GET/POST /api/reviewer/demo/contexts/:id/actions`에 SET_INTERESTS/SET_DESIRED_JOBS/PLAN_COURSE/SET_SEARCH/SET_NOTIFICATIONS/RESET_SANDBOX를 기존 합성 bookmark/경험/가상지원과 함께 제한한다. `readOnly:false,sandboxOnly:true`는 합성 샌드박스 내 수정만 허용한다. 웹 OAuth/DB/브라우저 E2E가 구현되기 전에는 공개 심사에 사용하지 않는다. NCP/HCX/OCR/Laya SDK·프로비저닝은 이서연 담당; 일반 REST API 및 인증은 심민성.

[운영 비용 정본](../../docs/NCP_OPERATIONS_2026.md).
