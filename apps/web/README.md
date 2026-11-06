# HUFS One AI — React 웹

**현재 웹:** 독립 제품 네이비/블루 v5 디자인, 1024px 이상 **11개 대분류 GNB + 실제 화면 LNB**, 모바일 하단 **5탭**, `HUFSAbility 메뉴` disclosure에 기존 24개 기능의 **미지원** 표시, 홈 장식 배너·맞춤 공고/7일 내 확정 마감/취득 학점 요약 및 페이지별 breadcrumb/h1. 상단 계정 인사는 현재 합성 개발/미리보기에서는 가상 선택기를 옮겨 놓은 것이며 **실제 팀원 학교 계정 로그인 기능이 아닙니다**. 공개 Pages 접근 제어와 인증된 실제 BETA 전환은 #297/#299 후속 과제입니다. 학교 공식 운영 화면이나 원본 UI 복제물이 아닙니다.

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

**현재 상태** [STATUS](../../STATUS.md) · **화면 정보구조** [UI_MENU_COVERAGE](../../docs/UI_MENU_COVERAGE.md) · **실기기 인수** [#252](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252) · **웹 담당** [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)/[#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119).


## 인터랙티브 디자인 ([병합 PR #307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307), 2026-11-06)

- 홈에는 **현재 공개된 화면 정보만** 요약하는 3단계 액션 선택 패널을 배치했습니다. 버튼으로 활동을 전환해 다음 화면으로 이동할 수 있습니다. 미공유 값은 숫자 0으로 표시하지 않습니다.
- 공고 목록에는 **검색·확정 7일 내 마감/조건 충족/자격 확인 필터·마감 순 정렬·조건 초기화**를 추가했습니다. 서버가 내려준 현재 사용자/시연 대상의 허용된 목록만 탐색하며, 자격/관련도/마감을 재판정하지 않습니다.
- 버튼·카드·홈 배너에는 절제된 hover/진입/스크롤 전환을 사용합니다. reduced-motion 설정에서는 움직임을 억제하며, 버튼은 키보드로 조작할 수 있습니다. 외부 스크립트·이미지·유료 템플릿은 추가하지 않았습니다.
- 참고 관찰: [Motion 예제](https://motion.dev/examples)(전환/호버), [Motion 접근성](https://motion.dev/docs/react-accessibility)(움직임 축소), [Oversight Sections](https://supply.madebyoversight.com/sections)(구획의 시각적 위계). 코드는 새로 작성했으며 템플릿 소스를 복사하지 않았습니다. 실기기·스크린리더 인수는 별도입니다.

**범위 주의:** 이 검색은 이미 서버/합성 클라이언트에서 승인해 현재 페이지에 표시한 공고에만 적용합니다. `hasMore`인 전체 데이터는 검색하지 않습니다. `7일 내 마감`은 현재 시스템 날짜 실시간 조회가 아니라 **snapshot `asOf` 기준**입니다. 날짜 기준 안내/전체 화면 사람 검수는 [#298](https://github.com/ot4562-glitch/HUFS-One-AI/issues/298), 실제 로그인/실기기 인수는 [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280)에서 계속합니다. 정확한 PR HEAD `ba7bf2a` Actions 4/4 SUCCESS, merge `d8e2144`; 이는 독립 사람 승인이나 출시 허가가 아닙니다.
