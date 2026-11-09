# HUFS One AI — PR·이슈 현황 감사 (2026-11-09)

> **1차 검토 시각:** 2026-11-09 (Asia/Seoul). 1–3절은 당시 기록, 아래 8절이 가장 최신 실제 병합 검수입니다. 4–7절은 당시의 중간 스냅샷입니다. GitHub의 당시 OPEN PR·Issue와 실제 PR HEAD diff, review/threads, Actions 결과를 검토한 기록. 이후 변경은 [PR](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)·[Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues)에서 재확인해야 합니다. 전날 병합 이력은 [2026-11-08 감사](REVIEW_AND_ISSUE_AUDIT_20261108.md)에 보존합니다.

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

## 4. 2026-11-09 최종 검수 스냅샷 — PR 9건 병합, 7건 OPEN, Issue 28건 OPEN

1–3절은 과거 1차 기록, 이 4절이 현행 상태입니다. 이후 변경 여부는 GitHub에서 확인하세요. 당시 실제 PR merge API의 merged=true와 정확한 커밋 SHA를 대조했습니다.

| 병합 PR | 변경 요약 | main merge SHA |
| --- | --- | --- |
| [#424](https://github.com/ot4562-glitch/HUFS-One-AI/pull/424) | 배지 그룹 간 활동 재사용 차단 | [850ba49](https://github.com/ot4562-glitch/HUFS-One-AI/commit/850ba49cd5f38967374b096b0ef4376ad2208b02) |
| [#420](https://github.com/ot4562-glitch/HUFS-One-AI/pull/420) | 장학/배지 준비 API/UI | [c73d8de](https://github.com/ot4562-glitch/HUFS-One-AI/commit/c73d8ded6df0c3b286df46c5bc0f60c39d33f61d) |
| [#402](https://github.com/ot4562-glitch/HUFS-One-AI/pull/402) | checkout v7.0.1 | [bec7805](https://github.com/ot4562-glitch/HUFS-One-AI/commit/bec7805f0ee755843d8930641599d3945708da03) |
| [#403](https://github.com/ot4562-glitch/HUFS-One-AI/pull/403) | upload-artifact v7 | [9ab5647](https://github.com/ot4562-glitch/HUFS-One-AI/commit/9ab5647e04b7f332833b59af3940670e92652616) |
| [#404](https://github.com/ot4562-glitch/HUFS-One-AI/pull/404) | cache v6.1.0 | [da6e3f7](https://github.com/ot4562-glitch/HUFS-One-AI/commit/da6e3f77176707dac4c726c63025bcecf5291e95) |
| [#409](https://github.com/ot4562-glitch/HUFS-One-AI/pull/409) | Fastify 5.12.8 | [966942c](https://github.com/ot4562-glitch/HUFS-One-AI/commit/966942ce688548663f721ea373c9f61eb29684c7) |
| [#407](https://github.com/ot4562-glitch/HUFS-One-AI/pull/407) | Postgres pg 8.23.1 | [e16319b](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e16319ba6aeb130493d798e46ff3a02eae34e382) |
| [#408](https://github.com/ot4562-glitch/HUFS-One-AI/pull/408) | jsdom 31 | [895f219](https://github.com/ot4562-glitch/HUFS-One-AI/commit/895f2191306a9a8f16326e66af68b0a49241a111) |
| [#422](https://github.com/ot4562-glitch/HUFS-One-AI/pull/422) | 6종 owner insights API/UI 통합 | [6062230](https://github.com/ot4562-glitch/HUFS-One-AI/commit/6062230952035e364fe54fdaf65ab56d7eca83c7) |

#424는 동료 작성 PR을 소유자가 독립 리뷰했고 #420은 다른 팀원의 정확한 HEAD 승인, 봇 #402/#403/#404/#409/#407/#408은 소유자의 PR 작성자 아닌 자격으로 검토한 뒤 각 exact HEAD 승인 검사 및 다른 필수 CI 성공을 확인했습니다. **#422**는 [taewangim-alt가 새 HEAD 6379472 APPROVED](https://github.com/ot4562-glitch/HUFS-One-AI/pull/422)하고 독립 체크가 성공했으며 전체 CI/리뷰 스레드 조건을 확인해 squash 병합 [6062230](https://github.com/ot4562-glitch/HUFS-One-AI/commit/6062230952035e364fe54fdaf65ab56d7eca83c7). 코드 병합이 실학교 자료·권리·NCP 과금·졸업/지원 공식 수락은 아닙니다.

### OPEN PR 7건

| PR | 실제 미완 검증/조치 |
| --- | --- |
| [#421](https://github.com/ot4562-glitch/HUFS-One-AI/pull/421) | CSV Git 메타데이터 경로 한계 명시 HEAD fb7ea01; 데이터/권리 담당자 리뷰·최신 CI 필요 |
| [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419) | 현재 상태/이슈/PR 감사 문서; 새 HEAD 독립 승인/CI 확인 필요 |
| [#410](https://github.com/ot4562-glitch/HUFS-One-AI/pull/410) | 상담 source→API/UI: 코어 랭킹 전 검증 기관 필터·중복 ID 격리 HEAD 39edd5c; 일반 CI SUCCESS, 동료 승인 필요 |
| [#406](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) | TypeScript 7 호환성 교정 HEAD 3282c42: 일반 CI 성공, 과거 변경 요청/독립 승인 미해결 |
| [#405](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405) | github-script v9: Node24 합성 opened/edited/manual dry_run 회귀 HEAD eca9ff5, Node24 CI test SUCCESS; 실제 workflow_dispatch·독립 승인 미확인 |
| [#372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | OCR 기관 오인 수정·기능 회귀 및 #422 이후 main 병합 충돌 해결 HEAD 5769a35; 새 CI/독립 재리뷰 필요 |
| [#361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | FAQ 인용 서술어 극성 비교 수정·합성 회귀 HEAD 1bf77d4; 일반 CI SUCCESS, 구 CHANGES_REQUESTED 정리·동료 최신 승인 필요 |

#406 이전 HEAD의 TypeScript 7 AST JS API 불일치로 TASK-00 11개 실패를 재현했고, 새 HEAD 3282c42에서 TypeScript 5.9.3 AST 감사만 alias로 고립하고 typecheck/빌드는 TS7 CLI를 사용합니다. **새 HEAD 일반 CI 성공**, 그러나 이전 CHANGES_REQUESTED 및 사람 독립 승인 조건 미완. #410 상담 코어 결함을 **HEAD 39edd5c**에서 추가 수정했고 일반 CI SUCCESS. #361 **HEAD 1bf77d4**의 인용 서술어 극성 회귀와 #372 **HEAD 5769a35**의 유사 기관명 격리/충돌 해결 커밋이 제출됐습니다. 새 HEAD의 전체 CI·오래된 변경 요청 처리·독립 사람 승인 전 병합은 금지합니다.

### 이슈 28건 전체 검토

- **본선 진출 이후 고정 역할 #355–#359: 5개 OPEN, 본문·댓글·담당·라벨·상태 변경 금지**, 모두 불변.
- **자료 #360: 1 OPEN**, 실공식 출처·게시/OCR/HCX 권리·Gold 검수 미인수.
- **추가기능 #339–#341 및 #343–#352: 13 OPEN**, 기초 #342/#353 병합, #417 공고, #420 장학/배지, #424 배지 중복방지, #422 6종 BETA 연결 코드는 단계별 완료했으나 실원본/공식 판정/사람 수락 미완. 각 이슈 본문에 현재 코드 및 미수락 사항을 별도로 갱신.
- **기술·보안 #362/#366/#367/#373/#375/#378/#381: 7 OPEN**, 본인 담당 6개 포함. #366은 이제 #420/#424/**#422 병합**으로 여러 인증 UI 소비자가 연결되었으나 상담 #410 및 실제 source/rights/사람 QA는 미완. #375 owner 경험↔교과 API/웹·합성 시험 존재, #381 OCR 중복 ID 공통 방어 존재, #378 npm audit CI 존재, #367 CampusAssist 포트 조립 존재, #362 실제 CSV 게시권/역사 감사 미완.
- **후속 #416/#418: 2 OPEN**. #416은 #415 CI 병합과 별개로 관리자 main Ruleset 빈 목록/보호 API 403, 과거 #399/#400/#401/#411 타인 사후 감사 미완. #418은 TTL 409/422, 429 상태·UTC/KST 표시 버그 OPEN.
- 합계 **28 OPEN**; 이 중 **사용자 배정 8개**는 #359 고정 역할을 빼면 7개. 7개 모두 이번 세션에서 코드 진전과 외부 인수 필요를 이슈 본문에 업데이트했으며 **임의 완료 종결 0건**. 추가 기능·보안·자료 등 총 **쓰기 가능한 23개 이슈**를 최신 부분 구현/미수락 상태로 갱신하고 고정 역할 5개를 그대로 둠.

**최종 운영 경계:** GitHub CODEOWNERS/독립 리뷰 CI는 main의 실제 Ruleset 강제를 대체하지 않으며, 현재 보호 활성화 미확인(REVIEW_PROTECTION_NOT_VERIFIED). 원본 CSV 다섯 파일·Git 역사 불변. 실학교·학생 원본/동의·RLS·공고 권리, NCP/HCX 유료 실행, 사람 QA/독립 Gold는 NOT_CONNECTED/NOT_RUN/CONFIGURATION_REQUIRED; **RELEASE_BLOCKED**.

[현행 STATUS](../STATUS.md) · [PR 규칙](PR_WORKFLOW.md) · [팀 협업](WORKSTREAMS.md).


## 5. 2026-11-09 추가 수정 — 구 리뷰 결함 직접 수리 후 미병합 검수

이 절은 4절 이후 실제 GitHub 브랜치에 기록된 수정 커밋을 추적합니다. **병합은 별도 사실이며, 여기 나열한 커밋은 main 병합 SHA가 아닙니다.**

| PR | 최신 확인한 수리 HEAD | 증거/남은 조건 |
| --- | --- | --- |
| [#361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | `1bf77d497` | 형용사 `없는`과 동작 `신청할 수 없습니다`의 부정 극성 분리·여러 합성 회귀 추가. CI 일반 잡 모두 SUCCESS, 독립 exact-HEAD 승인 검사 실패(아직 승인 없음); 과거 CHANGES_REQUESTED와 리뷰 스레드 재확인 필요 |
| [#372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | `5769a3571` | 문자열 유사 기관명을 `SAME`으로 간주하지 않음. 기관명 접미어 순서 반전 회귀, 기존 main의 skills-semantic과 OCR export 동시 보존 2-parent merge. HEAD CI·독립 재승인 확인 필요 |
| [#405](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405) | `eca9ff5a6` | Node24 합성 `issues.opened/edited`, 고정 역할 쓰기 차단, 수동 `dry_run` inline script 테스트. Node24 CI `test` SUCCESS; 실제 운영 `workflow_dispatch`는 도구 권한으로 실행하지 못해 **NOT_RUN**, 승인 미완 |
| [#410](https://github.com/ot4562-glitch/HUFS-One-AI/pull/410) | `39edd5c66` | 상위 3개 slicing 이전 verifiedName/span 검증 및 중복 서비스 ID 격리. 재현 2개 회귀; 일반 HEAD CI 모두 SUCCESS, 독립 승인 미완 |
| [#421](https://github.com/ot4562-glitch/HUFS-One-AI/pull/421) | `fb7ea01d3` | 조사 대상은 로컬 `csv/`만이라는 점과 경로 외 과거 CSV/포크/refs `UNKNOWN`, 모드 실패 `AUDIT_UNAVAILABLE` 명시. 실제 개인 데이터 내용·파일명·원본 변경 없음. 사람의 자료 권리 확인 별도 |
| [#406](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) | `3282c4259` | TypeScript 7 CLI와 별도 TS5 AST 호환 경계; 일반 CI 성공. 이전 CHANGES_REQUESTED/신규 독립 승인 미완 |
| [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419) | 이 문서 수정 커밋 후 재검토 필요 | 앞선 팀원 코멘트의 #410 알려진 결함 누락을 최신 수정과 함께 반영. 역사적 1차 검토 기록은 지우지 않음 |

**이슈 28 OPEN(고정 역할 5 포함) / 미병합 PR 7 / 9건 이전 실제 병합** 상태를 기준으로 문서를 작성했습니다. 사람·학교 원본의 권리/동의/운영 NCP·HCX/독립 Gold 미인수, `REVIEW_PROTECTION_NOT_VERIFIED` 및 `RELEASE_BLOCKED`를 유지합니다.


## 6. 2026-11-09 마지막 병합·정책 변경 최신 원장

**5절은 수리 커밋의 중간 기록**입니다. 이후 아래 6개 PR은 GitHub `merged=true` 및 각 merge SHA를 확인했습니다. 동료의 명시적 `APPROVED` 여부는 별도 검증 정보이며 일회성 소유자 병합 지시나 작성자 검토를 **동료 승인으로 대체 표기하지 않습니다.**

| PR | 실제 병합 범위 | GitHub merge SHA |
| --- | --- | --- |
| [#361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | FAQ 인용/긍·부정 극성 | [`569e9382d`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/569e9382dd15b536e95ab3fde055442529e7fecc) |
| [#372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | OCR 기관명 보수적 대조 | [`4e1a96204`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/4e1a962049d1a4c24475b0d69d542a35869e2411) |
| [#405](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405) | Node24 이슈 라우터 합성 검증 | [`c4628abe4`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/c4628abe485b9e19dcbf4c9de01e6411cd43ad1c) |
| [#406](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) | TypeScript 7 호환성 | [`4bc5968af`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/4bc5968af4ef765a161ce500a796e64b9ba44d6d) |
| [#410](https://github.com/ot4562-glitch/HUFS-One-AI/pull/410) | 상담 인증 source→API/UI | [`6354b2d62`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/6354b2d62f48ad493eb86838c4e1cc8e530f2dbd) |
| [#421](https://github.com/ot4562-glitch/HUFS-One-AI/pull/421) | CSV 과거 Git 메타데이터 진단 | [`ff0d31714`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/ff0d31714fc5ebce32a7bece2a0d3369579410bb) |

[#425](https://github.com/ot4562-glitch/HUFS-One-AI/pull/425)는 소유자 지시로 `exact-HEAD independent approval` 자동 검사를 **완전히 삭제**하고 `.github/workflows/task00-contracts.yml`, `tests/release/test_ci_workflow.py`의 참조를 함께 정리합니다. `AGENTS.md`·PR_WORKFLOW에는 실제 diff·보안·CI 검토와 미승인 상태 기록을 문서 수칙으로 남깁니다. [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419)는 그 변경을 보존하며 본 README·STATUS·감사 원장 정리를 수행합니다. 두 PR 모두 병합 후 이번 점검의 열린 PR은 0입니다.

**이슈는 총 28건 OPEN**(고정 역할 이슈 #355–#359 5건 읽기 전용). 실제 학교/학생 게시권·개인정보 공개 이력·NCP/HCX 운영·사람 Gold 인수는 PR 병합으로 해결된 것이 아닙니다. 특히 #421은 로컬 `csv/` 경로의 메타데이터 집계일 뿐이고 공개 권리·동의를 판정하지 않습니다. `RELEASE_BLOCKED` 유지.


## 7. 2026-11-09 승인 검사 자동 차단 제거 실제 병합 및 최종 문서

- [#425](https://github.com/ot4562-glitch/HUFS-One-AI/pull/425)의 GitHub 실병합 SHA **[88b7814](https://github.com/ot4562-glitch/HUFS-One-AI/commit/88b7814a1317bc7856ee04ca83b294f2d9eee465)**. 정확한 PR HEAD `a0487b05b`에 대해 CodeQL·합성 contracts·Chrome·실제 격리 PostgreSQL·npm lockfile 감사·CSV 보호·NCP 오프라인·issue-routing 테스트 등 **13개 Checks SUCCESS** 확인. `independent-pr-review.yml`과 전용 테스트를 삭제하고 `task00-contracts.yml`/CI 검사 계약의 관련 참조를 함께 제거. 학생 CSV 원본/Git history 변경 없음.
- 비작성자 `APPROVED` 없는 경우 이를 승인했다고 기록하지 않으며, 실제 코드·CI/변경 요청 검토는 [AGENTS](../AGENTS.md)와 [PR_WORKFLOW](PR_WORKFLOW.md) 지침에 남겼습니다. 관리자 Branch protection required check 설정은 별도 관리자가 확인해야 합니다.
- [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419)는 16개 선행 병합을 반영한 **마지막 문서 PR**입니다. 해당 문서 PR이 병합되면 이번 대상 `OPEN PR=0`입니다. 1–6절의 구 OPEN 수·차단 이력은 해당 시점의 역사적 감사 기록이지 최신 상태가 아닙니다.
- **28개 OPEN 이슈**는 기능별 미인수/권리/사람 QA를 의미하며 자동 종결할 수 없습니다. 고정 역할 #355–#359는 어떤 쓰기도 하지 않았으며, 원본 CSV 5개 변경·공식 서비스 출시 승인도 하지 않았습니다. **`RELEASE_BLOCKED`** 유지.


## 8. 2026-11-09 전체 PR 병합 완료 후 최종 정합성 검증

- **실제 병합된 이번 대상 PR 총 17건, 열린 PR 0건:** 기존 9건(#424/#420/#402/#403/#404/#409/#407/#408/#422), 추가 코드·의존성 6건(#361/#372/#405/#406/#410/#421), 자동 승인 강제 검사 제거 [#425](https://github.com/ot4562-glitch/HUFS-One-AI/pull/425)와 마지막 문서·운영 가이드 [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419).
- **검증된 마지막 병합:** #425 = [main 88b7814](https://github.com/ot4562-glitch/HUFS-One-AI/commit/88b7814a1317bc7856ee04ca83b294f2d9eee465), 최신 HEAD CI 13/13 SUCCESS. #419 = [main fd55ba0](https://github.com/ot4562-glitch/HUFS-One-AI/commit/fd55ba033b88a44deda159ef8fca4a30f7e84cea), 최신 HEAD CI 11/11 SUCCESS; 해당 PR은 README/STATUS/PR_WORKFLOW/이 감사 원장과 이슈 관리 봇·의존성 보안 운영 안내의 총 여섯 문서만 반영했습니다.
- **검토 정책:** `exact-HEAD independent approval` 자동 차단 워크플로는 #425에서 제거했습니다. 별도 사람 교차 리뷰는 권장하고 에이전트가 diff·코드/보안·합성 CI·미해결 의견을 검토하도록 [AGENTS.md](../AGENTS.md)·[PR_WORKFLOW.md](PR_WORKFLOW.md)에 운영 지침으로 유지합니다. 실제 다른 협업자의 `APPROVED`가 없었던 PR을 승인됐다고 소급 기재하지 않습니다. 실제 GitHub branch protection admin 설정은 별도 미검증입니다.
- **이슈 본문 23건 최종 상태 정리:** 현행 28 OPEN 이슈 중, 고정 역할 #355–#359를 제외한 23개에 실제 병합된 기능 범위·고쳐진 결함과 남은 학교 원본/권리·독립 Gold·BETA/PG/NCP/HCX 인수를 구분해 기록했습니다. 제목이 구현 상태와 어긋난 #366/#367/#375/#378/#381 및 리뷰 정책 전환 #416은 남은 일을 설명하도록 정정했습니다. 완료 증거가 없는 이슈를 강제 종결하지 않았습니다.
- **프라이버시·출시:** 기존 `csv/` 원본 5개 및 Git history 불변. #421은 로컬 `csv/` 트리 메타데이터 도구일 뿐 포크·다른 경로·공개 동의는 UNKNOWN/NOT_VERIFIED. 실학교·학생 자료 권리, 운영 DB/NCP·HCX 유료호출, 실제 사람 인수는 `NOT_RUN/NOT_CONNECTED`; 제품은 **RELEASE_BLOCKED**.

이 절은 마지막 PR #419의 병합 완료 후 현행 `main fd55ba0`에서 추가한 문서 전용 정산 기록입니다. 이후 추가 변경은 실제 GitHub HEAD와 [PR 목록](https://github.com/ot4562-glitch/HUFS-One-AI/pulls), [이슈](https://github.com/ot4562-glitch/HUFS-One-AI/issues) 및 Actions 로그를 우선 확인해야 합니다.


## 9. 문서/이슈 현행성 추가 점검 — 2026-11-09

- **확인한 기준 main:** [`36012f0`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/36012f0a7c60766c38af829bd5aabb5f7b52449b). 해당 시점 REST 기준 OPEN PR **0건**, OPEN Issue **28건**. 이미 완료된 코드·의존성·정책·문서 PR **17건**의 병합은 앞 8절 및 [STATUS](../STATUS.md)에 기록되어 있습니다. 이 문서 수정용 후속 PR은 기존 17건에 포함하지 않습니다.
- 이슈는 **고정 역할 #355–#359 5건(쓰기 금지)**, 데이터 #360 1건, 추가 기능 #339–#341·#343–#352 13건, 기술·보안 #362/#366/#367/#373/#375/#378/#381 7건, 사후 검토 #416 및 웹 UX 결함 #418 2건입니다. **비고정 23건 모두 전체 수락 조건 중 미완료가 있어 이번 문서 정정만으로 닫지 않습니다.** `CLOSED/COMPLETED` 여부는 병합 여부가 아닌 각 이슈의 실제 DoD로 판단합니다.
- **현재 결함 #418:** 인증 BETA 공고 검색의 cursor/asOf 만료 및 409/422·429 사용자 안내, UTC/KST 일자 표현, 사용자·탭 바뀜 회귀가 미해결입니다. #417 API/UI 코드가 병합됐어도 정상 사용자 동선 완료로 표시하지 않습니다.
- **보안·권리/사후 감사:** #362 원본 공개 게시권/개인동의·외부 포크 이력, #381 실OCR/영구 저장 E2E, #373 FAQ 권리 충돌, #378 GitHub 보안 알림 운영, #416 과거 #399/#400/#401/#411 사람 교차검토가 남습니다. #425에서 자동 독립 `APPROVED` 체크는 **의도적으로 제거**, 실제 사람 승인을 소급 생성하거나 CI PASS를 사람/실환경 승인으로 바꾸지 않습니다.
- **문서 수리 범위:** [웹 README](../apps/web/README.md)의 폐기된 #323 NCP 책임을 현재 담당 #357/#359로 정정, [UI 구현·인수](UI_MENU_COVERAGE.md)의 폐기된 #318/#323/#324/#325 현재형 링크 교체, [팀 가이드](TEAM_GUIDE.md)·[팀 진척](TEAM_PROGRESS.md)의 감사 원장을 2026-11-09로 갱신, [PR_WORKFLOW](PR_WORKFLOW.md)·[STATUS](../STATUS.md)의 #361/#372 `OPEN` 기록을 과거 시점으로 명시합니다. 다른 날짜별 PR/테스트 이력은 보존합니다.
- **실행하지 않은 사항:** 원본 `csv/` 5개 내용/경로·Git 이력, 고정 역할 이슈의 상태/댓글/배정, 실제 개인/학교 계정·HCX/OCR 유료 모델·NCP 운영 환경·자료 공개권은 이 문서 작업에 포함되지 않습니다. **`RELEASE_BLOCKED` 유지**. 신규 실증이나 후속 코드 PR이 생기면 실제 HEAD Actions/권리/사람 검증 뒤 최신 문서와 관련 이슈에 별도 증거를 남깁니다.
