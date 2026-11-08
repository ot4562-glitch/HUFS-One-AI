# HUFS One AI — 현재 남은 구현·운영 인수 (2026-11-07 기준)

> **현재 업무 배정 주의(2026-11-08):** 이 문서의 이전 시점 담당 이슈 #317·#321–#325 및 당시 인수/운영 분장은 **역사적 기록**이다. 현행 정본은 [루트 AGENTS](../AGENTS.md) · [업무 자동 배정 플레이북](ISSUE_ASSIGNMENT_PLAYBOOK.md) · [팀 역할](WORKSTREAMS.md)이다. 고정 역할 #355–#359는 **완전 읽기 전용**으로 수정·댓글/담당 변경을 하지 않는다. 신규 추가기능은 **심민성 최초 배정·가능한 비AI 코드 직접 구현 → 코드 기반 AI까지 포함해 박준영/이의상에게 AI 구현 인계**한다. 공식 문서·포스터·Gold 자료가 필요하면 **별도 `[데이터 요청]` 이슈**를 김채윤에게 만들고 원 기능에도 김채윤을 공동 assignee로 추가한다. 현재 13개 기능의 요청은 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)이다. 김채윤은 사용자 관점 경량 시연, 박준영은 AI 제품 기술 QA, 이서연은 실제 웹 디자인/배치, 심민성은 전 과정 검수를 맡는다.


이 경로는 과거 링크 호환을 위해 파일명 `20261104`를 유지합니다. **정본: [STATUS](../STATUS.md), 실제 증거: [REPORT](../REPORT.md), 역할/사람 인수: [TEAM_PROGRESS](TEAM_PROGRESS.md)**. 프로젝트 승인 `OWNER_CONFIRMED_APPROVED`는 실계정/실원본/공식 학칙/NCP·유료 공급자 설정 성공을 뜻하지 않습니다. 실제 서비스 `RELEASE_BLOCKED`.

## 코드/합성 사전작업 완료와 PR 처리

- 본선 진출 이전 11개 제목 이슈(#9/#10/#11/#12/#119/#258/#260/#261/#284/#294/#296)는 [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)의 통합 근거에 따라 모두 종결: 10개 `completed`, #260은 **지정 팀원의 실제 교차 리뷰를 미완료로 인정·이관**하며 `not_planned`. 이슈 종료와 실제 출시/권리·사람 인수는 별개.
- [#305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305)는 #306 통합 뒤 `main`과 비교해 **변경 파일 0개**인 중복. [코드 리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305#pullrequestreview-5797569357) 후 병합하지 않고 CLOSED.
- [#307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307) 현재 합성 화면으로 **홈 3단계 액션·공고 검색/7일 내 확정 마감/자격 상태 필터·마감 정렬·키보드/reduced-motion**을 구현. 변경 8파일의 [리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307#pullrequestreview-5797568875), PR HEAD `ba7bf2a` Actions [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685945)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685929)·[NCP](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182686098)·[Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685963) **4/4 SUCCESS**, 병합 커밋 [`d8e2144`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/d8e2144184d06577ff76d8e5e1ed3a13be09af4c). 병합 이후 정확한 `main d8e2144`의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797571)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797686)·[NCP](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797648)·[Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797515) **4/4 SUCCESS** 확인. 이후 문서 PR의 CI는 별도.
- 앞서 병합된 #267–#295(각 해당 PR/이슈 인용)에는 합성 개인화·학업/RulePack·SourceRevision·학생 명시 승인/철회·API/RLS/AI/NCP preview 코드가 있습니다. 공개 Pages는 **실자료 없는 합성 화면**, `main` push 시 자동 재배포합니다. 합성 자동검증과 현장 검증을 혼동하지 않습니다.

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
## 남은 실제 검증·기능과 기존 원본 링크

| 담당자/이슈 | 남은 작업 범위 |
| --- | --- |
| [이의상 #321](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321) | Laya·네이버 CLOVA OCR/Vision/HCX 연결·자연어 처리·AI 정확도 개선(박준영 공동) |
| [박준영 #322](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322) | AI/NLP 품질·Gold/평가 공동, RulePack·학업 코어·학수번호/8학기 출처 검증. 기존 #282/#301 인수 |
| [이서연 #323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) | NCP 계정/IAM·요금·호스트/배포·복구·서버 관리. 기존 #283 인수 |
| [김채윤 #324](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324) | 전체 웹 시연·학생 경험 입력·AI 정확도/추천 결과·실사용/발표 루트 인수. 기존 #281/실인수 반례 |
| [심민성 #325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) | Google/학교메일·PG/RLS/DB·Forms/수강 actor 연결·Source/rights/AI 영수증·통합/보안·출시 검수 |
| [추가 기능 #317](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317) | 심민성 개발: 커리어·포트폴리오·AI 실행 기록·기관/동아리 확장 등 선택 기능 |
| [UI/UX #318](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318) | 이서연 개발: 기존 UI/UX 협업자 반례·모바일·접근성·실권한 화면/사람 검수 |

실제 사용자/기관 권리, 자료, NCP 자격증명·정확도 측정/비용을 검증하지 않은 값은 `NOT_RUN`/`NOT_MEASURED`로 유지합니다. 개인별 이슈의 POST 원문은 구 통합 #316에 보관돼 있으며 **20개 모두 신규 이슈에 유지**됩니다.
## 변하지 않는 보안·검증 조건

- `csv/`의 **Forms 1개+수강 CSV 4개=5개 원본**은 사용자 지시대로 경로·내용·인코딩·Git blob 상태를 무단 변경·삭제하지 않는다. 공개 Git에 있다는 사실과 실제 학생 4인의 현재 개인별 동의/검증된 actor 연결을 혼동하지 않는다. 새로운 원본·실명 대응표/비밀을 PR·웹·모델·CI에 넣지 않는다.
- 합성 `S01–S05`, EMPTY_DEMO, REVIEWER와 실제 네 명을 구별한다. `D-day`와 7일 필터는 **해당 snapshot의 `asOf`** 기준이고 현재 로드된 허가 목록만 검색한다. 전체 실시간 공고 검색/학교 졸업 인정이 아니다.
- 정확한 PR HEAD에서 얻은 테스트 성공을 다른 `main` SHA의 성공으로 옮기지 않는다. 현재 UI의 실제 사람 NVDA/실기기, 팀 교차 리뷰, 독립 사람 Gold, 실제 NCP/PG/HCX 비용·성능은 근거 전 `NOT_RUN/NOT_MEASURED`이고 `RELEASE_BLOCKED` 유지.
