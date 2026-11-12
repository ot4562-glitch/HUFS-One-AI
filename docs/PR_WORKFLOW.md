# HUFS One AI — PR 리뷰·검증·병합

현재 `main`과 실제 등록된 코드/계약·테스트를 정본으로 판단합니다. 이슈/PR 숫자 또는 이전 커밋 PASS를 최신 코드 검증으로 전용하지 않습니다.

## 2026-11-11 사용자 지시 — 최신 HEAD 협업자 승인 없이는 병합 금지 (현행 우선)

- 과거 2026-11-09의 독립 리뷰 선택 및 자동 검사 폐기 지침은 **이후 사용자 지시로 변경**되었습니다. 아래 2026-11-09 내용은 역사적 기록으로만 읽으며 현재 병합 권한을 부여하지 않습니다.
- 작성자와 **다른 팀 협업자** 1명 이상이 **정확한 현재 PR HEAD**의 변경 코드를 검토해 GitHub `APPROVED`를 제출해야 합니다. 작성자 COMMENT, CI 성공, 단순 리뷰 요청은 승인에 해당하지 않습니다. HEAD를 수정하면 다시 승인받아야 하고 보류된 `CHANGES_REQUESTED` 상태는 해결되어야 합니다.
- 실원본/권리·NCP·DB migration·보안 계약은 해당 담당자의 추가 검토를 요청하고 실제 운영·권한 인수와 코드 병합을 구분합니다. 서버·실원본·일회용 PG의 실제 승인은 별도입니다.
- `.github/workflows/independent-collaborator-review.yml`은 신뢰된 main의 읽기 전용 리뷰 검사를 수행합니다. **저장소 관리자**가 기본 브랜치 branch protection/ruleset에서 "PR 필수", "리뷰 최소 1", "최신 변경 시 승인 무효화", "필수 리뷰 체크"를 직접 설정해야 하며, 이 코드의 추가만으로 설정이 활성화되지는 않습니다.
- 2026-11-11 당시 #456–#462의 과거 병합 승인 부재는 소급 승인으로 변경하지 않습니다. 후속 수정 PR #463 및 기능 PR #464–#465는 협업자 승인 전 병합하지 않습니다.

## 2026-11-09 최신 PR 병합·리뷰 정책 적용 스냅샷

