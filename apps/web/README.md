# apps/web (UI · 이의상)

## 2026-11-02 동아리 core main 병합 이후 UI 인수인계

- [x] [#125](https://github.com/ot4562-glitch/HUFS-One-AI/pull/125) 순수 가상 동아리 추천·승인 시점 안전 코어가 HEAD `8e88a4b` 타인 APPROVED+Actions 2/2 성공 후 **main `8f76c388` 병합**. 12개 가상 승인 글, 10분야, 5개 합성 학생, 포스터 `SYN-POSTER-CLUB-*` **ID만** 있음.
- [ ] [#123](https://github.com/ot4562-glitch/HUFS-One-AI/issues/123) 게시판 목록·필터·상세/실제 AI 생성된 창작 합성 포스터·모바일 접근성·현재 서버 승인/권한 API **웹 코드 없음**. 코드가 있다고 가상 포스터가 생성되거나 실제 동아리 글을 게시한 것은 아님.
- [ ] [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) HUFSAbility 기존 5대 메뉴·24하위 항목과 **🚫 미지원 UX**는 별도 UI PR 필요. #73 초대 비동기 lifecycle race CHANGES_REQUESTED/후속 #74/#75 승인·스택 대기; Playwright E2E 미병합. 아래 #125 수정 요청 표기는 이전 리뷰 이력.

## 2026-11-02 UI 현재 수락/다음 구현

- [x] [PR #72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72) 오늘 하단 2주 미니 캘린더·실 비합성 `liveServices(api)`/권한 GET·snapshot 교체 즉시 소거: **main `717ce979` 병합**(현재 HEAD 비작성자 승인/Actions 2/2 SUCCESS). 개발 synthetic 포트도 S01/S02 개인별 합성 달력 사용.
- [ ] [PR #73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73) REVIEWER 초대의 성공 `getSession`가 unmount/StrictMode cleanup 뒤 `READY`를 만들 수 있어 CHANGES_REQUESTED. 해당 PR base를 main으로 변경. #74 졸업·#75 sandbox는 현 HEAD APPROVED지만 #73 선행 병합/재검증 필요.
- [ ] [PR #76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76)의 Playwright 1.64.1/Edge 브라우저 E2E는 아직 **미병합**: `npm run test:e2e:web`를 현재 main의 사용 가능한 명령이라고 안내하지 않는다. 합성/PG Actions 성공은 독립 실제 브라우저 실행이 아님.
- [ ] [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) HUFSAbility 기존 5분류·24기능 메뉴/4개 공개 영역 전면 배치+미구현 🚫 UX, [#123](https://github.com/ot4562-glitch/HUFS-One-AI/issues/123) AI 합성 동아리 포스터·모집판/추천 UI는 아직 미구현. 동아리 #125 순수 코어도 수정 요청 중.
- 실제 Google/학교 SSO·기관 권리·운영 배포는 승인하지 않았으며 #46/#89 `RELEASE_BLOCKED` 유지.

React 19 + Vite 8. 의존성은 루트 `package.json`(#63/#66)에 있습니다.

| 명령 | 용도 |
|---|---|
| `npx vite --config apps/web/vite.config.ts --mode synthetic` | **합성 모의 연결**로 화면 개발 (네트워크·학생 자료 없음, 화면 상단에 항상 표시). 127.0.0.1에서만 동작 |
| `npm run dev:web` | 실제 로컬 API(`npm run start:api:local`, 127.0.0.1:3000)에 `/api` 프록시 |
| `npm run build:web` | `dist/web` 빌드 (합성 클라이언트는 빌드에 쓰이지 않음) |
| `npm run test:web` | 화면 테스트 (`*.test.tsx`는 jsdom) |

합성 모드에서 S04는 일부러 `SHARING_REVOKED`(403)를 돌려줘 철회 화면을 확인할 수 있습니다.

구조: `shell/`(레이아웃·라우팅·선택기·상태 문구) · `pages/`(탭별 화면) · `features/`(순수 화면 모델) · `design/`(A11.2 토큰) · `app/`, `integrations/`(통합 담당 연동 코드, 수정은 조율).
