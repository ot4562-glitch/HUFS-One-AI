# HUFS One AI — PR·이슈 현황 감사 (2026-11-09)

> **1차 검토 시각:** 2026-11-09 (Asia/Seoul); 아래 1–3절은 당시 스냅샷이며, 실제 후속 병합·새로운 감사 현황은 **4절**이 우선합니다. GitHub의 당시 OPEN PR·Issue와 실제 PR HEAD diff, review/threads, Actions 결과를 검토한 기록. 이후 변경은 [PR](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)·[Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues)에서 재확인해야 합니다. 전날 병합 이력은 [2026-11-08 감사](REVIEW_AND_ISSUE_AUDIT_20261108.md)에 보존합니다.

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

## 4. 후속 독립 리뷰/CI·병합·이슈 정리 (2026-11-09 2차)

| PR/그룹 | 승인/검증의 실제 근거 | 결과 |
| --- | --- | --- |
| [#413 독립 승인 정책](https://github.com/ot4562-glitch/HUFS-One-AI/pull/413) | 박준영 `taewangim-alt`의 **동일 HEAD `9841dc957b6fb906947d4ec51358ce2231c1e128` APPROVED** ([리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/413#pullrequestreview-5820952993)), write 권한·4개 diff·HEAD 6종 워크플로 SUCCESS | 정확 SHA squash **MERGED** [`dfc79a7`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/dfc79a76a3b634417d6793042ab1730175858b31). CODEOWNERS/PR 템플릿/AGENTS/PR_WORKFLOW 정본. 관리자 보호 설정은 별도 |
| [#417 허가 공고 검색](https://github.com/ot4562-glitch/HUFS-One-AI/pull/417) | 박준영 **HEAD `2bc0262ec3fdebe4ab225be8ba3d026d4d6cc349` APPROVED**, TASK-00/Chrome/CodeQL/NCP/Pages/npm audit/CSV guard **7개 SUCCESS**, CodeQL 요청량 제한 리뷰 스레드 해결 | 정확 SHA squash **MERGED** [`35b9ebe`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/35b9ebe33c400e7284f7a1f6951b02f30d11136a); **main 동일 SHA push Actions 6개도 SUCCESS**(TASK-00·Chrome·CodeQL·NCP·Pages·npm audit). 인증 BETA API→웹 검색/서명 커서 코드 연결; 실제 승인 source/운영 SQL keyset/다중 인스턴스 quota·rights 미연결, #348/#366 OPEN. 검토자의 TTL 만료/KST 날짜 UX 지적은 #418 OPEN |
| [#415 독립 승인 CI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/415) | 기존 #413 승인 정책과의 중복/충돌을 정리. 새 HEAD `7f850b8`, 안전한 workflow·CI sparse allowlist·합성 재현 테스트·문서 **5개 파일만** 남겨 main 위에 2-parent merge 반영 | 미병합. 리뷰어 승인 전 `exact-HEAD independent approval`의 FAILURE는 의도적. **최신 HEAD 동료 APPROVED/나머지 CI** 확인 후에만 병합 가능 |
| [#410 상담](https://github.com/ot4562-glitch/HUFS-One-AI/pull/410)·[#412 학업/경험](https://github.com/ot4562-glitch/HUFS-One-AI/pull/412) | 각 구 HEAD PR Actions SUCCESS; 작성자 사전 검토 `COMMENT` 제출. 실제 다른 협업자 승인 **0건**, 현재 main 충돌 | 미병합/OPEN. 충돌 정리 및 최신 HEAD 재실행·협업자 승인 필요 |
| [#361 FAQ](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361)·[#372 OCR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | 현재 HEAD 공식 `CHANGES_REQUESTED`(정반대 FAQ 답변/다른 기관명 동일 취급)와 미해결 스레드 | 결함/반례 수정·새 HEAD CI/재리뷰 전 병합 금지 |
| Dependabot [#402](https://github.com/ot4562-glitch/HUFS-One-AI/pull/402)·[#403](https://github.com/ot4562-glitch/HUFS-One-AI/pull/403)·[#406](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) | 각각 HEAD TASK-00 실패: pinned checkout CI 경계, upload-artifact 스크린샷 안전 경계, TypeScript 7 compiler API `TS2339`. [공식 REQUEST_CHANGES #402](https://github.com/ot4562-glitch/HUFS-One-AI/pull/402#pullrequestreview-5821010137) · [#403](https://github.com/ot4562-glitch/HUFS-One-AI/pull/403#pullrequestreview-5821010313) · [#406](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406#pullrequestreview-5821010508) | 모두 미병합/OPEN. 취약점 발견 확정 의미 아님 |
| Dependabot [#404](https://github.com/ot4562-glitch/HUFS-One-AI/pull/404)·[#405](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405)·[#407](https://github.com/ot4562-glitch/HUFS-One-AI/pull/407)·[#408](https://github.com/ot4562-glitch/HUFS-One-AI/pull/408)·[#409](https://github.com/ot4562-glitch/HUFS-One-AI/pull/409) | SHA별 diff·기존 HEAD 워크플로 SUCCESS 확인 후 `COMMENT` 리뷰 제출. 현재 main mergeable false/변경 경합, 별도 사람 승인 부족 | 모두 HOLD, 자동 병합 안 함 |

### 이슈 28건 현황 및 안전 경계

- **5 고정 역할 #355–#359 (읽기 전용), 1 자료 #360, 13 추가기능 #339–#341/#343–#352, 7 기존 결함 #362/#366/#367/#373/#375/#378/#381, 2 신규 추적 #416·#418**. 총 OPEN **28건**.
- [#414](https://github.com/ot4562-glitch/HUFS-One-AI/issues/414)는 동일한 관리자 리뷰 보호·과거 무승인 병합 감사가 [#416](https://github.com/ot4562-glitch/HUFS-One-AI/issues/416)에 중복돼 **CLOSED (duplicate, NOT completed)**. #416은 관리자 Ruleset 강제 설정과 #399/#400/#401/#411 사후 동료 감사 전 OPEN.
- #348/#366에는 #417 **부분 연결** 주석, #345에는 #410 대기, #375에는 #412 대기, #378에는 Dependabot 실패/보안 검토 결과를 기록. **2차 감사에서 실사용 DoD를 충족해 신규 `completed` 처리한 이슈 없음**. #418은 실제 리뷰어가 보고한 검색 시점 만료·KST 날짜 오표시를 분리 추적.
- GitHub Ruleset 목록 `[]` 및 main 보호 상세 API `403` 환경에서 `CODEOWNERS`·정책 파일만으로 필수 승인 **GitHub 서버 강제**가 작동한다고 주장하지 않음(`REVIEW_PROTECTION_NOT_VERIFIED`). 관리자 UI에서 실제 승인 0인 PR 병합 차단 재현 필요.
- `csv/` 공개 원본 5개, 팀 고정 역할 #355–#359, 학내/실학생의 동의·원본 권리, 운영 NCP/HCX/실 PostgreSQL은 손대지 않음. 사용자 프로젝트 범위 승인과 출시 별도: **`RELEASE_BLOCKED`**.

[현행 STATUS](../STATUS.md) · [PR 규칙](PR_WORKFLOW.md) · [팀 협업](WORKSTREAMS.md).
