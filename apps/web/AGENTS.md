# UI/모바일

- 주 소유자: Claude 트랙. Architecture.md A02,A05,A10~11와 docs/WORKSTREAMS.md 참조.
- 5명 전환 아코디언, 모바일 피드, 접근성·로딩·오류. 공용 타입/API/DB는 변경하지 않는다.
- 다른 담당 경로는 읽기/리뷰만 가능하며 사전 합의 없는 동시 편집은 금지. 이번 PR은 구현코드를 작성하지 않는다.

## 공용 REVIEWER 웹 화면 작업 (#9 / #28)

이의상 UI 담당 소유는 유지. 심사자 전용 `/reviewer/invite` (Google OIDC → fragment 코드 메모리 추출 및 URL 즉시 제거 → CSRF 등록)부터 기존 모든 학생 화면(TODAY/OPPORTUNITIES/NOTICES/EXPERIENCE/GRADUATION/COURSE_PLANNER/OUTLOOK/SAVED/APPLICATIONS/SETTINGS)과 synthetic account-scoped 설정·즐겨찾기·체크리스트·가상신청까지 실제 라우터/접근성/모바일을 연결해야 한다. API의 `GET /api/reviewer/capabilities` 및 합성 actions가 요구 계약이다. 401/403/409·invite 만료·철회 시 cache/화면 즉시 삭제, 타 tab/actor 응답 섞임 0, 실학생 data/API provider calls 0을 브라우저 E2E로 입증하기 전 공개 금지. 기존 #28은 reducer 테스트이지 실제 React 사이트 완료가 아니다.

[리뷰어 계약](../../docs/REVIEWER_ACCESS.md) · [NCP 운영 정본](../../docs/NCP_OPERATIONS_2026.md).
