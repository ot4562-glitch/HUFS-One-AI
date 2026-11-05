# HUFS One AI — PR 리뷰·검증·병합

현재 `main`과 실제 등록된 코드/계약·테스트를 정본으로 판단합니다. 이슈/PR 숫자 또는 이전 커밋 PASS를 최신 코드 검증으로 전용하지 않습니다.

## 코드·계약·보안 PR의 기본 검토

1. PR은 담당 소유권/변경 대상 계약·실제 결함/반례와 인가·자료/AI·migration·lockfile·출시 영향 범위를 명시합니다.
2. 비교 대상은 **최신 HEAD SHA**와 main diff. 접근권/데이터 범위·race/취소/철회·로그/자산/시점·다중탭/SQL role·fail-closed/rollback 위험을 검토합니다.
3. 같은 HEAD의 GitHub Actions **합성계약·실제 일회용 PG·Chrome·NCP IaC(mock)** 중 영향을 받는 필수 워크플로를 확인합니다. FAIL/SKIP/NOT_RUN은 그대로 보고하고, 실패를 성공 재실행만 골라 숨기지 않습니다.
4. 일반 규칙: 작성자가 아닌 실제 리뷰어의 `APPROVED`와 미해결 `CHANGES_REQUESTED`/스레드 해소, 필요한 CI SUCCESS, mergeable/base/HEAD를 모두 확인한 후 병합합니다. 자동 에이전트 COMMENT는 사람 APPROVED가 아닙니다. 사용자가 특정 PR에 직접 병합을 지시한 예외는 **그 PR에만** 적용하고 사실대로 기록합니다.
5. merge 후 동일 SHA의 main Actions·영향 받은 API/화면을 재확인합니다. 프로덕션/실계정/원본/유료 AI/NCP apply·RELEASE_BLOCKED 해제는 **PR 병합과 별도 승인**입니다.

## 안전한 변경과 기록

- 수정 파일/코드 계약·버전, 정상·부정/경쟁 테스트, 테스트 명령·환경, SHA, PASS/FAIL/SKIP/NOT_RUN, reviewer 논의·관련 #253 구현/#252 인수 링크를 남깁니다.
- 타인 dirty worktree, 미병합 PR/브랜치·backup은 임의 reset/clean/force push하지 않고 먼저 관계를 확인합니다.
- 현재 코드·API/계약/문서만 설명하고 오래된 실행일지/일회용 작업 수치를 활성 문서에 누적하지 않습니다. 증거는 PR/Actions/issue 링크로 조회합니다.
- 비밀키/실원본·학번↔실명·모델 입력·과금 식별자는 PR/CI/로그/스크린샷에 넣지 않습니다.

**개발/협업:** [AGENTS](../AGENTS.md), [현재 상태](../STATUS.md), [워크스트림](WORKSTREAMS.md).
