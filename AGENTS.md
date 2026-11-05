# HUFS One AI — 에이전트 개발 규칙

이 저장소는 한국외대 학생의 기회/공지·학업/경험을 위한 **독립 학생 팀 프로젝트**입니다. 학교 공식 HUFSAbility 또는 공식 학교 로그인/행정 업무를 대신하지 않습니다. 현재 코드와 실제 실행 결과를 우선하고, 검증하지 않은 이전 PR/문서의 성공 판정을 사용하지 않습니다.

## 작업 시작

1. [README](README.md) → [현재 상태](STATUS.md) → [Architecture](Architecture.md) → [팀 책임](docs/WORKSTREAMS.md) → 현재 담당 [#253 구현](https://github.com/minseong-hufs/HUFS-One-AI/issues/253), [#252 실환경·권리·인수](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)를 확인합니다.
2. 폴더별 `AGENTS.md`와 사용 중인 API/계약/테스트를 읽고, 다른 팀의 dirty worktree·브랜치/원격 ref를 덮어쓰거나 force push하지 않습니다.
3. **현재 코드, 정확한 SHA의 CI, 독립 검토와 실제 운영/사람 수락을 구분**합니다. 테스트 SKIP/FAIL/NOT_RUN을 숨기지 않습니다.

## 소유권

| 담당 | 책임 |
| --- | --- |
| 심민성 `ot4562-glitch` | 공용 Zod/API/인증/PG/Source/RAG·AI/비용·보안/CI·NCP 관련 SDK/worker/systemd/IaC/OS/배포 **모든 코드**, 프로젝트 통합 |
| 이의상 `uisang2004-maker` | React UI/디자인·모바일/접근성·시연·UI E2E |
| 김채윤 `qamarrchae` | 추천·중요공지·시점/평가 코어 |
| 박준영 `taewangim-alt` | 졸업/학점·What-if·개설 전망·공식 학칙 검증 |
| 이서연 `lhh42001` | **NCP 비코드 운영**: 계정/IAM·요금·SKU/크레딧·호스트/TLS/비밀·실측/중단/반납 증거. SDK/worker/IaC/CI 구현 담당 아님 |

다른 담당자의 코드와 공동 계약은 권한/소비자 리뷰를 거쳐 수정하며 사용자·기관·NCP 운영자의 실제 승인 행위를 에이전트 작업으로 대체하지 않습니다.

## 제품 및 개인정보

- HUFSAbility의 참조된 **공개 5분류·24기능/비로그인 4영역**과 별도 조사된 11영역·76화면을 **출처/관찰 범위별**로 구별합니다. 기능 이름은 참고하되 학교 원본 화면·CSS·로고/폰트/이미지/코드를 복제하지 않습니다. 자체 UI의 미지원 영역은 `🚫 미지원`을 명시합니다.
- 합성 S01–S05/독립 EMPTY/REVIEWER와 실제 개인 원본 제공자 **4명**을 혼동하지 않습니다. 권한 변경/탭 전환/늦은 응답/캐시·원본 정보 노출을 fail-closed 처리합니다.
- 참여 동의 5명 및 HUFSAbility 수집 허가는 사용자 확인 사항으로 보존하되, 각 파일/기관별 목적·현재 철회·최초 Git 게시·모델/NCP 전송/재배포 권한은 독립 대조합니다. 실원문/SID/키/비밀번호를 Git·CI·외부 모델·이슈에 넣지 않습니다.
- SourceRevision·원문 asOf·검수 시각·권리/보관/인용을 분리하고, 확정 자격·마감·학교 졸업 판정·지원 결과를 AI가 만들어 내지 못하게 합니다. `UNKNOWN/NEEDS_REVIEW/NOT_SHARED`를 위조 성공으로 바꾸지 않습니다.

## PR·문서·CI

- 코드/계약/DB/CI/보안/lockfile 수정은 관련 최신 HEAD에서 red→green·권한/동시성/철회 부정시험을 수행하고, **작성자와 다른 실제 리뷰어의 GitHub APPROVED 및 필수 CI SUCCESS**를 받아야 합니다. 에이전트 COMMENT는 인간 승인과 다르며, 사용자가 특정 PR에 대해 직접 승인/병합을 지시한 예외는 **해당 요청에 한정해 정직하게 기록**합니다.
- 새 PR에는 테스트 명령/환경/정확한 SHA, PASS/FAIL/SKIP/NOT_RUN, 권한/원본/배포 범위, 미완료 인수와 rollback을 표기합니다. 타인의 작업 브랜치를 강제 정리하지 않습니다.
- 문서 전용 정리는 제품 최신 계약/상태와 일치시키되 **과거 PR 진행일지·동결된 숫자·이미 종료된 이슈를 현행 TODO로 남기지 않습니다**. 필요 증거는 Git commit/issue/Actions에서 별도로 조회합니다.
- `RELEASE_BLOCKED`, production guard, `AI_ENABLED=false`, Laya OFF 유지. 실제 Google/학교메일/운영 NCP·PG migration/유료 OCR/HCX/실학생 반입은 사전 승인과 #252 현장 인수 전 실행 금지.
