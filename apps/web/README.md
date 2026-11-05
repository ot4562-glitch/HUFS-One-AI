# HUFS One AI — React 웹

**현재 웹:** 독립 제품 네이비/블루 v5 디자인, 1024px 이상 상단 **8개 주요 화면**, 모바일 하단 **5탭**, `HUFSAbility 메뉴` disclosure에 기존 24개 기능의 **미지원** 표시, 홈 장식 배너·맞춤 공고/7일 내 확정 마감/취득 학점 요약 및 페이지별 breadcrumb/h1. 학교 공식 운영 화면이나 원본 UI 복제물이 아닙니다.

## 주요 화면

| 경로 | 기능 | 자료/승인 경계 |
| --- | --- | --- |
| `/`·`/opportunities`·`/notices` | 가상 5슬롯 개인화·추천/출처·D-day/정정·공지/달력 | 합성/허가된 projection과 source asOf만 |
| `/experience`·`/saved`·`/applications` | 경험 DRAFT/승인·북마크·행동·지원 초안 | 실제 지원 접수/승인 결과가 아님 |
| `/graduation`·하위 What-if | 취득/진행/계획·복수전공 가정·RulePack/미개설 불확실성 | 공식 학칙/학생 원본 검증 전 보수적 UNKNOWN |
| `/clubs`·합성 ADMIN | 가상 모집글/이미지, 승인·수정·철회 | 실동아리/학교 게시 권한 없음 |
| `/demo-profile`·REVIEWER | 독립 빈 계정·합성 심사자·RESET·세션 격리 | 실제 4인 자료/유료 AI 접근 차단 |

기존 HUFSAbility 메뉴 5분류·24기능은 **시연 불가 텍스트**, 공개 4영역은 공식 사이트 링크다. `/menu`에 전체 목록, `/settings`에 개인 설정을 둔다. 본 서비스가 학교 공식 서비스를 대체했다고 설명하지 않는다.

## 개발·검증

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run dev:web -- --mode synthetic
npm run test:web
npm run build:web
npm run test:e2e:web
```

합성 API는 별도 터미널의 `npm run start:api:synthetic-accounts` 사용. 독립 빈 계정/가상 ADMIN은 `npm run start:api:synthetic-empty-demo`와 웹 `--mode empty-demo`를 **서로 다른 모드**로 실행. 브라우저 응답/캐시는 현재 actor·grant/context/epoch·asOf가 맞을 때만 렌더하고, 401/403/409/503·철회/다중탭/late response에서 개인 카드/URL·이미지를 비운다.

Chrome/Playwright·jsdom/단위·360/390/768/1440 viewport/키보드 검사와 **실제 별도 스크린리더/실기기 사람 검증**은 구분한다. UI의 미확인 기능을 자동으로 활성화하지 않는다.

**현재 상태** [STATUS](../../STATUS.md) · **화면 정보구조** [UI_MENU_COVERAGE](../../docs/UI_MENU_COVERAGE.md) · **실기기 인수** [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252) · **웹 담당** [#9](https://github.com/minseong-hufs/HUFS-One-AI/issues/9)/[#119](https://github.com/minseong-hufs/HUFS-One-AI/issues/119).