- 이전 검수의 9건(#424/#420/#402/#403/#404/#409/#407/#408/#422)과 후속 6건(#361/#372/#405/#406/#410/#421), **15개 코드·의존성 PR이 실제 병합됐습니다.** 추가로 정책 [#425](https://github.com/ot4562-glitch/HUFS-One-AI/pull/425)가 [88b7814](https://github.com/ot4562-glitch/HUFS-One-AI/commit/88b7814a1317bc7856ee04ca83b294f2d9eee465)로 병합돼 이번 이력에서 최종 문서 [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419)의 [main `fd55ba0`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/fd55ba033b88a44deda159ef8fca4a30f7e84cea)까지 **총 17건 병합**을 확인했습니다. [현행 STATUS](../STATUS.md)에 추가 6건의 정확한 main 병합 SHA가 있습니다.
- 사용자가 승인 검사용 `exact-HEAD independent approval`의 자동 실패를 중단하도록 명시했고, 실제 병합된 [#425](https://github.com/ot4562-glitch/HUFS-One-AI/pull/425)는 워크플로·그 전용 테스트·CI checkout 참조를 제거했습니다. **일반 기능/보안 CI는 유지**하며 담당 에이전트는 이 문서의 diff·안전성·CI 검토를 실제로 수행하고 불확실성/미승인을 정직하게 표시합니다.
- 최종 문서 [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419)는 [main `fd55ba0`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/fd55ba033b88a44deda159ef8fca4a30f7e84cea)로 병합했고, 기능/보안 CI를 유지하며 [OPEN PR 0건](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)을 확인했습니다. 과거 시점의 7개 OPEN 기록은 역사적 정보이며, 매 작업 시 실제 GitHub를 다시 확인합니다.

## PR 협업 검토 운영 지침 — 2026-11-09 사용자 지시로 자동 승인 강제 제거

**GitHub Actions가 외부 협업자 `APPROVED` 또는 exact-HEAD 리뷰 유무 때문에 실패하도록 하지 않습니다.** 자동 차단 워크플로 `.github/workflows/independent-pr-review.yml`과 이에 종속된 테스트를 제거하고, 사람 리뷰 원칙은 문서 가이드로 유지합니다. 승인 미수신을 코드·보안 테스트 실패로 표시하지 않습니다.

- 작성자 외 담당자의 교차 리뷰는 **권장 운영 원칙**입니다. CODEOWNERS는 담당자 안내이며 승인 없는 PR을 사람 승인 완료로 기록하지 않습니다. 에이전트/작성자 COMMENT를 타인 `APPROVED`로 주장하지 않습니다. **2026-11-09 소유자 지시로 본선 전 자기 담당 기술 이슈 9건의 개발 코드 검수는 ChatGPT의 실제 diff·반례·HEAD CI 검수로 수락**했으며, 공식자료 게시권·실운영·실계정/릴리스 승인과 구별합니다. 후속 책임은 #359·#360으로 이관했습니다.
- 에이전트는 PR diff·계약·개인정보·현재 HEAD의 기능/보안 CI·충돌·검토 의견을 검증하고 실제 버그나 실패한 필수 테스트를 먼저 수정해야 합니다. 테스트하지 않은 영역을 `PASS`로 꾸미지 않고, 팀원이 지적한 위험과 미해결 인수를 남깁니다.
- 사람의 `CHANGES_REQUESTED`와 리뷰 스레드는 결함인지 검토하고 수정·답변하되, 그 상태 자체를 별도 자동 승인 체크로 병합 차단하지 않습니다. GitHub 리뷰 `APPROVED`를 에이전트가 사람 대신 조작하지 않습니다.
- **이번 2026-11-09의 일괄 PR 수정·병합은 사용자 명시적 허용**에 따릅니다. 향후에도 자동 승인 강제 CI 없이 직접 검수하고, 출시·학교 원본 사용·유료 AI/NCP 운영 등 고위험 변경에는 별도 사람/권리자의 실제 승인이 필요합니다.
- GitHub 저장소 관리자 Settings의 required status checks/branch protection은 이 파일 수정만으로 자동 해제되지 않습니다. 저장소 Ruleset API는 빈 목록이나 Branch protection 조회는 제한되어, 이 이름이 서버에서 필수 지정됐는지 확인할 수 없으면 관리자가 확인해야 합니다.

**PR 병합과 정식 출시를 혼동하지 않습니다.** 공식 출처·개인정보 동의·인적 Gold·운영 DB·NCP/HCX 실제 실행이 검증되지 않았다면 `RELEASE_BLOCKED`를 유지합니다.

### 사후 검토 부채

2026-11-09에 다른 팀원의 `APPROVED` 없이 `#399/#400/#401/#411`이 병합된 사실을 당시 리뷰 API로 확인했습니다. **당시 강제 정책 기준에서는 미준수였지만, 이제 자동 승인 의무 규칙은 사용자 지시로 폐기되었습니다.** 과거 기록에 실제 없었던 승인이나 사람이 하지 않은 평가를 소급 생성하지 않습니다. 각 SHA의 코드·보안/자료 영향을 교차 검토해 필요하면 **별도 수정 또는 되돌리기 PR을 실제 CI·코드 확인 후** 처리하고, 실서비스 권리/보안 수락은 따로 남깁니다. 원본 파일/기록 force push로 감추지 않습니다.

### 과거 승인 강제 검사 [#415] — 2026-11-09 제거

PR #415로 도입된 `exact-HEAD independent approval` 자동 검사는 사용자 지시로 제거되었습니다. 과거 해당 작업의 실패는 대개 미승인으로 인한 것이지 제품 코드 테스트 실패가 아니었습니다. 검사의 역사적 실행 결과와 팀원 리뷰 기록은 보존하지만 **현재 필수 병합 조건이 아닙니다.** GitHub Settings에서 해당 검사 이름을 Required check로 지정했다면 관리자가 별도로 해제해야 합니다. 관련 [#416](https://github.com/ot4562-glitch/HUFS-One-AI/issues/416)은 변경된 운영 정책을 기준으로 재검토합니다.

## 2026-11-09 1차 당시 검수 결과 (현행 병합 현황은 최상단)

- [PR #386](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386) (HEAD `0fdb638`): 중복 요건/경험 ID 격리와 순서 반전 회귀 확인, 다른 계정의 AI QA APPROVED 및 오너 [APPROVED](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386#pullrequestreview-5820570040). HEAD 5종 Actions SUCCESS, 과거 차단 스레드 2건 해결 후 [`e8d3c9c`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e8d3c9c73849bec36b7fe686de2c56e6aa71c5b9)로 **squash MERGED**. #347은 AI 코드 일부 완료이며 API/UI·실원장·사람 Gold 미완으로 OPEN.
- [PR #361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) (HEAD `72fc402`): [REQUEST_CHANGES](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361#pullrequestreview-5820574395). `없는`을 서술어 부정으로 인식해 근거와 반대인 답변을 통과시키는 결함; 인용문-서술어 극성 회귀/수정 필요.
- [PR #372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) (HEAD `1798c55`): [REQUEST_CHANGES](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372#pullrequestreview-5820574572). 문자열 유사도가 높은 서로 다른 기관명도 `SAME` 판정; `ISSUER_UNCERTAIN` 보류 경계/회귀 필요.
- **이슈 26건 OPEN**: 읽기 전용 역할 #355–#359(5), 자료 #360(1), 신규 기능 13, 남은 기술/보안 결함 #362/#366/#367/#373/#375/#378/#381(7). 이번 검토에서는 전체 DoD가 충족된 신규 이슈가 없어 추가 강제 종결 없음. #341/#346/#347에 진행 기록 댓글만 추가.
- 운영/사람 인수, 유료 HCX/OCR, 실제 학교·학생 데이터 권리, 독립 Gold는 합성 CI와 별도입니다. **`RELEASE_BLOCKED` 유지.** [11/09 감사 원장](REVIEW_AND_ISSUE_AUDIT_20261109.md) · [현행 STATUS](../STATUS.md).

## 2026-11-08 검토 당시 리뷰·병합·이슈 대조 (역사적 기록)

새로 작성된 PR **#391–#396 총 6건**은 각각 최신 HEAD의 실제 diff/부정시험/권한·자료·운영 영향을 검토한 뒤 GitHub **COMMENT** 리뷰를 제출하고, 사용자 지시에 따라 exact `expected_head_sha`를 확인해 main에 squash 병합했습니다. 이 6건은 동일한 오너 계정 `ot4562-glitch`이 작성했으므로 GitHub의 **작성자 본인 APPROVE 금지**를 우회하거나 COMMENT를 독립 사람 승인으로 기록하지 않습니다.

| PR | 리뷰 ID | 병합 SHA |
| --- | --- | --- |
| [#391](https://github.com/ot4562-glitch/HUFS-One-AI/pull/391) | `5818347733` | `3fa8f3ce6a819382c5e349d768ce0837e0396be9` |
| [#392](https://github.com/ot4562-glitch/HUFS-One-AI/pull/392) | `5818347868` | `736a1294371a5fc983ba55be96bb01bda9b3eaba` |
| [#393](https://github.com/ot4562-glitch/HUFS-One-AI/pull/393) | `5818348002` | `307ad29b5422a664405cf698e95526859cacc1cd` |
| [#394](https://github.com/ot4562-glitch/HUFS-One-AI/pull/394) | `5818348703` | `85de975d5102ba7f95d2b598c8e518ee5d5c92db` |
| [#395](https://github.com/ot4562-glitch/HUFS-One-AI/pull/395) | `5818348867` | `234d072ac8c292316851f5f653faa1a2ca23033b` |
| [#396](https://github.com/ot4562-glitch/HUFS-One-AI/pull/396) | `5818348993` | `be2e8566fd64717753e32441f75f3a8de8fa6d29` |

정확한 PR HEAD에서 TASK-00/Chrome/NCP(해당하는 경우 Pages 및 #394 자체 npm audit) 모두 SUCCESS였습니다. **병합 후 새 main SHA의 자동 테스트·독립 사람/실운영 수락은 별개**입니다. 특히 #396은 operator source 포트 조립만 완료되어 #367 OPEN, #394는 SCA 코드만 완료되어 Dependabot/CodeQL 설정 확인 전 #378 OPEN입니다.

**2026-11-08 당시 변경 요청 상태였던 3건 — 현재 모두 수정·병합 완료:** [#361 FAQ](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) → [`569e938`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/569e9382dd15b536e95ab3fde055442529e7fecc), [#372 OCR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) → [`4e1a962`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/4e1a962049d1a4c24475b0d69d542a35869e2411), [#386 NCS](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386) → [`e8d3c9c`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e8d3c9c73849bec36b7fe686de2c56e6aa71c5b9). 당시 `CHANGES_REQUESTED`는 사실이나 지금 열린 PR로 해석하지 않습니다. 수정 코드를 반영했다고 공식 자료·운영/사람 인수까지 완료한 것은 아닙니다.

[PR별 head/review/merge와 이슈 정리 전체 원장](REVIEW_AND_ISSUE_AUDIT_20261108.md) · [최신 상태](../STATUS.md).


## 에이전트가 새 이슈를 만들거나 PR과 연결할 때

[신규 에이전트 이슈 생성 표준](ISSUE_ASSIGNMENT_PLAYBOOK.md)에 따라 제목 **맨 앞의 표준 접두어** `[추가 기능]`, `[데이터 요청]`, `[웹 구현]`, `[AI 구현]`, `[AI QA]`, `[기술 통합]`, `[분류 검토]`, `[버그]`, `[실증 인수]` 중 정확한 유형을 사용합니다. `[코드 전수조사]` 또는 `[TASK-xx]`는 후속 태그입니다. 새 PR의 본문에 연결된 이슈 번호, 담당 영역, 예상 난이도/실제 검증 근거를 적고, 분리된 AI·웹·데이터 작업은 별도 이슈로 추적합니다. **PR #382는 main에 병합되었지만**, 실제 이슈 생성/변경 이벤트가 워크플로를 성공적으로 실행하고 예상 담당·라벨을 적용했는지는 [Actions](https://github.com/ot4562-glitch/HUFS-One-AI/actions)에서 건별 확인하세요. 고정 역할 이슈 #355–#359는 쓰기 금지입니다.

**신규 규칙:** `[버그][코드 전수조사]`는 `type:bug`·`source:code-audit`를 표시하되 분류가 불명확하면 사람 검토, `[실증 인수]`는 독립 실제 환경/사람·권리/비용 검증으로 자동 배정·완료 처리하지 않는다. `P0`(또는 `priority:P0`)와 보안·개인정보 신고는 `triage:needs-review`로 자동 담당 배정을 보류한다. 비밀·실학생 자료·취약점 세부 내용은 공개 이슈가 아닌 비공개 채널로 전달한다. 새 표준 접두어의 단일 정본은 [라우팅 설정](../.github/issue-routing.json)이며, 데이터 정정에는 `[데이터 요청][정정]`을 사용한다.

## 현재 신규 기능/데이터 협업·PR 인계 규칙 (2026-11-08)

- **고정 역할 이슈 #355–#359는 읽기 전용**으로 모든 쓰기(제목·본문·댓글·담당자·라벨/상태 포함)를 중단한다. [이슈 배정 플레이북](ISSUE_ASSIGNMENT_PLAYBOOK.md)을 우선 적용한다.
- **신규 `[추가 기능]`:** 심민성을 최초 assignee로 지정해 가능한 비AI Core/Contracts/API/DB/보안·통합·단위/계약 테스트 구현을 최대한 진행한다. **HCX-007/OCR/NLP/RAG뿐 아니라 규칙·가중치·랭킹/추천·예측 등 코드 기반 AI를 구현하게 되면 박준영 또는 이의상에게 해당 코드를 인계**한다. 기능 AI 주작성자/상대 교차검토자·계속 진행하는 심민성의 일반 통합 코드를 기능 이슈 댓글/PR에 명확히 기록한다.
- **실데이터 의존성:** 데이터가 필요하면 별도 `[데이터 요청][김채윤]` 이슈를 만들고 김채윤을 기능 공동 assignee로 지정한다. 지금 13개 기능은 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)의 자료를 공통 인수한다. 데이터/권리/Gold 준비는 코드 PR의 실사용 검증과 구분한다.
- **협업:** 이의상↔박준영 AI 교차 리뷰, 박준영 AI 제품 QA·재시험, 김채윤 실제 데이터 직접 입력·경량 사용자 시연/제보, 이서연 실웹 UI/UX·API 배치, 심민성 상시 통합 리뷰를 기능별로 적용한다.
- **인수:** 정확한 변경 HEAD CI·권한/출처/Gold·실제 기능 배치·독립 사람/운영 수락은 서로 다른 근거다. PR OPEN/합성 테스트 PASS는 종료·출시 근거가 아니다.

## 최신 리뷰·병합 결과 (2026-11-06)

| PR | 실제 변경과 확인 | 리뷰 / 처리 |
| --- | --- | --- |
| [#305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305) | HEAD `f7fa7f3` vs `main 462f6d3`에서 3 commits ahead이지만 **changed files 0**, #306 통합으로 중복 | [COMMENT 코드 리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305#pullrequestreview-5797569357) → **CLOSED, NOT MERGED** (의미 없는 빈 merge 방지) |
| [#307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307) | 합성 홈 3단계·공고 현재 목록 검색/조건/마감 필터·정렬, 키보드·360px/reduced-motion E2E. HEAD `ba7bf2a`의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685945)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685929)·[NCP](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182686098)·[Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685963) **4/4 SUCCESS** | [COMMENT 리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307#pullrequestreview-5797568875) → **MERGED** [`d8e2144`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/d8e2144184d06577ff76d8e5e1ed3a13be09af4c) |

#307은 #306 합성 통합 이전 분기에서 시작했으나 GitHub가 충돌 없이 병합했습니다. 병합 후 `main d8e2144`의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797571)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797686)·[NCP](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797648)·[Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797515) **4/4 SUCCESS**도 직접 확인했습니다. **병합 전 PR HEAD 4/4와 병합 후 main SHA의 4종 실행은 서로 다른 검증**입니다. 리뷰 제출 계정이 #307 작성 계정과 동일하므로 `COMMENT`를 외부/독립 팀원 `APPROVED`로 주장하지 않습니다. 자동 탐색 기능은 허용된 projection에 한정되고 사람·실인증·실배포 인수는 #280/#297/#299 및 #276에 남겨 둡니다. #298의 날짜 `asOf`와 실제 기기 수락 항목도 OPEN입니다.

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
4. **당시 운영 기록(2026-11-06, 현재 폐기된 승인 강제):** 당시는 비작성자의 HEAD `APPROVED`를 필수로 적어 뒀습니다. **현재는 문서 최상단의 2026-11-09 사용자 지시를 우선 적용**합니다. 새 HEAD의 변경·결함·보안·필수 CI와 사람 의견은 반드시 직접 검토하되, 자동 외부 승인 검사 실패는 병합 차단 근거로 사용하지 않습니다.
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
