# HUFS One AI — PR·이슈 현황 감사 (2026-11-09)

> 검토 시각: 2026-11-09 (Asia/Seoul). GitHub의 당시 OPEN PR·Issue와 실제 PR HEAD diff, review/threads, Actions 결과를 검토한 기록. 이후 변경은 [PR](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)·[Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues)에서 재확인해야 합니다. 전날 병합 이력은 [2026-11-08 감사](REVIEW_AND_ISSUE_AUDIT_20261108.md)에 보존합니다.

## 1. 이번 PR 처리 결과

| PR | 검토 기준 | 리뷰 / 검증 | 처리 |
| --- | --- | --- | --- |
| [#386 NCS 의미 후보](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386) | HEAD `0fdb63868cf84072cae0a656f697d5c60787fb94` | [오너 APPROVED](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386#pullrequestreview-5820570040), 동료 APPROVED, 과거 중복-ID 스레드 2건 해결, HEAD TASK-00/Chrome E2E/NCP/Pages/npm audit 5종 SUCCESS | **squash MERGED** [`e8d3c9c`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e8d3c9c73849bec36b7fe686de2c56e6aa71c5b9) |
| [#361 FAQ 근거 검색](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | HEAD `72fc4027f4e78df2c15635ea2e1aaf816b7cef0b` | [REQUEST_CHANGES](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361#pullrequestreview-5820574395); HEAD Actions 5종 SUCCESS | **OPEN — 미병합**. `없는`(형용사형)을 답의 서술어 부정과 혼동하여 긍·부정 뒤집기 허용 위험 |
| [#372 OCR 증빙 후보](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | HEAD `1798c551e96d3ee0701148b0073652411089170e` | [REQUEST_CHANGES](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372#pullrequestreview-5820574572); HEAD Actions 5종 SUCCESS, 동료 구 HEAD APPROVED | **OPEN — 미병합**. 비슷한 별개 기관명을 `SAME`으로 판단해 검토 플래그 누락 |

### #386 병합 승인 범위

- 원본과 상충하는 중복 `requirementId` 또는 `experienceId` 판본 전부 격리, 동일 ID의 텍스트 중복 격리, 입력 순서 반전 테스트. 승인된 경험의 `version` 변경이 후보 digest를 바꾸도록 구현.
- 의미 매칭은 `NEEDS_OWNER_REVIEW` 후보이지 학생 능력·직업 적합성 증명, `SUPPORTED_BY_EVIDENCE` 전환이 아님. 기존 규칙 결과와 합성 회귀 결과를 분리.
- 해당 HEAD CI 성공 및 다른 계정의 교차 리뷰가 확인됐지만 **병합 후 main SHA의 별도 CI와 실제 NCS/학생 데이터/독립 사람 Gold/API·웹 통합 검증은 이번 감사에서 확인하지 않았습니다**. [#347](https://github.com/ot4562-glitch/HUFS-One-AI/issues/347)은 OPEN 유지.

### #361 / #372 차단 반례와 수정 기준

- **FAQ #361:** 인용된 `포털에서 신청할 수 있습니다`를 답에서 `신청할 수 없습니다`로 바꾸는 경우, 근거의 다른 형용사 `제한 없는` 때문에 부정 극성 검사에서 통과할 수 있음. 서술어·인용문 의미를 연결하는 가드 및 합성 회귀 필요. 실제 HCX-007 호출/공식 FAQ·권리 검증은 미인수.
- **OCR #372:** `가상외국어대학교`와 `가상외국어대학원` 같은 서로 다른 발급처가 `dice >= 0.85` 유사도 경로로 같은 기관으로 처리될 수 있음. 모호한 이름은 `ISSUER_UNCERTAIN`으로 보류하고 기관명 구분·입력 순서 반전 회귀 필요. 실 OCR/자산 저장/API·웹 인수는 미실행.
- 기존 리뷰의 다중 기간/개인정보/중복 lineId, citationId/시점/명사 회귀 등은 최근 코드에서 개선 확인. **새 HEAD 수정 + CI + 재리뷰 전 병합 금지**. 이전 SUCCESS만으로 새 수정의 CI PASS를 가정하지 않음.

## 2. 이슈 현황 대조

감사 시점 **OPEN 26건**. 기능/코어 병합과 전체 기능·실운영 완료는 분리합니다.

| 종류 | 번호/수 | 판정 |
| --- | --- | --- |
| 변경 금지 팀 역할 | #355–#359 (5) | 원문·담당·댓글·라벨·종결 **일절 변경하지 않음** |
| 공식 데이터/게시권·독립 Gold | #360 (1) | 실자료 수급·권리·Gold 인수 미확인, OPEN |
| 추가 기능 | #339–#341 및 #343–#352 (13) | 코드 일부 병합 포함. 실제 API/DB/UI/자료/사용자 인수 미완으로 OPEN |
| 기술/보안·근거 무결성 | #362, #366, #367, #373, #375, #378, #381 (7) | 부분 해결과 남은 수락 조건 구분하여 OPEN |

- [#347 진행 댓글](https://github.com/ot4562-glitch/HUFS-One-AI/issues/347#issuecomment-6729754665): #386 병합으로 **AI 순수 코드 단계만 완료**, API/원장·UI/독립 Gold 미완.
- [#346 진행 댓글](https://github.com/ot4562-glitch/HUFS-One-AI/issues/346#issuecomment-6729755082), [#341 진행 댓글](https://github.com/ot4562-glitch/HUFS-One-AI/issues/341#issuecomment-6729755524): PR 리뷰 보류 사유·미인수 기록.
- #367은 #396 조립 단계만, #373은 #389 활동 쪽만, #381은 #390 API 검증기만, #378은 #394 npm 감사 CI만 해결. 남은 운영/공통 계약·권리·독립 검증은 OPEN.
- **이번 감사에서 추가로 closed/completed 처리할 수 있는 전체 수락 완료 이슈는 확인되지 않았음.** 기존 완료 이슈를 임의 재개·중복 종결하지 않았습니다.

## 3. 안전·출시 경계

- 공개 `csv/` 원본 5개는 사용자·저장소 정책에 따라 **수정/삭제/이동/히스토리 변경 금지**, 공개 게시권·재식별 검토 #362는 별도 비공개 조치 필요.
- 학교 공식 데이터·실학생 동의/권한·NCP/HCX 실과금·실 PostgreSQL·독립 사람 QA/Gold는 합성 CI와 다름. `NOT_RUN` / `NOT_CONNECTED` / `CONFIGURATION_REQUIRED` 상태를 유지.
- 프로젝트 소유자 코드 승인 `OWNER_CONFIRMED_APPROVED`와 정식 서비스 출시 승인 분리: **`RELEASE_BLOCKED` 유지**.
- 현재 문서는 감사 기록일 뿐, 문서 변경 자체의 CI/실서비스 인수를 주장하지 않습니다.

[현행 STATUS](../STATUS.md) · [PR 규칙](PR_WORKFLOW.md) · [팀 협업](WORKSTREAMS.md).
