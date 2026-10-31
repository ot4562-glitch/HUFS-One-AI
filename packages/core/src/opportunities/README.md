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
