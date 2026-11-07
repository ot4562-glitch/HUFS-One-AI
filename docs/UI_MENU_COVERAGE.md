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

역량관리·현직자멘토링·통합상담·취업조사·교수지원(학생)·오픈배지·취업통계에는 이번 시연의 HUFS One AI 화면이 없다. 각 대분류 페이지는 그 사실과 원래 메뉴 이름을 **미지원 텍스트**(링크·포커스 없음)로 보여 준다. 대분류 목록은 `apps/web/src/shell/areas.ts`.

`/menu`는 전체 목록, `/settings`는 사용자 설정이다. 시연용 별도 `/demo-profile`, 합성 ADMIN, REVIEWER 화면은 일반 학생 메뉴의 공식 서비스라고 오인시키지 않는다.

## 기존 HUFSAbility 참고 메뉴

- 참고 공개 기능 5분류: **역량관리 4, 교과/비교과 5, 채용 6, 경력개발 4, 통합상담 5 = 24개**.
- 공개 안내 4영역: 교내비교과·장학공지·공지사항·채용정보. 공식 홈페이지 새 창 링크로만 안내한다.
- 공개 5분류 24기능·공개 4영역 manifest는 `/menu` 전체 메뉴 페이지에서 그대로 보여 준다(텍스트와 `미지원`, 공개 4영역은 공식 첫 화면 새 창 링크).
- 학교 학생 계정에서 관찰된 **11개 정보 영역**은 넓은 화면 GNB와 각 대분류 LNB의 원래 메뉴 이름으로 쓴다. 76개 원래 화면을 구현하거나 복제한 것은 아니며, 학교 교표·로고·건물 사진·학번/비밀번호 로그인 화면은 쓰지 않는다.

## 현재 병합된 홈·기회 탐색

[PR #307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307)로 홈의 기존 요약을 바탕으로 한 3단계 선택 패널 및 `/opportunities`의 **현재 표시된 허가 공고만** 검색/7일 내 확정 마감·자격 상태 필터/마감 정렬을 연결했습니다. 기존 데스크톱 11대분류·모바일 5탭 정보구조를 대체하지 않습니다. 현재 날짜가 아닌 자료의 `asOf`에 따른 마감·D-day이고 실제 학생 로그인/실원본 전체 검색이 아닙니다. PR HEAD CI 4/4 통과와 사람/실기기 인수는 구별합니다. #318 전체 UX/날짜 안내, #280 실제 UI 인수는 계속 OPEN입니다.

## 2026-11-07 최신 이슈 분리·담당 배정

| 현재 OPEN 7개 | 담당 |
| --- | --- |
| [#321 이의상 AI/NLP](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321) | `uisang2004-maker` |
| [#322 박준영 AI·학업](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322) | `taewangim-alt` |
| [#323 이서연 NCP 서버](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) | `lhh42001` |
| [#324 김채윤 시연/검증](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324) | `qamarrchae` |
| [#325 심민성 통합/릴리스](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) | `ot4562-glitch` |
| [#317 추가 기능](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317) | `ot4562-glitch` |
| [#318 UI/UX](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318) | `lhh42001` |

구 통합 [#316](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316)은 기존 POST-01~20을 개인별 #321~#325로 중복 없이 옮긴 뒤 **CLOSED(이관)**했습니다. 추가 기능 #317→심민성, UI/UX #318→이서연; 각 OPEN 이슈는 담당자 1명입니다. 이전 이슈 본문/댓글은 이력 보존. **코드/합성 PASS는 실제 NCP·학교 데이터·실 AI·사람 수락 완료를 뜻하지 않으며 `RELEASE_BLOCKED` 유지**.
## 현재 인수 상태

- React/Vite·합성 Chrome E2E는 상단/모바일 메뉴·키보드/닫힘/focus·미지원 상태/320–1440px 범위 검증 코드가 있습니다.
- **실제 스크린리더·사람 웹 검수는 이서연 [#318](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318), 실사용 시연/AI 결과는 김채윤 [#324](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324), 실 NCP 서버·비용은 이서연 [#323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323), 실 로그인/개별 권리·DB는 심민성 [#325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325)에서 미인수 상태로 추적합니다.** 이전 #252는 완료/이관 이력입니다.
- 특정 메뉴가 데이터/권리/운영 포트 없이 비활성이라면 `미지원`, `NOT_SHARED`, `UNKNOWN`을 명시하고 임의 응답/실지원 완료를 표시하지 않습니다.

[UI 기술 및 토큰](../Architecture.md#a11-ui모바일디자인접근성) · [#9 UI](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9) · [#119 종단](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) · [#252 실기기](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252).
