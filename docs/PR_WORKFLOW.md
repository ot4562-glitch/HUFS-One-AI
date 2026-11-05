# PR 운영과 브랜치·이슈 정리 기준

## 2026-11-05 최신 PR 및 독립 검토 기록

- [#218](https://github.com/minseong-hufs/HUFS-One-AI/pull/218) (merge `8e0efb5`)과 [#217](https://github.com/minseong-hufs/HUFS-One-AI/pull/217) (merge `6445fc4`)은 각각 기존 CHANGES_REQUESTED에 대한 재현 회귀·수정 커밋을 확인하고, 최신 수정 HEAD의 합성 TASK-00/NCP/Chrome CI **3/3 SUCCESS** 뒤 **이번 사용자 요청에 의한 통합 예외**로 병합했다. 자동 검토자는 `COMMENT`만 남겼고, 독립 사람 `APPROVED`가 존재했다고 주장하지 않는다.
- [#219](https://github.com/minseong-hufs/HUFS-One-AI/pull/219)은 SQL 풀의 역할·TLS·시작/종료 검증 우회 지적을 해결하기 위한 후속 커밋과 합성 회귀를 제출했다. 최신 HEAD `1bcf820`에서 TASK-00/NCP IaC/Chrome CI **3/3 SUCCESS**를 재확인했고, 기존 검토자에게 독립 재승인을 요청했다. 역방향 프록시의 검증된 client-IP 제한 등 **남은 보안 경계와 독립 사람 리뷰가 충족되기 전 병합 금지**.
- [#220](https://github.com/minseong-hufs/HUFS-One-AI/pull/220)은 127개 파일 변경의 Draft로, 초기 최신 HEAD에서 BETA 세션의 `ADMIN` 응답을 잘못 허용하여 TASK-00 1건 실패가 재현되었다. `apps/web/src/integrations/api-client.ts`의 BETA 역할 스키마에서 `ADMIN`을 거부하도록 처음 `8340157`로 BETA-only를 강제했으나 기존 #123 ADMIN 전용 브라우저 테스트와 충돌했다. 최종 수정 `0d8e176`에서 ADMIN 신원 스키마를 별도 구성하고, **ADMIN은 BETA owner 및 REVIEWER 권한에서 거부됨**을 별도 테스트로 교차 검증하도록 고쳤다. 최신 HEAD `0d8e176`의 [TASK-00](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41938193911)/[NCP IaC offline](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41938193898)/[Chrome](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41938193819) **3/3 CI SUCCESS**. 그러나 비작성자 사람 리뷰 및 실운영·자료·의존성과 인적 검증 경계가 **완료되기 전 READY·병합·상위 이슈 종료 금지**.
- 실제 OIDC/학교메일·운영 PostgreSQL/RLS·NCP/TLS·4인 개인자료·독립 추천 gold 200은 실행 또는 사람 수락 증거가 부족하다. `RELEASE_BLOCKED`, AI 유료 실행 OFF 및 문서/이슈의 `NOT_RUN`을 유지한다.

**아래 2026-11-04의 PR 0건 및 스택 통합 기록은 당시 날짜의 역사 스냅샷이며 현행 숫자가 아니다.** 실제 최신 HEAD/CI 및 15개 정본 이슈는 [STATUS](../STATUS.md)에서 추적한다.

## 2026-11-04 PR 전수 통합 예외: 완료 상태

- 사용자 명시 요청에 따라 [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216)을 **main f23b86bb**에 원본 HEAD 조상을 보존하는 merge commit으로 반영했고, **열린 PR 0건**이 됐다. 비작성자 GitHub `APPROVED`가 없던 **한 번의 사용자 예외**이며 작성자·에이전트 COMMENT를 사람 APPROVED라고 주장하지 않는다.
- 개별 10개 스택 PR은 `CLOSED / NOT MERGED`지만 그 **각 PR 최신 HEAD가 main의 Git 조상임을 10/10 증명**. 따라서 커밋/코드 누락 없이 중복 PR을 종료했다. 원본 브랜치 강제 삭제·이력 rewrite는 수행하지 않았다.
- main 통합 HEAD 3종 Actions [TASK-00](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41815023022)·[NCP IaC](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41815022904)·[Chrome](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41815022895) **3/3 SUCCESS**. 실제 NCP/OIDC/기관·학생 원본/외부 공개는 계속 NOT_RUN·RELEASE_BLOCKED.
- **이하 반복 가능한 일반 PR 기본 규칙은 유지.** 이번 사용자 예외가 향후 PR·실서비스 공개/유료 NCP 승인을 자동 허용하지 않는다. 이전 회차의 열린 PR 32/33건, 승인 대기 등은 당시 기준의 기록이며 현재 상태가 아니다.


## 2026-11-04 사용자 예외 전수 통합 — 과거 스냅샷 정정

- **현재 열린 PR 0건**. 사용자의 **이번 회차에 한한 작성자 PR 포함 직접 병합 지시**로 통합 [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216) merge commit `f23b86bb693a163c7f6a0330d1b9657c684724ff`가 main에 반영됨. 원본 PR HEAD는 통합 조상으로 보존, #216 최신 HEAD `c2376759` TASK-00/Chrome/NCP IaC SUCCESS. 161파일 통합/회귀 수정. **에이전트 COMMENT ≠ 비작성자 APPROVED**, 실제 승인 없음을 명시하며 향후 일반 PR 기본 독립 리뷰 게이트는 변경하지 않는다.
- 통합 전 스택 PR #215/#214/#213/#211/#210/#209/#208/#204/#185/#175 등은 GitHub에서 **CLOSED·unmerged**로 나타날 수 있다. 통합본에 변경이 들어간 것과 원본 PR의 `merged_at` 존재는 다르다. 개별 PR 상태를 임의 `MERGED`로 정정하지 않는다.
- 이후 병합·이슈 업데이트 시 `main` SHA 및 실제 파일·CI·운영 증거를 재확인한다. 실 Google/PG/NCP/SSH/TLS/자료·권리 검증은 NOT_RUN, #89 `RELEASE_BLOCKED`. 과거 32건/36건 표는 **역사 스냅샷**이다.


> 이 문서는 **현재의 반복 가능한 규칙**을 정리합니다. 일회성 과거 PR·CI 로그는 [각 Pull Request](https://github.com/ot4562-glitch/HUFS-One-AI/pulls?q=is%3Apr+is%3Aclosed)와 [이 문서의 Git 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/docs/PR_WORKFLOW.md)에 보존합니다. 현재 HEAD·이슈 상태는 [STATUS](../STATUS.md)와 GitHub에서 확인합니다.

## PR 최소 병합 게이트

1. **한 작업·한 책임자·한 브랜치·한 주 PR**을 기본으로 하고, 변경한 공용 계약·타 팀 소비자·파일 소유를 PR에 명시합니다. 기존 dirty worktree/공동 브랜치 덮어쓰기·reset/clean/force push 금지.
2. 최신 **HEAD SHA와 실제 diff**를 기준으로 비작성자 1명 이상의 GitHub `APPROVED`가 필요합니다. 단순 COMMENT, 작성자 본인 검토, 에이전트 자동검토를 사람의 독립 승인으로 기록하지 않습니다.
3. 같은 HEAD에서 필요한 GitHub Actions **SUCCESS**(합성/PG/브라우저 등 해당 작업의 검증 종류 확인), 테스트/빌드 PASS·FAIL/SKIP/NOT_RUN, 비동기/권한·시점/버전·컨텍스트 변경 회귀를 대조합니다. **CI SUCCESS ≠ 실제 Google·학교 원본·운영 검증**.
4. 유효한 `CHANGES_REQUESTED` 및 미해결 리뷰 스레드, 선행 PR·base·merge ancestry·현재 main 충돌을 확인합니다. squash로 선행 branch 후손이 분리되면 원래 커밋/트리와 diff를 보존하며 충돌을 해결합니다. 후속 PR은 자동 승인하지 않습니다.
5. #46 데이터 권리/과거 Git 게시·권한 및 #89 익명 노출·릴리스 차단을 우회해 실데이터·운영/공개 배포로 연결하지 않습니다. `RELEASE_BLOCKED`는 별도.
6. 조건 충족 시 최종 병합 후 해당 PR 상태/CI·커밋·이슈의 **실제로 완료된 하위 항목**만 갱신합니다. 상위 이슈의 전 기능/실사용 게이트까지 임의 완료 체크 금지.

**예외:** 소유자 승인된 문서-only `README.md`, `STATUS.md`, `AGENTS.md`, `Proposal.md`, `Architecture.md`, `docs/*.md` 정정은 blob SHA 충돌검사 후 직접 main 변경 가능. **코드, CI/workflow, API/DB, 공통 Zod, lockfile, 유료 자원/개인 원본**은 이 예외의 대상이 아닙니다. 2026-11-01의 과거 한시적 작성자 직접 병합 사례는 새 PR의 자동 승인권이 아닙니다.

## 2026-11-04 현재 리뷰·CI·병합 현황 (스냅샷; 현재 HEAD는 STATUS/PR 확인)

- **열린 PR 32건 / 일반 이슈 OPEN 40건:** #189 동일교과 순수 코어(H d33bae8 → main 5718fd2)와 #152 현재 이중전공 합성 UI(H 2f0c0ed → main 28d4827)를 HEAD 비작성자 APPROVED, 필수 TASK-00/Chrome SUCCESS, open review thread 없음, mergeable 조건 후 squash 병합했다. 각각 공식 학칙/실자료 승인 아님.
- **협업자 코드 리뷰(검토 댓글, 승인 아님):** #205 학업 seeded 원장 속성, #210 정규화 benchmark(선행 #196), #191 WIS 기초 탭, #151/#154/#155 합성 UI에 현재 HEAD/CI·경계별 COMMENT 등록. AI/comment 검토는 비작성자 **사람 APPROVED를 대신하지 않는다**. UI 3건은 main #152 병합 내용을 보존한 재통합·최신 CI 필요.
- **작성자 PR 병합 대기:** #161 최신 Laya child 격리 HEAD의 이전 승인 재사용 금지; #166 private ingress Draft; #175/#177 Provider 스택, #176 UI↔API, #178 학교메일, #180~#188 Source·PG, #190 복원, #193~#198 보안·회귀, #204/#206~#209/#211 NCP/자원/진입점 개선. 기본 CI 2개 PASS 또는 특수 NCP 오프라인 CI PASS만으로 최신 비작성자 승인 없이 병합할 수 없다.
- **스택 의존:** #204 ← #195, #210 ← #196, #208 ← #207, #209 ← #197, #211 ← #208. squash/전진 main에서는 PR이 현재 base로 재조립됐는지 다시 검사한다.
- **실행 전 재검증:** head SHA, 현재 GitHub 리뷰 승인 주체·적용 SHA, CODEOWNERS/CHANGES_REQUESTED, unresolved thread, 최신 워크플로의 실제 job conclusion·SKIP/NOT_RUN, mergeable, 선행 스택, 기본 branch의 최근 변경을 필수로 확인. 과거 HEAD 승인/CI를 현재 HEAD 승인이라고 주장하지 않는다.
- **이슈 완료는 수락 조건별:** #133의 #189 순수 코어, #144의 #152 합성 UI 같은 **하위 코드만** 완료 표시하고, 남은 공식 RulePack·권리·운영 로그인·접근성 인수 때문에 전체 이슈를 닫지 않는다. #46/#61/#89 및 RELEASE_BLOCKED 유지.

## 원격 브랜치 정리 절차

이전 브랜치 감사 기준 **총 106개**(당시 main 1/열린 PR 4/병합 PR 연계 86/닫힌 미병합 PR 연계 11/PR 없는 백업·준비 4)였습니다. **현재 재집계 값이 아닙니다.** 이후 #138/#142 병합과 #145 생성으로 분류가 변했습니다. [#142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142) 도구는 독립 리뷰·CI 후 **main 병합 완료**. 하지만 이 감사에서 확인된 실제 원격 브랜치 **삭제 0건**이고, dry-run 후보를 자동 삭제 허가로 해석하지 않습니다.

1. **무조건 보존:** `main`, 보호 브랜치, 열려 있는 PR의 head/base, 다른 사용자 worktree·운영 참조, 미확인 백업/준비 브랜치.
2. **1차 삭제 후보:** 최종 `merged_at`가 실제 기록된 **그 PR의 현재 head 브랜치**이며 지금 원격 SHA가 병합 PR head SHA와 같고, 이 브랜치를 사용하는 열린 PR이 **하나도** 없고, 별도 후속 작업/복구 용도가 없는 것. squash/rebase는 Git 부모조상 관계만으로 삭제를 결정하지 않습니다.
3. **개별 검증:** 현재 ref SHA 재조회, PR 연결/다중 PR 여부, 이후 커밋, 저장소 보호·동일 브랜치 공동사용·클론/worktree 영향, 필요시 태그/참조/PR SHA를 통한 복구 경로. 검증 실패나 API 오류는 **보존**.
4. **닫힌 미병합 PR**은 `merged_at`가 없으므로 자동 삭제 대상이 아닙니다. main 대비 고유 커밋·대체 PR·현재 권리/보존 의무 확인 뒤 별도 처리합니다. PR 없는 4개도 보존 확인 후 처리.
5. 삭제는 dry-run 목록·HEAD 고정·실행 전 최신 검증과 명시적 실행 모드를 분리하고, GitHub 삭제 권한으로만 처리합니다. **원본 4인 CSV/Forms의 과거 이력을 지우는 `filter-repo`, force push, Git 재작성은 별도 엄격한 승인·법적 검토 없이는 금지**.
6. 삭제 결과는 실제 원격 재조회로 확인하고 삭제된 개수·남은 보존 브랜치·오류·복구 기준을 [STATUS](../STATUS.md)에 기록합니다. 브랜치 개수 감소는 Git 저장소 전체 객체/크기 감소를 보장하지 않습니다.

## 이슈 정리 규칙

- 하나의 요구에는 **기존 이슈를 우선 사용**합니다. [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)는 기존 메뉴 기능/상태 **기준**, [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141)은 더 나은 독립 UX **구현·디자인**으로 분리하되 양방향 연결합니다.
- 제안에는 `enhancement`, 재현 가능한 제품 결함에는 `bug` 등 **실제 존재하는 GitHub 라벨**을 부착합니다. 라벨은 승인/완료 상태가 아닙니다.
- **현재 열린 이슈 수와 주관은 [STATUS](../STATUS.md) 및 GitHub를 재확인**하고, 정해진 5인 책임 경계를 [WORKSTREAMS](WORKSTREAMS.md)에서 유지한다. 2026-11-03 당시의 34건/닫힌 7건 목록은 역사 기록이다. 공동 assignee 11건의 주관/협업 구분을 이슈 본문 첫머리에 반영. 기존 assignees와 라벨 보존.
- 각각 **담당, 진행 상태(진행/차단/외부 검증 대기), 선행 PR/이슈, [x] 세부 증거, [ ] 미완료, 합성/운영 경계**를 읽기 쉬운 최상단에 유지합니다. 과거 상태를 새 문단으로 누적하기보다는 기존 최신 요약을 교체하고 GitHub 편집/PR 이력을 이용합니다.
- **CLOSED/completed**는 이슈 본문 전체 수락 기준이 검증됐을 때만 사용합니다. 부분 완료/계약만 완료/개인 동의는 남은 보안·출처·UI/실측 게이트를 자동 종결시키지 않습니다.
- 개인정보 보존/감사 이슈 #46, 배포 차단 #89 등은 **삭제·중복 종료보다 선행 증거 확보**를 우선합니다.

## 기본 검증 명령

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run check:privacy
npm run build:api
npm run build:web
```

실 DB/Google/NCP/실브라우저 수동 확인·외부 원문 검증은 위 명령과 독립적이며, 실제 실행하지 않은 검증은 `NOT_RUN`으로 기록합니다.
