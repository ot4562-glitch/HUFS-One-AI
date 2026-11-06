# HUFS One AI — 현재 메뉴·기능 대응표

**제품은 독자적인 React UI**이며 기존 HUFSAbility의 코드·브랜드/디자인을 복제하지 않습니다. 메뉴/기능 이름을 참조하는 것은 학교 공식 기능을 새 서비스에서 제공하거나 SSO로 연동했다는 뜻이 아닙니다.

## 제품 주요 메뉴 (실제 React 경로)

디자인 기준은 팀 디자인 시안(`HUFS_One_AI_Essential` 18장)과 UIUX 96 마스터 명세다. 넓은 화면(≥1024 CSS px)은 시안의 상단 메뉴(홈 + 10개)를 쓰고, 작은 화면은 **하단 5탭**이다. 메뉴 목록은 `apps/web/src/shell/areas.ts`.

| 상단 메뉴 (`/area/:id`) | HUFS One AI 화면 (경로) | 모바일 탭 |
| --- | --- | --- |
| 홈 | 오늘 `/` | 오늘 |
| 학사정보 `academic` | 학사공지·일정 `/notices` | — |
| 수업/수강 `class` | (없음 · 수강계획 검사는 성적/졸업 화면 안) | — |
| 성적/졸업 `grades` | AI 졸업지원 `/graduation`, 전공·학업 What-if `/graduation/what-if` | 졸업 |
| 비교과·역량 `extracurricular` | 추천 피드 `/opportunities` | 기회 |
| 경험관리 `experience` | 나의 경험 `/experience` | 경험 |
| 진로·취업 `career` | 나의 지원 현황 `/applications` | — |
| AI 추천 `ai` | 통합 보관함 `/saved` | 보관함 |
| 커뮤니티 `community` | 동아리 모집 `/clubs` | — |
| 지원/신청 `apply` | (없음 · 학교 신청 업무는 학교 공식 서비스) | — |
| 서비스 안내 `service` | 전체 메뉴 `/menu`, 내 설정·개인화 `/settings` | — |

각 메뉴 페이지와 왼쪽 메뉴는 시안에 그려진 나머지 항목(예: 성적 조회, 수강신청, 장학금 신청)을 **미지원 텍스트**(링크·포커스 없음)로 보여 준다.

`/menu`는 전체 목록, `/settings`는 사용자 설정이다. 시연용 별도 `/demo-profile`, 합성 ADMIN, REVIEWER 화면은 일반 학생 메뉴의 공식 서비스라고 오인시키지 않는다.

## 기존 HUFSAbility 참고 메뉴

- 참고 공개 기능 5분류: **역량관리 4, 교과/비교과 5, 채용 6, 경력개발 4, 통합상담 5 = 24개**.
- 공개 안내 4영역: 교내비교과·장학공지·공지사항·채용정보. 공식 홈페이지 새 창 링크로만 안내한다.
- 공개 5분류 24기능·공개 4영역 manifest는 `/menu` 전체 메뉴 페이지에서 그대로 보여 준다(텍스트와 `미지원`, 공개 4영역은 공식 첫 화면 새 창 링크).
- 학교 학생 계정에서 관찰된 **11개 정보 영역·76개 화면**(아틀라스)은 참고 조사다. 원래 화면을 구현하거나 복제한 것은 아니며, 학교 교표·로고·건물 사진·학번/비밀번호 로그인 화면은 쓰지 않는다.

## 현재 인수 상태

- React/Vite·합성 Chrome E2E는 상단/모바일 메뉴·키보드/닫힘/focus·미지원 상태/320–1440px 범위 검증 코드가 있습니다.
- **실제 스크린리더/실학생 계정·운영 사용자 역할·학교 접근성·기관/자료 이용권은 #252 D02/B01에서 인수 전**.
- 특정 메뉴가 데이터/권리/운영 포트 없이 비활성이라면 `미지원`, `NOT_SHARED`, `UNKNOWN`을 명시하고 임의 응답/실지원 완료를 표시하지 않습니다.

[UI 기술 및 토큰](../Architecture.md#a11-ui모바일디자인접근성) · [#9 UI](https://github.com/minseong-hufs/HUFS-One-AI/issues/9) · [#119 종단](https://github.com/minseong-hufs/HUFS-One-AI/issues/119) · [#252 실기기](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).
