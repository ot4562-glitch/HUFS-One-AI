# 추천 코어 (TASK-06) — 호출 전 계약

`evaluateOpportunity` / `rankOpportunities` / `composeFeed`는 **순수 함수**입니다. 입력이 허가·검수된 자료인지 스스로 확인할 수 없으므로, 아래 사전조건은 **호출하는 API 서비스가 보장**해야 합니다(일반 웹·REST API 담당 심민성, [#19](https://github.com/ot4562-glitch/HUFS-One-AI/issues/19)·[#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)).

## API가 호출 전에 보장할 것 (코어가 검사하지 못함)

| 사전조건 | 이유 |
|---|---|
| `Opportunity`는 **active·검수 완료**(삭제/금지/REJECTED/비활성 제외) | 코어 계약 타입에 활성/금지 상태 필드가 없음 |
| `sourceSnapshotId`가 가리키는 `SourceSnapshot`은 `permissionRef`가 유효하고 금지 출처가 아님 | 허가 여부는 DB·출처 원장에서만 판단 가능 |
| `SourceSnapshot.fetchedAt ≤ asOf`인 판만 사용 (시점 조회 시 그 시점의 snapshot 버전) | 코어는 받은 snapshot이 asOf 시점의 판인지 모름 |
| `publishedAtBySnapshotId`는 정본 `SourceSnapshot.publishedAt`에서만 생성 | `Opportunity`에 게시시각 중복 필드를 두지 않음(통합 담당 결정) |
| `RecommendationProfile`은 **인증된 actor가 공유 승인한 projection**에서만 생성, 다른 학생 값 혼입 금지 | 코어는 학생 식별자를 받지 않음 |
| `facts`는 확인된 값만 넣고, 모르면 키를 생략 | 생략 = UNKNOWN, 추측값은 잘못된 적격 판정을 만듦 |

## 코어가 스스로 하는 방어

- `publishedAt > asOf` → `excludedFuture`로 격리, featured/compact/all에 노출하지 않음.
- 게시시각 미상 → `publication: 'UNKNOWN'`, 신선도 F=0, 노출은 유지.
- 24개 enum 밖의 TopicCode는 무시, `asOf`가 잘못되면 `RangeError`.
- `CONFLICT`·`PARTIAL`·`STALE` 자료는 ELIGIBLE을 주지 않음, `CLOSED`·`INELIGIBLE`은 별도 목록.

`FeedCard.score`는 디버그용 분해 총점입니다. 취업 확률이나 적격성 %로 표시하지 않습니다.

## 신뢰형 출처 게이트 (#10 vNext, contracts #18/PR #33 구조 호환)

API는 아래 순서로 코어를 부릅니다. 코어 입력 타입(`RevisionRecord`, `ClaimRecord`)은 vNext `SourceRevisionVNext`/`VerifiedClaimVNext`의 **구조적 부분집합**이라 PR #33 병합 후 그대로 넘길 수 있습니다.

1. `selectCurrentRevisions(revisions, asOf)` — 출처별로 asOf에 알 수 있었던 최신 revision만 고르고, `ACTIVE`·검증됨(`lastVerifiedAt ≤ asOf`)·취소 아님·유효기간 안일 때만 사용. 미래 수집/게시, 대체됨(SUPERSEDED), 분기(FORKED_CHAIN), RETRACTED/STALE/BLOCKED_RIGHTS, RESEARCH_ONLY는 `quarantined`.
2. `gateBySourceRevision(items, selection)` — `Opportunity`/`Notice`의 `sourceSnapshotId`가 사용 가능한 revisionId일 때만 통과. 모르는 revision은 `UNKNOWN_REVISION`으로 격리(현재판으로 가정하지 않음).
3. `resolveDeadlineClaims(claims, revisionId)` — 마감은 **현재 revision의 VERIFIED claim + 맞는 dateKind**(APPLY/STUDENT/ADMIN)만. EVENT 날짜·후보·이전판·모호한 문구는 무시하고, 서로 다른 VERIFIED 값은 `conflicts`로 비워 둠. Laya/HCX confidence는 입력이 아님.
4. `checkTopicCandidates(candidates, allowed, paragraphs)` — AI 주제 후보는 24 enum·패킷 허용목록·원문 문단의 실제 인용일 때만 CANDIDATE로 통과(자동 확정·자격 부여 없음).
5. `composeFeed` / `composeNotices`, 결과는 `resultCacheKey(...)`로 저장 — source revision·claim·retrieval config·projection·asOf 등 하나라도 바뀌면 키가 달라져 이전 결과를 재사용하지 않음. 학생별 projection이 키에 들어가 타 학생 캐시와 섞이지 않음.
