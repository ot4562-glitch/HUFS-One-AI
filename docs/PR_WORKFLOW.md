# HUFS One AI — PR 리뷰·검증·병합

현재 `main`과 실제 등록된 코드/계약·테스트를 정본으로 판단합니다. 이슈/PR 숫자 또는 이전 커밋 PASS를 최신 코드 검증으로 전용하지 않습니다.

## 최신 리뷰·병합 결과 (2026-11-06)

| PR | 실제 변경과 확인 | 리뷰 / 처리 |
| --- | --- | --- |
| [#305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305) | HEAD `f7fa7f3` vs `main 462f6d3`에서 3 commits ahead이지만 **changed files 0**, #306 통합으로 중복 | [COMMENT 코드 리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305#pullrequestreview-5797569357) → **CLOSED, NOT MERGED** (의미 없는 빈 merge 방지) |
| [#307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307) | 합성 홈 3단계·공고 현재 목록 검색/조건/마감 필터·정렬, 키보드·360px/reduced-motion E2E. HEAD `ba7bf2a`의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685945)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685929)·[NCP](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182686098)·[Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685963) **4/4 SUCCESS** | [COMMENT 리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307#pullrequestreview-5797568875) → **MERGED** [`d8e2144`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/d8e2144184d06577ff76d8e5e1ed3a13be09af4c) |

#307은 #306 합성 통합 이전 분기에서 시작했으나 GitHub가 충돌 없이 병합했습니다. **병합 전 PR HEAD 4/4와 병합 후 main SHA의 4종 실행은 서로 다른 검증**입니다. 리뷰 제출 계정이 #307 작성 계정과 동일하므로 `COMMENT`를 외부/독립 팀원 `APPROVED`로 주장하지 않습니다. 자동 탐색 기능은 허용된 projection에 한정되고 사람·실인증·실배포 인수는 #280/#297/#299 및 #276에 남겨 둡니다. #298의 날짜 `asOf`와 실제 기기 수락 항목도 OPEN입니다.

## 2026-11-06 이전 열린 PR 전수 리뷰 및 병합 기록

이 절부터 아래 날짜별 기록은 본선 전 11개 이슈 통합 이전의 이력입니다. 현재 구현·이슈 범위는 [STATUS](../STATUS.md), 최신 HEAD·CI·종결 사유는 각 PR/이슈의 최신 기록을 따릅니다. 아래 과거 시점의 OPEN/미연결 문구를 현재 상태로 사용하지 않습니다.

- 병합 전 열린 PR은 #292/#293/#295/#304의 **4건**, 각 PR의 **정확한 HEAD Actions 4/4 SUCCESS** 확인 후 squash merge 완료. 현재 코드 병합 마지막 SHA [`5c17255`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/5c172552a8145cec61ac8f1729b60b1514fc965d).
- [PR #292](https://github.com/ot4562-glitch/HUFS-One-AI/pull/292) HEAD `4208c33` → `e0a5b73` (추가 COMMENT 리뷰): 학업 참조모형/한계.
- [PR #293](https://github.com/ot4562-glitch/HUFS-One-AI/pull/293) HEAD `f85eb3c` → `02e7d91` (기존 COMMENT 리뷰 확인): 합성 공지 최신 판본·mock claim 및 clean HEAD 벤치.
- [PR #295](https://github.com/ot4562-glitch/HUFS-One-AI/pull/295) HEAD `251fe5b` → `81a9f53` (COMMENT 리뷰): 교과코드 미확인 원장/전망 코어, 실제 API 연결은 남음.
- [PR #304](https://github.com/ot4562-glitch/HUFS-One-AI/pull/304) HEAD `d9617f9` → `5c17255` (작성자 본인 PR COMMENT 리뷰): 공개 Pages 자동 재배포 유지, UI 합성 개선, 실인증은 미구현.
- **예외 사유:** 이번에는 사용자가 저장소의 열린 PR 전수 병합을 직접 지시했습니다. 일반 비작성자 `APPROVED` 권장 게이트의 예외로 처리했으며 자동 COMMENT를 독립 사람 APPROVE로 기록하지 않습니다. 실제 프로덕션 출시 게이트는 해제하지 않습니다. `main`의 각 병합 SHA와 문서 후속 SHA의 Actions는 각각 따로 판단합니다.

## 코드·계약·보안 PR의 기본 검토

1. PR은 담당 소유권/변경 대상 계약·실제 결함/반례와 인가·자료/AI·migration·lockfile·출시 영향 범위를 명시합니다.
2. 비교 대상은 **최신 HEAD SHA**와 main diff. 접근권/데이터 범위·race/취소/철회·로그/자산/시점·다중탭/SQL role·fail-closed/rollback 위험을 검토합니다.
3. 같은 HEAD의 GitHub Actions **합성계약·실제 일회용 PG·Chrome·NCP IaC(mock)** 중 영향을 받는 필수 워크플로를 확인합니다. FAIL/SKIP/NOT_RUN은 그대로 보고하고, 실패를 성공 재실행만 골라 숨기지 않습니다.
4. 일반 규칙: 작성자가 아닌 실제 리뷰어의 `APPROVED`와 미해결 `CHANGES_REQUESTED`/스레드 해소, 필요한 CI SUCCESS, mergeable/base/HEAD를 모두 확인한 후 병합합니다. 자동 에이전트 COMMENT는 사람 APPROVED가 아닙니다. 사용자가 특정 PR에 직접 병합을 지시한 예외는 **그 PR에만** 적용하고 사실대로 기록합니다.
5. merge 후 동일 SHA의 main Actions·영향 받은 API/화면을 재확인합니다. 프로덕션/실계정/원본/유료 AI/NCP apply·RELEASE_BLOCKED 해제는 **PR 병합과 별도 승인**입니다.

## 2026-11-06 코드 리뷰·병합 근거

- [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) forecast PR HEAD `76523ce`에서 Actions **4/4 SUCCESS**, formal GitHub **APPROVE**, merge [`5a36a38`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/5a36a38494d03e36c7d7f4b1b4cf274963d49004).
- [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) opportunities PR HEAD `2442ca0`에서 Actions **4/4 SUCCESS**, formal GitHub **APPROVE**, merge [`48134da`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/48134dae3b16157ebcc294f744c320fdd64a115c). 별도의 UI 소비자 리뷰는 #258에서 계속.
- 병합 코드 기준 `main` SHA `48134da`에서 TASK-00/Chrome/NCP offline/합성 Pages Actions **4/4 SUCCESS**. 리뷰를 통해 코드를 확인했지만 **실제 독립 사람 Gold/운영·기관 인수/실학생 권리는 완료하지 않음**.
- #278/#279 병합 직후(중간 시점) 열린 PR은 **0건**이었지만, 같은 날 새로운 #285–#289가 열렸고 후속 검토·통합을 진행했습니다. 현재 열린 PR은 GitHub의 [열린 PR 목록](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)으로 확인합니다.

## 2026-11-06 #285–#289 개별 코드 리뷰와 충돌 해결

- 오너의 이번 **열린 PR 일괄 리뷰·병합 요청**을 #285–#289에 한정하여 처리합니다. PR HEAD의 4종 Actions 성공, 변경 파일·범위·잔여 위험을 확인하고 각각 **GitHub `COMMENT` 리뷰**를 등록했습니다. **실제 비작성자 사람 `APPROVED`로 오인하지 않습니다**. 이전/다음 PR의 병합 승인으로 일반화하지 않습니다.
- [#285](https://github.com/ot4562-glitch/HUFS-One-AI/pull/285): 합성 UI만 포함, `/experience` 라우트와 실 API/`jobId` #284 미완료. [#286](https://github.com/ot4562-glitch/HUFS-One-AI/pull/286): `id` + `revisionId` 결정성 수정, 기본 평가 보고서는 r1 그대로이며 벤치 숫자는 작업트리 dirty에서 측정. [#287](https://github.com/ot4562-glitch/HUFS-One-AI/pull/287): 판본별 영역 분류가 없으면 UNKNOWN/NEEDS_REVIEW. [#288](https://github.com/ot4562-glitch/HUFS-One-AI/pull/288): 20과목은 학생 전망 제한, rolling-origin 평가 한도는 200. [#289](https://github.com/ot4562-glitch/HUFS-One-AI/pull/289): 테스트/속성 커버리지 범위와 독립 오라클 미측정을 구분.
- #287과 #289의 `packages/core/src/academics/AGENTS.md` 동시 끝줄 추가가 **실제 405 충돌**로 나타났습니다. #289의 통합 브랜치에 두 문구를 보존하고 `main`을 부모로 합친 merge commit [`82eb760`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/82eb760ce213c83bb173ea9af0d28c1c075c0cc1)을 만들었습니다. 새 HEAD 4종 검증을 확인하고 병합합니다. **CSV/원격 인프라 설정은 건드리지 않습니다.**
- 당시 PR의 합성 CI `PASS`와 실제 사람·학생·학교·NCP/PG/유료 AI의 `NOT_RUN`을 구분했고, #10/#11/#258의 세부 체크만 완료 범위에 맞게 고쳤습니다. 그 시점의 #284/#260/#276/#280–#283은 OPEN이었습니다. 현재 상태와 이관한 미실행 항목은 STATUS와 각 이슈를 확인합니다.

### 같은 날 추가 생성·병합된 UI [#290](https://github.com/ot4562-glitch/HUFS-One-AI/pull/290)

- 최초 열린 PR #285–#289을 리뷰/병합하는 도중 #290이 추가 등록되었습니다. 기존 일괄 승인으로 취급하지 않고, **21개 변경 파일·A11 계약 변경·새 shell/area 라우팅·미지원 원래 메뉴 비링크/권한/접근성 경계**를 별도로 리뷰하고 `COMMENT` 의견을 제출했습니다.
- HEAD `1239a06`의 TASK-00/Chrome/NCP offline/Pages 4/4 SUCCESS 후 [`6863866`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/686386646654b2b64f8ba2333c0c285982976f9d)로 병합했습니다. 11분류는 **관찰 메뉴 구조**이며 원래 HUFSAbility 실제 기능·공식 학교 승인·NVDA 실기기 인수를 주장하지 않습니다. #9에 합성 구현만 완료 체크, 나머지 QA와 운영 #280은 OPEN.

## 안전한 변경과 기록

- 수정 파일/코드 계약·버전, 정상·부정/경쟁 테스트, 테스트 명령·환경, SHA, PASS/FAIL/SKIP/NOT_RUN, reviewer 논의·관련 병합 PR/현행 #276 운영 인수 링크를 남깁니다.
- 타인 dirty worktree, 미병합 PR/브랜치·backup은 임의 reset/clean/force push하지 않고 먼저 관계를 확인합니다.
- 현재 코드·API/계약/문서만 설명하고 오래된 실행일지/일회용 작업 수치를 활성 문서에 누적하지 않습니다. 증거는 PR/Actions/issue 링크로 조회합니다.
- 비밀키/실원본·학번↔실명·모델 입력·과금 식별자는 PR/CI/로그/스크린샷에 넣지 않습니다.

**개발/협업:** [AGENTS](../AGENTS.md), [현재 상태](../STATUS.md), [워크스트림](WORKSTREAMS.md).
