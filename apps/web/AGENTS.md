# React UI·모바일·시연 접근성

**현재 [#318 UI/UX](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318)는 이서연 `lhh42001`에게 실제 GitHub 배정**됐습니다. 이서연은 전체 디자인·React UI/접근성, 별도 [#323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323)은 NCP 서버·운영 담당입니다. 이의상 [#321](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321) + 박준영 [#322](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322)는 Laya/CLOVA·NLP·정확도 공동, 김채윤 [#324](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324)는 전체 시연·학생 경험/AI 결과 검증, 심민성 [#325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325)는 API/DB·보안·통합/품질과 별도 [#317 추가 기능](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317) 개발을 담당합니다. 과거 #9/#119/#258의 이의상 UI는 본선 이전 이력입니다. [현행 역할](../../docs/WORKSTREAMS.md) · [웹 구조](README.md) · [디자인 A11](../../Architecture.md).

- 넓은 화면에는 관찰된 11개 대분류 GNB·실제 구현 화면의 LNB, 휴대폰에는 하단 5탭을 사용한다. 별도 데스크톱 `ONE AI` 탭 배지는 없으며, 현재 합성 계정 선택은 공통 헤더의 계정 메뉴에 위치한다. 원래 HUFSAbility 메뉴 24개는 미지원 상태로 표시하고, 페이지 배너·h1/breadcrumb 및 검증된 홈 요약 수치만 사용한다.
- 합성 S01–S05/EMPTY·ADMIN/REVIEWER와 실학생 원본 4명을 혼합하지 않으며 데이터/권한·학교 서비스 화면을 모방하거나 실제 지원/졸업을 확정하지 않음.
- 401/403/409/429/503·브라우저 뒤로가기/다중탭/권한 철회·늦은 응답에서 비공유/이전 학생 캐시/이미지·초대 토큰/화면 잔상을 비움.
- keyboard/Disclosure Escape·포커스/heading·320–1440px/스크린리더/alt/읽기 순서를 시험한다. Chrome 합성 E2E와 실제 별도 보조기기 사람 인수(#252)를 구분.
- 현재 공개/로컬 합성 UI에서는 원본 학생 자료·외부 유료 AI·실 NCP 접근 OFF. 프로젝트 승인과 달리 **실운영 별도 구성·권리/인증·현장 인수는 미완료**다. 코드 변경은 관련 소비자/계약 리뷰와 정확한 HEAD CI로 검증.
- [PR #307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307)의 액션 패널·공고 필터/정렬은 현재 허가된 projection 안의 클라이언트 기능. 현재 snapshot의 `asOf`를 실제 오늘과 혼동하지 않고 `hasMore` 목록 밖을 전체 검색했다고 주장하지 않는다. 실제 키보드/스크린리더/기기 인수와 D-day·협업자 #310–#314 피드백은 #318, 실 NCP 서버 연결은 #323, 실인증·본인 권리/DB는 #325.
