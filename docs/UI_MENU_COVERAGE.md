# HUFS One AI — 현재 메뉴·기능 대응표

**제품은 독자적인 React UI**이며 기존 HUFSAbility의 코드·브랜드/디자인을 복제하지 않습니다. 메뉴/기능 이름을 참조하는 것은 학교 공식 기능을 새 서비스에서 제공하거나 SSO로 연동했다는 뜻이 아닙니다.

## 제품 주요 메뉴 (실제 React 경로)

디자인 기준은 UIUX 96 마스터 명세(§2.1·§3.4·§4)다. 넓은 화면(≥1024 CSS px)은 **관찰된 HUFSAbility 11개 대분류 GNB**를 쓰고, HUFS One AI 화면은 해당 대분류의 왼쪽 메뉴(LNB)에서 열며, 홈은 로고 링크로 이동한다. 상단의 별도 `ONE AI` 바로가기 배지는 표시하지 않는다. 작은 화면은 **하단 5탭**을 유지한다. 합성 프로필 선택기는 현재 공통 상단 계정 안내에 있으나, 실제 사용자 본인 인증·계정 전환은 #297/#299에서 별도로 구현한다.

| 주요 화면 | 경로 | 들어 있는 대분류 (`/area/:id`) | 모바일 탭 |
| --- | --- | --- | --- |
| 오늘 | `/` | — (홈) | 오늘 |
| 맞춤 기회 | `/opportunities` | 채용/고용24 `jobs` | 기회 |
| 지원 현황 | `/applications` | 채용/고용24 `jobs` | — |
| 나의 경험 | `/experience` | 전공·진로설계 `career` | 경험 |
| 졸업지원 · 전공 가정 분석 | `/graduation`, `/graduation/what-if` | 교과/비교과 `curricular` | 졸업 |
| 보관함 | `/saved` | 교과/비교과 `curricular` | 보관함 |
| 동아리 모집 | `/clubs` | 교과/비교과 `curricular` | — |
| 학사 공지 | `/notices` | 커뮤니티 `community` | — |

역량관리·취업조사·교수지원(학생)의 원래 HUFSAbility 기능은 이 제품에서 여전히 **미지원 텍스트**(링크·포커스 없음)로만 표시합니다. 반면 현직자멘토링·통합상담·오픈배지·취업통계 대분류에는 아래에 설명하는 **HUFS One AI 자체 BETA 화면**이 추가됐습니다. 이는 학교 원본 기능 구현·실운영 연동을 의미하지 않습니다. 원래 학교 메뉴는 `observed`로서 계속 미지원이며, 앱 자체 화면 링크 목록은 `apps/web/src/shell/areas.ts`의 `ours`가 현재 정본입니다.

`/menu`는 전체 목록, `/settings`는 사용자 설정이다. 시연용 별도 `/demo-profile`, 합성 ADMIN, REVIEWER 화면은 일반 학생 메뉴의 공식 서비스라고 오인시키지 않는다.

## 2026-11-09 최신 HUFS One AI 화면 확장 (코드 병합과 실사용 구분)

아래 경로는 `apps/web/src/shell/areas.ts`의 `ours`, `apps/web/src/pages/index.ts`의 page renderer와 BETA owner 포트 조립을 확인한 **앱 자체 화면**입니다. 기존 HUFSAbility의 같은 이름 기능을 구현·인증한 것이 아닙니다.

| 영역 | HUFS One AI 자체 화면 경로 | 연결 상태·제한 |
| --- | --- | --- |
| 캠퍼스 활동·교환·FAQ | `/activities`, `/exchange`, `/faq` | CampusAssist 코드와 FAQ 근거 가드 #361 병합. 실제 공식 학과/국제교류 자료·HCX 권리/비용 미연결 |
| 교과·경험·장학·배지 | `/owner-academics/experience-courses`, `/owner-scholarships`, `/owner-badges` | 본인 BETA owner 인증 API/UI 경계와 미연결 상태 제공; 공식 학점/배지 원장·발급권은 별도 인수 |
| 검색·멘토·NCS | `/owner-opportunities/v2-catalog`, `/owner-insights/MENTORS`, `/owner-insights/SKILLS` | 허가된 공고/멘토/승인 경험 입력에만 근거. 실제 공고권·NCS 검증 및 커서 UX 결함 #418 별도 OPEN |
| 인정 준비·학습 | `/owner-insights/RECOGNITION`, `/owner-insights/LEARNING` | OCR/학습 추천 후보·준비 단계이며 공식 인정·등록이 아님 |
| 상담·국제학생·통계 | `/counseling`, `/owner-insights/INTERNATIONAL`, `/owner-insights/EMPLOYMENT` | #410 상담 source→API/UI 및 #422 owner insights 연결. 공식 상담예약·학교 학칙·공개 통계 승인 아님 |

