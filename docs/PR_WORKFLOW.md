# PR 운영과 브랜치·이슈 정리 기준

> 이 문서는 **현재의 반복 가능한 규칙**을 정리합니다. 일회성 과거 PR·CI 로그는 [각 Pull Request](https://github.com/ot4562-glitch/HUFS-One-AI/pulls?q=is%3Apr+is%3Aclosed)와 [이 문서의 Git 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/docs/PR_WORKFLOW.md)에 보존합니다. 현재 HEAD·이슈 상태는 [STATUS](../STATUS.md)와 GitHub에서 확인합니다.

## PR 최소 병합 게이트

1. **한 작업·한 책임자·한 브랜치·한 주 PR**을 기본으로 하고, 변경한 공용 계약·타 팀 소비자·파일 소유를 PR에 명시합니다. 기존 dirty worktree/공동 브랜치 덮어쓰기·reset/clean/force push 금지.
2. 최신 **HEAD SHA와 실제 diff**를 기준으로 비작성자 1명 이상의 GitHub `APPROVED`가 필요합니다. 단순 COMMENT, 작성자 본인 검토, 에이전트 자동검토를 사람의 독립 승인으로 기록하지 않습니다.
3. 같은 HEAD에서 필요한 GitHub Actions **SUCCESS**(합성/PG/브라우저 등 해당 작업의 검증 종류 확인), 테스트/빌드 PASS·FAIL/SKIP/NOT_RUN, 비동기/권한·시점/버전·컨텍스트 변경 회귀를 대조합니다. **CI SUCCESS ≠ 실제 Google·학교 원본·운영 검증**.
4. 유효한 `CHANGES_REQUESTED` 및 미해결 리뷰 스레드, 선행 PR·base·merge ancestry·현재 main 충돌을 확인합니다. squash로 선행 branch 후손이 분리되면 원래 커밋/트리와 diff를 보존하며 충돌을 해결합니다. 후속 PR은 자동 승인하지 않습니다.
5. #46 데이터 권리/과거 Git 게시·권한 및 #89 익명 노출·릴리스 차단을 우회해 실데이터·운영/공개 배포로 연결하지 않습니다. `RELEASE_BLOCKED`는 별도.
6. 조건 충족 시 최종 병합 후 해당 PR 상태/CI·커밋·이슈의 **실제로 완료된 하위 항목**만 갱신합니다. 상위 이슈의 전 기능/실사용 게이트까지 임의 완료 체크 금지.

**예외:** 소유자 승인된 문서-only `README.md`, `STATUS.md`, `AGENTS.md`, `Proposal.md`, `Architecture.md`, `docs/*.md` 정정은 blob SHA 충돌검사 후 직접 main 변경 가능. **코드, CI/workflow, API/DB, 공통 Zod, lockfile, 유료 자원/개인 원본**은 이 예외의 대상이 아닙니다. 2026-11-01의 과거 한시적 작성자 직접 병합 사례는 새 PR의 자동 승인권이 아닙니다.

## 2026-11-03 현재 PR 인수 점검 — 변경 가능한 사실은 STATUS/GitHub 우선

- **GitHub 일반 이슈 OPEN 34 / CLOSED 7, PR OPEN 16.** #157 Provider 권한·PG RLS(`7ac5a06c`)와 #159 Laya OFF scheduler(`638ed77a`)는 비작성자 최신 HEAD 승인·CI 3/3 뒤 병합 완료. 앞선 #153 메뉴 정본화(`9b5cb81a`)도 main.
- **#158 SETTLED-only PG 결과(HEAD `fb135017`)와 #156 NCP 합성 SSH-preview(HEAD `6a26e8f`)**는 변경 전 이전 HEAD에 김채윤 APPROVED가 있으나 현재 HEAD에는 새 승인 없음. 현재 HEAD 3/3 CI SUCCESS와 clean은 확인. **김채윤에게 현 HEAD 재승인 요청**, 승인 확인 전 병합하지 않음.
- **#160 Raster/OCR → #165 Provider 실행기 → #167 BETA-only HTTP**는 스택 의존 관계이며 각각 CI3/3 성공/독립 최신 승인 대기. #160 main 병합 후 #165의 고유 diff/새 base·CI·리뷰, 이후 #167을 차례로 검증한다. squash로 선행 커밋 ancestry가 달라지는 상황에 주의한다.
- **#161 Laya IPC**는 #159 이후 main restack CI3/3/승인 대기. **#162 현재 이중전공, #163 EMPTY_DEMO, #164 SourceRevision PG**도 독립 리뷰/CI 통과 후만 병합. **#166** ingress/compose는 Draft·`RELEASE_BLOCKED`; **#150** 대형 WIP 83파일 Draft/충돌이며 분해 없이 병합 금지.
- **UI #151/#152/#154/#155**는 #153 이후 공통 App/main/graduation/E2E 충돌. #152의 `rowImpacts` malformed array elements 런타임 오류 가능성은 `CHANGES_REQUESTED`로 남아 있어 author의 strict 검증·음성회귀·safe rebase가 필요하다.
- **GitHub `main` 브랜치 보호는 마지막 관측 `protected=false`**. UI에서 설정이 강제되지 않더라도 위 리뷰·CI·최신 HEAD 규칙을 직접 준수하고, 보안 규칙 변경/우회로 병합을 성사시키지 않는다.
- 각 PR·이슈의 **부분 완료**는 `main` 병합 및 검증된 범위만 [x]로 표시한다. 사람/기관 원본 권리 #46(기존 privacy 2 FAIL), 독립 gold #61(0/200), 실 OIDC·학교메일·TLS/direct IP/NCP #89(`RELEASE_BLOCKED`)를 합성 CI로 대체하지 않는다. 상세 이력은 Git/PR 기록, 현재 결론은 [STATUS](../STATUS.md).

**#27 신규 선행 PR:** [#168](https://github.com/ot4562-glitch/HUFS-One-AI/pull/168) HEAD `0eceae7`, PostgreSQL 인증 조립 3파일·CI 3/3 PASS·현재 HEAD 사람 독립 승인 대기/미병합. 작성자 및 독립 에이전트 검토는 GitHub 사람 APPROVED의 대체가 아니다. [실패/범위 근거](../STATUS.md); #158·#156 현 HEAD 재승인과 #160→#165→#167 순서 유지.

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
- **열린 일반 이슈 34건 각각 주관 1명/지원 별도**, 닫힌 7건은 [담당자별 전수 원장](WORKSTREAMS.md)에 정확히 1번씩 배치(미배정·중복 0). 공동 assignee 11건의 주관/협업 구분을 이슈 본문 첫머리에 반영. 기존 assignees와 라벨 보존.
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
