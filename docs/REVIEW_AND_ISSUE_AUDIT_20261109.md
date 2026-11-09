# HUFS One AI — PR·이슈 현황 감사 (2026-11-09)

> **1차 검토 시각:** 2026-11-09 (Asia/Seoul). 1–3절은 당시 기록, 아래 4절이 최신 3차 검수입니다. GitHub의 당시 OPEN PR·Issue와 실제 PR HEAD diff, review/threads, Actions 결과를 검토한 기록. 이후 변경은 [PR](https://github.com/ot4562-glitch/HUFS-One-AI/pulls)·[Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues)에서 재확인해야 합니다. 전날 병합 이력은 [2026-11-08 감사](REVIEW_AND_ISSUE_AUDIT_20261108.md)에 보존합니다.

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

## 4. 2026-11-09 3차 감사 (이후 변동은 GitHub에서 재확인)

**OPEN PR 8 / OPEN Issue 28.** 사용자 담당 이슈 8개 중 수정 금지 #359 제외 7개, 아직 전체 DoD 충족 종결 0개. 최신 기록은 이 절이며, 위 1–3절 26개 이슈 수치는 1차 당시입니다.

### 독립 승인·CI 확인 후 main에 squash 병합한 8건

| PR | 변경 내용 | Merge SHA |
| --- | --- | --- |
| [#424](https://github.com/ot4562-glitch/HUFS-One-AI/pull/424) | 배지 그룹간 활동 중복 방지 | [850ba49](https://github.com/ot4562-glitch/HUFS-One-AI/commit/850ba49cd5f38967374b096b0ef4376ad2208b02) |
| [#420](https://github.com/ot4562-glitch/HUFS-One-AI/pull/420) | 장학금/배지 준비 API/UI 연결 | [c73d8de](https://github.com/ot4562-glitch/HUFS-One-AI/commit/c73d8ded6df0c3b286df46c5bc0f60c39d33f61d) |
| [#402](https://github.com/ot4562-glitch/HUFS-One-AI/pull/402) | checkout v7.0.1 | [bec7805](https://github.com/ot4562-glitch/HUFS-One-AI/commit/bec7805f0ee755843d8930641599d3945708da03) |
| [#403](https://github.com/ot4562-glitch/HUFS-One-AI/pull/403) | upload-artifact v7 | [9ab5647](https://github.com/ot4562-glitch/HUFS-One-AI/commit/9ab5647e04b7f332833b59af3940670e92652616) |
| [#404](https://github.com/ot4562-glitch/HUFS-One-AI/pull/404) | cache v6.1.0 | [da6e3f7](https://github.com/ot4562-glitch/HUFS-One-AI/commit/da6e3f77176707dac4c726c63025bcecf5291e95) |
| [#409](https://github.com/ot4562-glitch/HUFS-One-AI/pull/409) | Fastify 5.12.8 | [966942c](https://github.com/ot4562-glitch/HUFS-One-AI/commit/966942ce688548663f721ea373c9f61eb29684c7) |
| [#407](https://github.com/ot4562-glitch/HUFS-One-AI/pull/407) | pg 8.23.1 및 types | [e16319b](https://github.com/ot4562-glitch/HUFS-One-AI/commit/e16319ba6aeb130493d798e46ff3a02eae34e382) |
| [#408](https://github.com/ot4562-glitch/HUFS-One-AI/pull/408) | jsdom v31 | [895f219](https://github.com/ot4562-glitch/HUFS-One-AI/commit/895f2191306a9a8f16326e66af68b0a49241a111) |

#424는 **다른 협업자가 작성**했고 소유자가 코드·회귀를 독립 검토했습니다. #420은 작성자가 소유자이며 다른 팀원 최신 HEAD 승인 후 병합. Dependabot 6개 PR은 현 HEAD diff/CI 검토 후 소유자의 독립 APPROVED를 기록하고 각 exact-HEAD approval check SUCCESS 확인 뒤 병합. 병합 이후 별도 운영 출시 검증과 실제 원본 권리까지 완료했다는 뜻은 아닙니다. 이전에 이미 [#415](https://github.com/ot4562-glitch/HUFS-One-AI/pull/415)도 [6cef538](https://github.com/ot4562-glitch/HUFS-One-AI/commit/6cef53869d828bd99952dcf7bd26f0df192a2e7c)로 **병합**됐습니다.

### 미병합 PR 8건 및 차단 조건

| PR | 최신 검토 상태 |
| --- | --- |
| [#422](https://github.com/ot4562-glitch/HUFS-One-AI/pull/422) | 6종 owner insights: main 충돌 합성 HEAD 6379472, 최신 CI/팀 승인 대기 |
| [#421](https://github.com/ot4562-glitch/HUFS-One-AI/pull/421) | CSV Git 메타데이터 감사 제안; 팀 승인·비공개 권리 검토 필요 |
| [#419](https://github.com/ot4562-glitch/HUFS-One-AI/pull/419) | 현행 문서 조정; 최신 HEAD 팀 승인·CI 대기 |
| [#410](https://github.com/ot4562-glitch/HUFS-One-AI/pull/410) | 상담 API/UI 연결; 팀 승인·main 합성 확인 필요 |
| [#406](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) | TypeScript 7 파서/빌드 분리 HEAD 3282c42, 최신 CI·팀 승인 대기 |
| [#405](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405) | github-script v9; 실제 issues.opened 경로 확인 전 HOLD |
| [#372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | OCR 별개 발급처 SAME 오판, CHANGES_REQUESTED |
| [#361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | FAQ 부정/긍정 극성 오판, CHANGES_REQUESTED |

- **#406 TypeScript 7**: 이전 HEAD 499ab74의 TASK-00 entrypoint inventory 11개 실패(구 TypeScript AST API 부재). 새 HEAD 3282c42에 TypeScript 5.9.3 npm alias는 정적 AST 검사용으로만 고립하고 실제 compiler CLI는 TypeScript 7 바이너리로 고정. 새 CI·팀원 승인이 확인되기 전 병합 금지.
- **#422 통합**: 기존 PR과 #420 API/UI/계약 경합을 main 895f219 보존 두 부모 merge commit 6379472로 조정. 장학/배지와 멘토/NCS/학습/통계/증빙/국제학생 연결 변경을 보존했지만 새 HEAD E2E·협업자 리뷰·실자료 인수 전 병합 금지.
- **#361 FAQ / #372 OCR**: 각각 극성 반전 및 다른 기관의 오인증 반례가 남아 공식 CHANGES_REQUESTED, CI만으로 우회 병합 불가.

### 열린 이슈 28건과 인수 경계

| 분류 | 이슈 | 수 |
| --- | --- | --- |
| 본선 진출 이후 고정 역할(쓰기 금지) | #355–#359 | 5 |
| 자료 요청·게시권·독립 Gold | #360 | 1 |
| 신규 기능 | #339–#341, #343–#352 | 13 |
| 코드·보안·권한 결함 | #362, #366, #367, #373, #375, #378, #381 | 7 |
| 사후 코드 감사/웹 KST 결함 | #416, #418 | 2 |
| 합계 | | **28** |

**본인 담당 7건의 상세 증거/미충족 DoD:**

- [#416](https://github.com/ot4562-glitch/HUFS-One-AI/issues/416): #415 병합 및 현재 검수 절차 개선. 과거 4건의 무승인 병합 사후 동료 감사와 main Ruleset 활성화 미확인. **OPEN 유지**.
- [#381](https://github.com/ot4562-glitch/HUFS-One-AI/issues/381): API + 공통 matchesImageSpan 중복 OCR line ID 거부 코드 있음. 실제 OCR 생성/저장소 유일성과 실원본 권한 인수 미검증. **OPEN 유지**.
- [#378](https://github.com/ot4562-glitch/HUFS-One-AI/issues/378): #394 npm audit/SCAN_UNAVAILABLE CI 구현. 비공개 Dependabot alerts/CodeQL 설정 및 CVE 대응 운영 인수 미검증. **OPEN 유지**.
- [#375](https://github.com/ot4562-glitch/HUFS-One-AI/issues/375): owner API가 경험-교과 엔진 호출하고 BETA 웹/합성 테스트 존재. 공식 강좌 identity/원장/목적 동의/실계정 미연결. **OPEN 유지**.
- [#367](https://github.com/ot4562-glitch/HUFS-One-AI/issues/367): #396 CampusAssist 운영 포트 조립 있음. 권리 확인된 실제 source/FAQ 비용·권한/실 E2E 미연결. **OPEN 유지**.
- [#366](https://github.com/ot4562-glitch/HUFS-One-AI/issues/366): #420/#424 병합, #422 충돌 해결 CI/재승인 대기, #410 상담 대기. 10기능의 운영 source/rights/QA 미인수. **OPEN 유지**.
- [#362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362): 공개 CSV 5개 원본 게시권/동의와 Git 역사·복제 영향 조사 미완. #421 메타데이터 감사 PR 대기, 원본 불변. **OPEN 유지**.

**Ruleset:** API 확인 결과 main Ruleset **0건**, branch protection 상세 조회 **403 권한 부족**. #415의 자동 CI와 CODEOWNERS만으로 강제 차단이 설치됐다고 보고할 수 없습니다(#416). 과거 무승인 병합 #399/#400/#401/#411 사후 팀원 감사도 미완. 원본 CSV 5개 및 Git 이력, 역할 이슈 #355–#359는 변경하지 않습니다. 학교 공식 자료/실학생 동의·RLS/권리/운영 NCP/HCX/독립 Gold와 합성 CI는 다르며 **RELEASE_BLOCKED**.

[현행 STATUS](../STATUS.md) · [PR 규칙](PR_WORKFLOW.md) · [팀 협업](WORKSTREAMS.md).
