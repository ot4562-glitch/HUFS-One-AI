# HUFS One AI — React 웹

**2026-11-09 현행 웹·업무 정본:** React UI/UX·모바일/접근성·실제 기능/API 화면 배치는 이서연 `lhh42001`([#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357)), 일반 API·DB·보안·NCP 코드·통합·릴리스 검수는 심민성 `ot4562-glitch`([#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359))이 담당합니다. 공식 자료·포스터 이용권·독립 Gold·경량 시연은 김채윤 `qamarrchae`([#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358), [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)), AI 기술 QA·교차검증은 박준영 `taewangim-alt`([#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356))과 이의상 `uisang2004-maker`([#355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355))이 맡습니다. 고정 역할 이슈 #355–#359 자체에는 변경·댓글을 달지 않습니다.

**현재 GitHub:** 2026-11-09 확인 시 기존 PR 17건 병합, OPEN PR 0건, OPEN 이슈 28건. [현재 상태](../../STATUS.md)·[2026-11-09 감사](../../docs/REVIEW_AND_ISSUE_AUDIT_20261109.md)·[팀 역할 정본](../../docs/WORKSTREAMS.md)을 우선합니다. 이전 #317/#318/#321–#325 분장과 #323의 '웹 담당자 NCP 서버 설치 책임'은 **2026-11-07 이전 이력이며 현재 배정이 아닙니다.** 기능/API 코드가 존재해도 공식 학교·실계정/권리·실서버·독립 사람 인수는 `NOT_CONNECTED/NOT_RUN`, 실서비스는 `RELEASE_BLOCKED`입니다.

**현재 웹:** 독립 제품 네이비/블루 v5 디자인, 1024px 이상 **11개 대분류 GNB + 실제 화면 LNB**, 모바일 하단 **5탭**, `HUFSAbility 메뉴` disclosure에 기존 24개 기능의 **미지원** 표시, 홈 장식 배너·맞춤 공고/7일 내 확정 마감/취득 학점 요약 및 페이지별 breadcrumb/h1. 상단 계정 인사는 현재 합성 개발/미리보기에서는 가상 선택기를 옮겨 놓은 것이며 **실제 팀원 학교 계정 로그인 기능이 아닙니다**. 공개 Pages 접근 제어와 인증된 실제 BETA 전환은 #297/#299 후속 과제입니다. 학교 공식 운영 화면이나 원본 UI 복제물이 아닙니다.

## 주요 화면

| 경로 | 기능 | 자료/승인 경계 |
| --- | --- | --- |
| `/`·`/opportunities`·`/notices` | 가상 5슬롯 개인화·추천/출처·D-day/정정·공지/달력 | 합성/허가된 projection과 source asOf만 |
| `/experience`·`/saved`·`/applications` | 경험 DRAFT/승인·북마크·행동·지원 초안 | 실제 지원 접수/승인 결과가 아님 |
| `/graduation`·하위 What-if | 취득/진행/계획·복수전공 가정·RulePack/미개설 불확실성 | 공식 학칙/학생 원본 검증 전 보수적 UNKNOWN |
| `/clubs`·합성 ADMIN | 가상 모집글/이미지, 승인·수정·철회 | 실동아리/학교 게시 권한 없음 |
| `/demo-profile`·REVIEWER | 독립 빈 계정·합성 심사자·RESET·세션 격리 | 실제 4인 자료/유료 AI 접근 차단 |
| `/owner-opportunities/v2-catalog` | #417 인증 BETA 승인 공고 전역 검색·서명 커서(운영 source 의존) | 실원장 미연결, 409/422·429·KST UX 결함 [#418](https://github.com/ot4562-glitch/HUFS-One-AI/issues/418) OPEN |
| `/owner-scholarships`·`/owner-badges` | #420 본인 장학·오픈배지 준비 API/UI | 실제 학교 자격·배지 발급이 아니며 운영 권리/원장 미인수 |
| `/owner-insights/{kind}` | #422 멘토·교외활동 인정준비·NCS·학습·취업통계·국제학생 BETA API/UI | 6개 소비자 코드 병합, 실제 공식 source·Gold·RLS 인수 별도 |

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

**현행 상태** [STATUS](../../STATUS.md) · **화면 정보구조** [UI_MENU_COVERAGE](../../docs/HUFSABILITY_UI_COMPONENT_ATLAS.md#ui-menu-coverage) · **웹 담당** [#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357) · **통합/실원장 인수** [#366](https://github.com/ot4562-glitch/HUFS-One-AI/issues/366) · **공고 UX 버그** [#418](https://github.com/ot4562-glitch/HUFS-One-AI/issues/418). #252/#9/#119는 과거 이력입니다.


## 인터랙티브 디자인 ([병합 PR #307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307), 2026-11-06)

- 홈에는 **현재 공개된 화면 정보만** 요약하는 3단계 액션 선택 패널을 배치했습니다. 버튼으로 활동을 전환해 다음 화면으로 이동할 수 있습니다. 미공유 값은 숫자 0으로 표시하지 않습니다.
- 공고 목록에는 **검색·확정 7일 내 마감/조건 충족/자격 확인 필터·마감 순 정렬·조건 초기화**를 추가했습니다. 서버가 내려준 현재 사용자/시연 대상의 허용된 목록만 탐색하며, 자격/관련도/마감을 재판정하지 않습니다.
- 버튼·카드·홈 배너에는 절제된 hover/진입/스크롤 전환을 사용합니다. reduced-motion 설정에서는 움직임을 억제하며, 버튼은 키보드로 조작할 수 있습니다. 외부 스크립트·이미지·유료 템플릿은 추가하지 않았습니다.
- 참고 관찰: [Motion 예제](https://motion.dev/examples)(전환/호버), [Motion 접근성](https://motion.dev/docs/react-accessibility)(움직임 축소), [Oversight Sections](https://supply.madebyoversight.com/sections)(구획의 시각적 위계). 코드는 새로 작성했으며 템플릿 소스를 복사하지 않았습니다. 실기기·스크린리더 인수는 별도입니다.

**범위 주의:** 이 검색은 이미 서버/합성 클라이언트에서 승인해 현재 페이지에 표시한 공고에만 적용합니다. `hasMore`인 전체 데이터는 검색하지 않습니다. `7일 내 마감`은 현재 시스템 날짜 실시간 조회가 아니라 **snapshot `asOf` 기준**입니다. 당시 #323/#280은 과거 인수 기록입니다. 현재 BETA 서명 커서 전체 검색은 #417로 별도 구현되었고 [#418](https://github.com/ot4562-glitch/HUFS-One-AI/issues/418)의 409/422·429·KST 날짜 회귀와 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)/[#366](https://github.com/ot4562-glitch/HUFS-One-AI/issues/366)의 실제 자료·계정 인수를 별도로 추적합니다. 정확한 PR HEAD `ba7bf2a` Actions 4/4 SUCCESS, merge `d8e2144`; 이는 독립 사람 승인이나 출시 허가가 아닙니다.
