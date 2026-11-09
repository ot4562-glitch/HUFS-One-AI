# HUFS One AI — 2026-11-08 PR 리뷰·병합·이슈 정리 원장

> 본 문서는 특정 시점의 검증 증거 원장입니다. 살아 있는 상태 요약은 [STATUS](../STATUS.md), 현재 이슈·PR은 GitHub 원본을 확인하세요. 저장소 자체가 학교 공식 서비스 또는 운영 배포가 아닙니다.

## 1. 오너 지시에 따라 이번 턴 검토·병합한 6개 PR

| PR | 기준 head SHA | main squash SHA | 리뷰(작성자 본인 COMMENT) | HEAD CI |
| --- | --- | --- | --- | --- |
| [#391](https://github.com/ot4562-glitch/HUFS-One-AI/pull/391) | `ed7c28bcb8b94fd648baffd7e39fd300809d3a97` | `3fa8f3ce6a819382c5e349d768ce0837e0396be9` | [5818347733](https://github.com/ot4562-glitch/HUFS-One-AI/pull/391#pullrequestreview-5818347733) | TASK-00, Chrome, NCP all SUCCESS |
| [#392](https://github.com/ot4562-glitch/HUFS-One-AI/pull/392) | `6465189f2f28bc3e06987611783318c903f498b4` | `736a1294371a5fc983ba55be96bb01bda9b3eaba` | [5818347868](https://github.com/ot4562-glitch/HUFS-One-AI/pull/392#pullrequestreview-5818347868) | TASK-00, Chrome, NCP, Pages all SUCCESS |
| [#393](https://github.com/ot4562-glitch/HUFS-One-AI/pull/393) | `378cfeae78a9eef90602bb93a233d4ccb104f2c6` | `307ad29b5422a664405cf698e95526859cacc1cd` | [5818348002](https://github.com/ot4562-glitch/HUFS-One-AI/pull/393#pullrequestreview-5818348002) | TASK-00, Chrome, NCP, Pages all SUCCESS |
| [#394](https://github.com/ot4562-glitch/HUFS-One-AI/pull/394) | `4b0cc3af4224f85f5b15a6483bea4ed447cbb19d` | `85de975d5102ba7f95d2b598c8e518ee5d5c92db` | [5818348703](https://github.com/ot4562-glitch/HUFS-One-AI/pull/394#pullrequestreview-5818348703) | 신규 audit, TASK-00, Chrome, NCP all SUCCESS |
| [#395](https://github.com/ot4562-glitch/HUFS-One-AI/pull/395) | `0e9e0f755acb1a9eeb29336a5c9285312d7a9f1f` | `234d072ac8c292316851f5f653faa1a2ca23033b` | [5818348867](https://github.com/ot4562-glitch/HUFS-One-AI/pull/395#pullrequestreview-5818348867) | TASK-00, Chrome, NCP, Pages all SUCCESS |
| [#396](https://github.com/ot4562-glitch/HUFS-One-AI/pull/396) | `ada6c923dd20f78fe2f8adaaba8397c9529f388a` | `be2e8566fd64717753e32441f75f3a8de8fa6d29` | [5818348993](https://github.com/ot4562-glitch/HUFS-One-AI/pull/396#pullrequestreview-5818348993) | TASK-00, Chrome, NCP all SUCCESS |

모두 `ot4562-glitch` 소유자의 자기 작성 PR입니다. 리뷰 이벤트는 **COMMENT**이며, GitHub가 금지하는 self-APPROVED 또는 독립 사람 APPROVED로 표시하지 않습니다. 사용자의 본 PR 병합 지시에 의한 예외로 진행했으며 실제 OIDC, 학교 자료, 독립 수용/사람 Gold, NCP 및 유료 HCX 실행의 승인이 아닙니다. 각 PR의 병합 당시 exact HEAD를 `expected_head_sha`로 지정해 squash merge 했습니다. 중간 `mergeable=false`는 main 변경 후 GitHub의 일시 재계산으로 확인돼 재조회 후 병합했습니다. 그 상태를 CI failure로 착각하거나 강제 push하지 않았습니다.

### 감사 CI 실행 근거

- `Read-only npm dependency vulnerability audit` [Actions run 42490419934](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42490419934), job 128761350368: 오프라인 parser 테스트 6건 통과, lockfile 런타임·개발 전용 `critical/high/moderate/low/info = 0`, 최종 `AUDIT_PASS`. 해당 실행 당시의 공개 advisory 범위 결과이며 영구적인 무결점 보장은 아닙니다.
- `npm audit` 신규 게이트는 PR/main/schedule/manual 시도, sparse checkout과 `--omit=dev` 비교, scanner unavailable 실패를 구현했습니다. GitHub Private Dependabot alerts/CodeQL 실제 활성 상태·정책 예외는 연결 권한으로 확인하지 못해 #378을 OPEN 유지합니다.
- 모든 PASS는 각 PR HEAD 기준, Chrome 자동화/일회용 PostgreSQL/오프라인 NCP 계약입니다. 이후 main push SHA의 종합 CI/실운영 성공을 자동으로 전용하지 않습니다.

## 2. 추가로 이전에 병합되어 있던 결함 수정 PR

| PR | 이슈/수정 | 이 턴 확인한 상태 |
| --- | --- | --- |
| [#383](https://github.com/ot4562-glitch/HUFS-One-AI/pull/383) | #364 중복 멘토·튜터링·상담 ID | MERGED, `52916f2` |
| [#385](https://github.com/ot4562-glitch/HUFS-One-AI/pull/385) | #365 Asia/Seoul 정책 날짜 | MERGED, `f94eda3` |
| [#384](https://github.com/ot4562-glitch/HUFS-One-AI/pull/384) | #370·#371 윤년/날짜 없는 취소 | MERGED, `3af0299` |
| [#387](https://github.com/ot4562-glitch/HUFS-One-AI/pull/387) | #380 배지 요건별 다른 활동 배정 | MERGED, `c405423` |
| [#388](https://github.com/ot4562-glitch/HUFS-One-AI/pull/388) | #379 적용 기간별 교환 정책 결정 | MERGED, `0a9dee7` |
| [#389](https://github.com/ot4562-glitch/HUFS-One-AI/pull/389) | #373 활동 출처 동일 판본 충돌 격리 | MERGED, `86e1b50`; **FAQ는 미해결** |
| [#390](https://github.com/ot4562-glitch/HUFS-One-AI/pull/390) | #381 API OCR 신뢰원본 중복 line ID 격리 | MERGED, `502898b`; **공통 matchesImageSpan 미해결** |

## 3. 병합하지 않은 PR — 공식 변경 요청

| PR | 작성자 | 차단 사유 | 결정 |
| --- | --- | --- | --- |
| [#361](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361) | `uisang2004-maker` | 서로 다른 FAQ 문서에서 citation ID 중복과 부정 문장 극성 반전이 통과 | CHANGES_REQUESTED; 새 패치·재시험 전 병합 불가 |
| [#372](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372) | `uisang2004-maker` | OCR 한 줄의 다중 기간 누락·기관 부분문자열 동등 처리·PII 마스킹 | CHANGES_REQUESTED; 새 패치·재시험 전 병합 불가 |
| [#386](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386) | `uisang2004-maker` | 요구/경험 ID 중복으로 철회 출처를 의미 후보에 결속, 보호특성 문자열 오탐 | CHANGES_REQUESTED; 새 패치·재시험 전 병합 불가 |

담당자의 후속 코드가 올라오면 해결된 diff와 반례를 재검토한 뒤 정확한 새 HEAD CI·독립 교차검증을 요청합니다. 과거 성공 workflow만으로 변경 요청을 해제하지 않습니다.

## 4. 이슈 완료 표시와 남겨 둔 범위

- **코드 결함 완료:** #363(#391), #364(#383), #365(#385), #369(#392 + 후속 브라우저 회귀), #370/#371(#384), #374(#395), #376/#377(#393), #379(#388), #380(#387). 각 이슈에 PR·main squash·자동화 범위 및 미인수 사실을 기록하고 `closed/completed`로 정리합니다.
- **부분 해결 / OPEN:** #367(#396의 조립만, 현재 운영 출처 미연결), #373(#389 활동만; FAQ 충돌 미검증), #381(#390 API만; 공통 contract 미검증), #378(#394 SCA CI만; Dependabot/CodeQL 설정 미확인), #366(10개 순수 엔진 API/DB/UI 연결), #375(경험↔교과 원장/권한 연결), #362(공개 CSV 권리/재식별 검토).
- **개발+자료+실인수 OPEN:** 13개 추가 기능 #339–#341/#343–#352, 자료 #360. 원본 공개·외부 AI 전송·개인정보 동의는 실제 사람·기관 별도 검증이 필요합니다.
- **불변 역할 이슈:** #355–#359는 읽기 전용. 제목·본문·댓글·라벨·담당자·상태·마일스톤 등 어느 쓰기도 하지 않았습니다.
- **원본 CSV:** 5개 추적 원본의 내용·경로·이름·인코딩·Git 기록은 수정·삭제하지 않았습니다. 공개 게시 위험 #362가 해결됐다는 뜻이 아닙니다.

## 5. 출시 게이트

**OWNER_CONFIRMED_APPROVED**는 프로젝트 소유자 승인이지 학교 학사 공식 인증, 개인별 현재 권리, 실제 NCP/PG 적용, 실계정 로그인, 인수·복구, 유료 HCX/OCR 청구 또는 독립 사람 Gold 평가 통과를 대신하지 않습니다. 따라서 **`RELEASE_BLOCKED`**입니다. 실증 증거는 기능별 이슈·데이터 요청 #360·#362/#366/#367/#375와 [운영 절차](PRODUCTION_RUNTIME.md)에 분리해 추적합니다.

## 관련 정본

[현재 STATUS](../STATUS.md) · [PR 리뷰 규칙](PR_WORKFLOW.md) · [프로덕션 구성](PRODUCTION_RUNTIME.md) · [팀 책임](WORKSTREAMS.md) · [데이터 거버넌스](DATA_GOVERNANCE.md) · [보관된 2026-11-07 상태](archive/STATUS_20261107.md).
