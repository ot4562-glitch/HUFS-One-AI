# 공유 contracts는 통합 담당자 소유

Architecture.md가 상세 구현 정본이다. 계약 파일은 **팀장만 수정**하며 각 소비 트랙은 읽고 변경 요청 이슈를 제기한다.

| 계약 | 설계 참조 | 제공자 → 소비자 |
| --- | --- | --- |
| Actor, DemoContext, SharingGrant | A02 | API → UI/QA |
| DemoSnapshot 및 버전·권한 봉투 | A02·A13 | API → UI/모든 코어 |
| 24개 TopicCode·alias | A04 | 추천 제안 → 통합 고정 → UI/AI/QA |
| FeedResult, FEATURED_LARGE/COMPACT_LIST | A04~05 | 추천 → UI/API |
| NoticeResult | A07 | 공지 → UI/학업/API |
| RulePack, AcademicSummary, Outlook | A08~09 | 학업 제안 → 통합 승인 → UI/API |
| SafeLlmPacket 및 JSON 증거 | A06 | API/CLOVA → 추천/UI |
| Forms 26열과 수강과목 CSV 6열 | A03 | import → 학업/QA |
| 인증·권한·오류 enum, API v1 | A02·A13 | 통합/API → 전체 |

**학업 계약 추가 검수 원칙:** `RulePackDraft`는 아직 코드 타입이 아닌 **내부 작성 보조의 후보 산출물**이다. 실제 RulePack 확정 전에는 공식 source clause/exception/effective scope와 `evidenceRefs`의 양방향 완전성 및 독립 승인을 검사한다. 전망의 `asOf`/coverage·0/n과 미확인·IoU와 전체 정확도의 구분은 A09.5 계약을 따른다. 다섯 번째 공개 AI 작업, migration, NCP 호출을 이 문서만으로 만들지 않는다.

계약 수정: **TASK 이슈 → 영향 소비자 검토 → 버전/마이그레이션 계획 → contracts 전용 PR → 팀장 병합 → 기능 브랜치 재동기화.**

각 에이전트는 독립적으로 같은 타입을 발명하지 않는다. 실제 학생별 계산 정답 하드코딩, LLM 판정값을 검증 없이 확정하는 행위 금지. 초기 PR에는 소스코드나 타입 정의 파일을 만들지 않는다.
