# HUFS One AI — 현재 남은 구현·운영 인수 (2026-11-06 기준)

이 경로는 과거 링크 호환을 위해 파일명 `20261104`를 유지합니다. **정본: [STATUS](../STATUS.md), 실제 증거: [REPORT](../REPORT.md), 역할/사람 인수: [TEAM_PROGRESS](TEAM_PROGRESS.md)**. 프로젝트 승인 `OWNER_CONFIRMED_APPROVED`는 실계정/실원본/공식 학칙/NCP·유료 공급자 설정 성공을 뜻하지 않습니다. 실제 서비스 `RELEASE_BLOCKED`.

## 코드/합성 사전작업 완료와 PR 처리

- 본선 진출 이전 11개 제목 이슈(#9/#10/#11/#12/#119/#258/#260/#261/#284/#294/#296)는 [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)의 통합 근거에 따라 모두 종결: 10개 `completed`, #260은 **지정 팀원의 실제 교차 리뷰를 미완료로 인정·이관**하며 `not_planned`. 이슈 종료와 실제 출시/권리·사람 인수는 별개.
- [#305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305)는 #306 통합 뒤 `main`과 비교해 **변경 파일 0개**인 중복. [코드 리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305#pullrequestreview-5797569357) 후 병합하지 않고 CLOSED.
- [#307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307) 현재 합성 화면으로 **홈 3단계 액션·공고 검색/7일 내 확정 마감/자격 상태 필터·마감 정렬·키보드/reduced-motion**을 구현. 변경 8파일의 [리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307#pullrequestreview-5797568875), PR HEAD `ba7bf2a` Actions [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685945)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685929)·[NCP](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182686098)·[Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685963) **4/4 SUCCESS**, 병합 커밋 [`d8e2144`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/d8e2144184d06577ff76d8e5e1ed3a13be09af4c). 병합 main CI는 해당 SHA에서 별도 확인한다.
- 앞서 병합된 #267–#295(각 해당 PR/이슈 인용)에는 합성 개인화·학업/RulePack·SourceRevision·학생 명시 승인/철회·API/RLS/AI/NCP preview 코드가 있습니다. 공개 Pages는 **실자료 없는 합성 화면**, `main` push 시 자동 재배포합니다. 합성 자동검증과 현장 검증을 혼동하지 않습니다.

## 아직 OPEN — 실구현·인수/근거가 필요한 일

| 이슈 | 남은 실작업 / 올바른 현재 경계 |
| --- | --- |
| [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) | NCP 실호스트·PG/CA TLS·Google/학교메일·관리형 권한·실원본 인입·유료 모델·운영 장애/비용/복구: **CONFIGURATION_REQUIRED/NOT_RUN** |
| [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) | 실제 사용자별 UI, 모바일/키보드/스크린리더·다중탭/철회/권한·정정·경험 추천 **사람 종단 인수** |
| [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) | 허가된 실제 추천/공지 source revision·성능·독립 Gold/정정 및 사람 리뷰 |
| [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) | 공식 학칙/RulePack·학수번호/4인 실제 원장·과거 8학기 개설 및 학업 소비자 교차 리뷰 |
| [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) | NCP 실제 계정·최종 SKU/요금/청구·권리/동의·인수/복구·비코드 운영 검토 |
| [#297](https://github.com/ot4562-glitch/HUFS-One-AI/issues/297) · [#299](https://github.com/ot4562-glitch/HUFS-One-AI/issues/299) | 정적 Pages 자동배포 유지와 별개로 실제 4명 **본인 인증·권리·동의/철회·소유자별 private intake** 확인. 공개 합성 선택기는 학교 로그인 아님 |
| [#298](https://github.com/ot4562-glitch/HUFS-One-AI/issues/298) · [#303](https://github.com/ot4562-glitch/HUFS-One-AI/issues/303) | 홈/기회 인터랙션 및 Pages S04 기본 오류 수정은 완료 체크. 남은 전체 화면·접근성/실기기·계정 권한 회복·`asOf`/D-day 안내는 **미완료** |
| [#300](https://github.com/ot4562-glitch/HUFS-One-AI/issues/300) | 나의 경험 LinkedIn형 구조화 프로필·편집/기간/링크/역량 후보/동의 중심 전면 재설계 미완료 |
| [#301](https://github.com/ot4562-glitch/HUFS-One-AI/issues/301) | 박준영 수집 자료의 실제 출처·권리/학업 API/공식 식별자·화면 소비 증거와 상태표 미확인 |
| [#302](https://github.com/ot4562-glitch/HUFS-One-AI/issues/302) | 실 CLOVA/Laya API 호출 영수증·캐시 재생 증거/UI; 합성 Pages 결과를 실제 provider 호출로 소개하지 않음 |
| [#255](https://github.com/ot4562-glitch/HUFS-One-AI/issues/255) | 경험→커리어 제안 상위 기획; 신규 제품 기능·실인수 전체의 체크리스트를 대체하지 않음 |

## 변하지 않는 보안·검증 조건

- `csv/`의 **Forms 1개+수강 CSV 4개=5개 원본**은 사용자 지시대로 경로·내용·인코딩·Git blob 상태를 무단 변경·삭제하지 않는다. 공개 Git에 있다는 사실과 실제 학생 4인의 현재 개인별 동의/검증된 actor 연결을 혼동하지 않는다. 새로운 원본·실명 대응표/비밀을 PR·웹·모델·CI에 넣지 않는다.
- 합성 `S01–S05`, EMPTY_DEMO, REVIEWER와 실제 네 명을 구별한다. `D-day`와 7일 필터는 **해당 snapshot의 `asOf`** 기준이고 현재 로드된 허가 목록만 검색한다. 전체 실시간 공고 검색/학교 졸업 인정이 아니다.
- 정확한 PR HEAD에서 얻은 테스트 성공을 다른 `main` SHA의 성공으로 옮기지 않는다. 현재 UI의 실제 사람 NVDA/실기기, 팀 교차 리뷰, 독립 사람 Gold, 실제 NCP/PG/HCX 비용·성능은 근거 전 `NOT_RUN/NOT_MEASURED`이고 `RELEASE_BLOCKED` 유지.
