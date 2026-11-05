# HUFS One AI — 추천/적격 순수 코어

`evaluateOpportunity`, `rankOpportunities`, `composeFeed`는 **순수 계산**이다. 호출 서비스(Fastify/SQL)가 현재 actor·SharingGrant/Consent, `SourceRights`(collect/store/display), 승인된 SourceRevision·검수 시각/asOf, paragraph/image 근거·active status/원본 무효화를 먼저 검증해야 한다.

## 호출 전 API 필수 조건

| 입력 | 책임 |
| --- | --- |
| 현재 활성·검토 완료 opportunity/source revision | 금지/취소/정정·미검수/비활성·미래판본 제외 |
| 허용된 student projection/TopicCode·학사·경험 | 현재 actor+grant/consent·subject/asOf에 바인딩, 다른 학생 원본/내부 metadata 차단 |
| 확정 마감/verified claim과 원문 paragraph SHA | 출처가 보증한 시점/적용 scope/claimCheckedAt. 후보/이미지 bbox·분쟁 상태는 코드가 검증 후 보수적 `UNKNOWN` |
| 순수 계산 캐시와 상태 | source/claim/retrieval·profile/grant/version/asOf·rank 정책 변경시 재계산/철회 |

## 코어 자체의 안전 규칙

- `publishedAt > asOf`는 미래 노출을 격리. 출처/게시 시각 미확인은 `UNKNOWN`으로 보류하며 새 확정 자격/마감을 만들어 내지 않는다.
- `ELIGIBLE`, `INELIGIBLE`, `UNKNOWN`과 `OPEN/UPCOMING/CLOSED/STALE/CONFLICT`는 다른 차원. 원문 비검수/철회/시간 충돌·권리 미확인 상태를 ELIGIBLE로 올리지 않는다.
- TopicCode24 enum/alias 검증, 검색·추천 근거/score/eligibility를 구별. 점수는 **취업 확률/합격률이나 지원 자격의 확정 비율이 아님**.
- source head/rights 검수시각/asOf·claim exact text/image bbox가 맞는 현재 증거만 입증된 정보로 사용한다. Laya/HCX confidence 자체가 검수·자격이 아니다.

**품질 목표:** 고정 40공고×5 합성 슬롯 200개 케이스의 실제 비작성자 Gold(현재 0/200), 근거/조건 precision/recall·P@3/nDCG/false eligibility 평가. 개발 코드·CI는 실출처 이용권·독립 사람 판정과 구분.

[계약](../../../../Architecture.md) · [RAG](../../../../docs/TRUSTED_RAG_MEDIA_VERSIONING.md) · [인수 #252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).
