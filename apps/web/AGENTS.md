# React UI·모바일·시연 접근성

**담당 이의상 `uisang2004-maker`**. UI/시연/접근성 소유, 공용 Zod/API·학업/추천 결정론과 실학사 권한은 각 담당자와 협업. [제품 UI 현재 구조](README.md) · [디자인 A11](../../Architecture.md) · [#9](https://github.com/minseong-hufs/HUFS-One-AI/issues/9)/[#119](https://github.com/minseong-hufs/HUFS-One-AI/issues/119).

- 넓은 화면 상단 주요 메뉴 8개·휴대폰 하단 5탭, 단일 HUFSAbility 원래 메뉴 disclosure/미지원 24개, 페이지별 배너·h1/breadcrumb, 홈 3요약 카드의 검증된 숫자만 표시.
- 합성 S01–S05/EMPTY·ADMIN/REVIEWER와 실학생 원본 4명을 혼합하지 않으며 데이터/권한·학교 서비스 화면을 모방하거나 실제 지원/졸업을 확정하지 않음.
- 401/403/409/429/503·브라우저 뒤로가기/다중탭/권한 철회·늦은 응답에서 비공유/이전 학생 캐시/이미지·초대 토큰/화면 잔상을 비움.
- keyboard/Disclosure Escape·포커스/heading·320–1440px/스크린리더/alt/읽기 순서를 시험한다. Chrome 합성 E2E와 실제 별도 보조기기 사람 인수(#252)를 구분.
- 원본 학생 자료·외부 유료 AI/실 NCP는 사전 승인 전 OFF. 코드 변경은 관련 소비자/계약 리뷰와 정확한 HEAD CI로 검증.
