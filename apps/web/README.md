# apps/web (UI · 이의상)

React 19 + Vite 8. 의존성은 루트 `package.json`(#63/#66)에 있습니다.

| 명령 | 용도 |
|---|---|
| `npx vite --config apps/web/vite.config.ts --mode synthetic` | **합성 모의 연결**로 화면 개발 (네트워크·학생 자료 없음, 화면 상단에 항상 표시). 127.0.0.1에서만 동작 |
| `npm run dev:web` | 실제 로컬 API(`npm run start:api:local`, 127.0.0.1:3000)에 `/api` 프록시 |
| `npm run build:web` | `dist/web` 빌드 (합성 클라이언트는 빌드에 쓰이지 않음) |
| `npm run test:web` | 화면 테스트 (`*.test.tsx`는 jsdom) |

합성 모드에서 S04는 일부러 `SHARING_REVOKED`(403)를 돌려줘 철회 화면을 확인할 수 있습니다.

구조: `shell/`(레이아웃·라우팅·선택기·상태 문구) · `pages/`(탭별 화면) · `features/`(순수 화면 모델) · `design/`(A11.2 토큰) · `app/`, `integrations/`(통합 담당 연동 코드, 수정은 조율).
