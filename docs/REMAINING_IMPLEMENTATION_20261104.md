# HUFS One AI — 현재 남은 구현·운영 인수 (2026-11-07 기준)

이 경로는 과거 링크 호환을 위해 파일명 `20261104`를 유지합니다. **정본: [STATUS](../STATUS.md), 실제 증거: [REPORT](../REPORT.md), 역할/사람 인수: [TEAM_PROGRESS](TEAM_PROGRESS.md)**. 프로젝트 승인 `OWNER_CONFIRMED_APPROVED`는 실계정/실원본/공식 학칙/NCP·유료 공급자 설정 성공을 뜻하지 않습니다. 실제 서비스 `RELEASE_BLOCKED`.

## 코드/합성 사전작업 완료와 PR 처리

- 본선 진출 이전 11개 제목 이슈(#9/#10/#11/#12/#119/#258/#260/#261/#284/#294/#296)는 [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)의 통합 근거에 따라 모두 종결: 10개 `completed`, #260은 **지정 팀원의 실제 교차 리뷰를 미완료로 인정·이관**하며 `not_planned`. 이슈 종료와 실제 출시/권리·사람 인수는 별개.
- [#305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305)는 #306 통합 뒤 `main`과 비교해 **변경 파일 0개**인 중복. [코드 리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305#pullrequestreview-5797569357) 후 병합하지 않고 CLOSED.
- [#307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307) 현재 합성 화면으로 **홈 3단계 액션·공고 검색/7일 내 확정 마감/자격 상태 필터·마감 정렬·키보드/reduced-motion**을 구현. 변경 8파일의 [리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307#pullrequestreview-5797568875), PR HEAD `ba7bf2a` Actions [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685945)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685929)·[NCP](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182686098)·[Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685963) **4/4 SUCCESS**, 병합 커밋 [`d8e2144`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/d8e2144184d06577ff76d8e5e1ed3a13be09af4c). 병합 이후 정확한 `main d8e2144`의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797571)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797686)·[NCP](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797648)·[Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797515) **4/4 SUCCESS** 확인. 이후 문서 PR의 CI는 별도.
- 앞서 병합된 #267–#295(각 해당 PR/이슈 인용)에는 합성 개인화·학업/RulePack·SourceRevision·학생 명시 승인/철회·API/RLS/AI/NCP preview 코드가 있습니다. 공개 Pages는 **실자료 없는 합성 화면**, `main` push 시 자동 재배포합니다. 합성 자동검증과 현장 검증을 혼동하지 않습니다.

## 2026-11-07 이슈 통합 및 미배정

현재 열린 이슈는 **[#298 [UI/UX]](https://github.com/ot4562-glitch/HUFS-One-AI/issues/298), [#276 [본선 진출 이후]](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276), [#255 [추가 기능 제안]](https://github.com/ot4562-glitch/HUFS-One-AI/issues/255)** 정확히 3개이고 **모든 담당자는 미배정**입니다. 2026-11-07 당시 열린 18개 중 기존 15개는 핵심 요구와 중복/고유 반례를 위 3개에 병합하고 closed/duplicate로 남겼습니다. 과거 댓글·체크리스트/협업자 이름은 이력이지 미래 역할 배정이 아닙니다. 실제 사용권·학교 로그인·실 NCP/PG/AI 운영 및 사람 인수는 NOT_RUN/CONFIGURATION_REQUIRED로, 실서비스 RELEASE_BLOCKED입니다.

## 남은 실제 검증·기능과 기존 원본 링크

| 현재 3개 OPEN 이슈 | 범위와 과거 상세 출처 |
| --- | --- |
| **[#298 UI/UX](https://github.com/ot4562-glitch/HUFS-One-AI/issues/298)** | 현재 홈·공고/공지 숫자/판본·칸반·졸업/경험/설정·실기기/스크린리더 인수. 고유 4건 #313, 11건 #312, 5건 #310/#311, 4건 #314와 기존 #280/#303 통합 |
| **[#276 본선 진출 이후](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)** | NCP/PG·Google 학교메일·실학생 4인·원본 권리·학업 RulePack·공식 출처/실추천·CLOVA/Laya 청구·복구/인수. 종전 #280–#283/#297/#299/#301 및 서버측 #302 이관 |
| **[#255 추가 기능 제안](https://github.com/ot4562-glitch/HUFS-One-AI/issues/255)** | 기존 AI 경험 매핑·LinkedIn형 포트폴리오 #300, 실 AI 실행이력/캐시 재생 UI #302, 기관 웹페이지 링크·연합 동아리 확장 #312 등 비필수 제안 |

**종전 #280–#283/#297–#303/#310–#314는 closed/duplicate이며 새로운 세 이슈의 상세 본문·원본 링크에 체크리스트를 보존했습니다.** 원본 이슈 종료를 실제 구현/실출시 인수 완료로 착각하지 않습니다.

## 변하지 않는 보안·검증 조건

- `csv/`의 **Forms 1개+수강 CSV 4개=5개 원본**은 사용자 지시대로 경로·내용·인코딩·Git blob 상태를 무단 변경·삭제하지 않는다. 공개 Git에 있다는 사실과 실제 학생 4인의 현재 개인별 동의/검증된 actor 연결을 혼동하지 않는다. 새로운 원본·실명 대응표/비밀을 PR·웹·모델·CI에 넣지 않는다.
- 합성 `S01–S05`, EMPTY_DEMO, REVIEWER와 실제 네 명을 구별한다. `D-day`와 7일 필터는 **해당 snapshot의 `asOf`** 기준이고 현재 로드된 허가 목록만 검색한다. 전체 실시간 공고 검색/학교 졸업 인정이 아니다.
- 정확한 PR HEAD에서 얻은 테스트 성공을 다른 `main` SHA의 성공으로 옮기지 않는다. 현재 UI의 실제 사람 NVDA/실기기, 팀 교차 리뷰, 독립 사람 Gold, 실제 NCP/PG/HCX 비용·성능은 근거 전 `NOT_RUN/NOT_MEASURED`이고 `RELEASE_BLOCKED` 유지.