현재 등록된 앱 라우트/페이지와 실제 운영 기관의 원장·동의·권리/비용·독립 사람 인수는 별도 검증 단계입니다. `RELEASE_BLOCKED` 및 `NOT_CONNECTED` 상태를 숨기지 않습니다. 상세 구현 현황은 [STATUS](../STATUS.md), [#360 데이터 인수](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360), [#366 운영 연결](https://github.com/ot4562-glitch/HUFS-One-AI/issues/366)을 따릅니다.

## 기존 HUFSAbility 참고 메뉴

- 참고 공개 기능 5분류: **역량관리 4, 교과/비교과 5, 채용 6, 경력개발 4, 통합상담 5 = 24개**.
- 공개 안내 4영역: 교내비교과·장학공지·공지사항·채용정보. 공식 홈페이지 새 창 링크로만 안내한다.
- 공개 5분류 24기능·공개 4영역 manifest는 `/menu` 전체 메뉴 페이지에서 그대로 보여 준다(텍스트와 `미지원`, 공개 4영역은 공식 첫 화면 새 창 링크).
- 학교 학생 계정에서 관찰된 **11개 정보 영역**은 넓은 화면 GNB와 각 대분류 LNB의 원래 메뉴 이름으로 쓴다. 76개 원래 화면을 구현하거나 복제한 것은 아니며, 학교 교표·로고·건물 사진·학번/비밀번호 로그인 화면은 쓰지 않는다.

## 현재 병합된 홈·기회 탐색

[PR #307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307)로 홈의 기존 요약을 바탕으로 한 3단계 선택 패널 및 `/opportunities`의 **현재 표시된 허가 공고만** 검색/7일 내 확정 마감·자격 상태 필터/마감 정렬을 연결했습니다. 기존 데스크톱 11대분류·모바일 5탭 정보구조를 대체하지 않습니다. 현재 날짜가 아닌 자료의 `asOf`에 따른 마감·D-day이고 실제 학생 로그인/실원본 전체 검색이 아닙니다. PR HEAD CI 4/4 통과와 사람/실기기 인수는 구별합니다. #318/#280은 당시의 인수 이력입니다. 현행 웹 개발은 #357, 승인 검색의 TTL/429/KST UX 결함은 #418, 공식자료·운영 인수는 #360/#366에서 각각 추적합니다.

## 현재 메뉴 구현·추가기능 협업 상태 (2026-11-09)

신규 `[추가 기능]` 이슈는 **심민성이 최초 assignee**로 구조/일반 코드를 가능한 범위까지 구현하며, 추천/랭킹·규칙/코드 기반 AI·LLM/OCR 등은 **박준영 또는 이의상에게 실제 구현을 인계**한다. [#339–#352](https://github.com/ot4562-glitch/HUFS-One-AI/issues/339) 중 13개 기능의 AI 개발 담당은 박준영 6개·이의상 7개이고, **김채윤은 모두 데이터 공동 assignee**다. 실제 데이터 요청은 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)이며, 새 자료 요청은 별도 `[데이터 요청]` 이슈로 만든다.

**이서연**([#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357))은 기존 웹사이트에 기능을 실제 배치하고 김채윤이 준비한 허가된 포스터·공고를 화면 디자인에 활용한다. **박준영**([#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356))은 AI 제품 QA, **이의상**([#355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355))은 AI 교차 검증, **김채윤**([#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358))은 가벼운 사용자 시연, **심민성**([#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359))은 전체 코드/품질/통합 검수를 수행한다.

**고정 역할 #355–#359에는 더 이상 수정·댓글·담당 변경 등 어떤 쓰기도 수행하지 않는다.** 화면의 실제 구현 여부는 각 기능 PR의 병합 상태와 앱의 `AREAS.ours`/page renderer·BETA 포트 연결을 확인해 판단합니다. PR #342/#353 및 이후 #361/#372/#410/#420/#422/#417 등의 코드는 이미 main에 병합됐지만, **합성 또는 미연결 BETA 화면을 학교 공식 시스템·운영 서비스 완료로 표시하지 않습니다.** [업무 배정 플레이북](ISSUE_ASSIGNMENT_PLAYBOOK.md) · [팀 운영](WORKSTREAMS.md).

## 현재 인수 상태

- React/Vite·합성 Chrome E2E는 상단/모바일 메뉴·키보드/닫힘/focus·미지원 상태/320–1440px 범위 검증 코드가 있습니다.
- **현행 인수 담당:** 웹·모바일·스크린리더 사람 검수와 UI 연결은 이서연 [#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357), 자료·게시권/시연·독립 Gold는 김채윤 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360), API/DB/NCP 코드·운영 통합은 심민성 [#366](https://github.com/ot4562-glitch/HUFS-One-AI/issues/366)/[#367](https://github.com/ot4562-glitch/HUFS-One-AI/issues/367), 인증 공고 검색의 사용자 오류 안내·날짜 회귀는 [#418](https://github.com/ot4562-glitch/HUFS-One-AI/issues/418)에 남아 있습니다. 과거 #318/#323/#324/#325는 **현재의 열린 담당 이슈가 아니며** 실계정·실서버/비용·권리·실기기 사람 인수 증거는 별도입니다.
- 특정 메뉴가 데이터/권리/운영 포트 없이 비활성이라면 `미지원`, `NOT_SHARED`, `UNKNOWN`을 명시하고 임의 응답/실지원 완료를 표시하지 않습니다.

[UI 기술 및 토큰](../Architecture.md#a11-ui모바일디자인접근성) · [#9 UI](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9) · [#119 종단](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) · [#252 실기기](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252).
