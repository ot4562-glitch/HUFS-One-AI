# TASK-00 | 네 트랙이 공유할 계약의 잠금 기준

**정본:** [Architecture.md](../Architecture.md) A02~A09·A13. 기술 총괄 심민성(`ot4562-glitch`)이 `packages/contracts`·TopicCode·공통 설정/lockfile·DB migration을 조정한다. **이 문서는 계약 제안/합의 기준이며 아직 TypeScript/Zod 구현·테스트/병합이 완료되지 않았다.** 최종 잠금은 별도 TASK-00 계약 PR로 진행한다.

| 계약 | 정본 | 제공자 → 소비자 | 반드시 확인 |
| --- | --- | --- | --- |
| Actor, DemoContext, SharingGrant | A02 | API 이서연 → UI 이의상·QA 심민성 | 인증 actor와 선택 subject 분리; grant/만료/철회 |
| DemoSnapshot, VersionEnvelope | A02·A04·A13 | API 이서연 → UI/추천/학업 | 원자적 봉투, 지연 응답·다중 탭 격리 |
| TopicCode 24개·alias | A04.1~3 | 추천 김채윤 → 통합 심민성 → UI/AI | 24개 enum 단일 출처, UNKNOWN 보존 |
| FeedResult·적격성 | A04~05 | 추천 김채윤 → UI/API | 큰 카드 최대3, 작은 목록 최대6, 전체 목록 |
| NoticeResult | A07 | 김채윤 → UI/학업/API | 학년/학과/마감/근거 분리 |
| RulePack, AcademicSummary, Outlook | A08~09 | 학업 박준영 → UI/API | 3원장, 정수학점, 검수/미확정, asOf |
| SafeLlmPacket·증거 | A06 | 이서연 → 추천·UI | 네 AI 작업, 안전 입력과 quote ID |
| Forms 26열/과목 CSV 6열 | A03 | 제한 import → 학업/QA | **4인 입력 whitelist**, 미승인 자동 연결 금지 |
| 인증·오류 enum·API v1 | A02·A13 | 이서연 → 모든 팀 | 401/403/409/422/429/503, requestId |

## 구현할 v1 타입·동작 (A02/A04/A06/A13과 동일 의미)

- **Selector:** `SubjectAlias='S01'|'S02'|'S03'|'S04'|'S05'`; `DatasetMode='REAL_CONSENTED'|'SYNTHETIC'|'MIXED'`; readiness `READY|PARTIAL|PENDING|REVOKED`. 개발팀 5명과 실제 자료 제출자 **4명**은 다른 차원이다. 미제출·미승인은 PENDING/NOT_SHARED이고 실제 정보를 임의 생성하지 않는다.
- **DemoContext 필수:** `contextId,actorId,demoSubjectId,demoRunId,sessionIdHash,datasetVersion,projectionVersion,sharingGrantVersion,expiresAt`. **actorId는 인증한 서버만 결정**하며 subject 선택이 계정·권한을 바꾸지 않는다. 한 탭의 선택을 다른 탭 전역 변수에 저장하지 않는다.
- **Snapshot:** `contextId,demoSubjectId,datasetMode,asOf,versions,feed,notices,academics,forecast,aiProvenance`. `versions`에는 `profile,projection,consent,dataset,topics,rules,overlay,rankConfig`를 포함한다. 컨텍스트·subject·grant 버전·요청 epoch가 일치할 때만 UI에 적용한다.
- **공고/공지:** 닫힌 24 TopicCode, 미지정 UNKNOWN, 적격성 `ELIGIBLE|INELIGIBLE|UNKNOWN`, 단계별 근거·출처·dataMode. `FEATURED_LARGE` 최대3, `COMPACT_LIST` 최대6; 작게 표시된 원본 목록 접근권을 없애지 않는다.
- **학업:** `EARNED`/`IN_PROGRESS`/`PLANNED`를 분리하고 `creditUnits` 정수로 계산한다. `RulePackDraft`는 내부 작성/사람 승인 전 상태로, 공식 졸업 인정이나 새 공개 AI API가 아니다. Outlook은 확정/역사/UNKNOWN을 구분하고 asOf 이후 자료 유출을 금지한다.
- **CLOVA:** 제품 AI 업무는 `experience_skills`, `opportunity_terms`, `personal_action_brief`, `graduation_explanation`의 **네 작업**이다. 구조화 JSON/quote를 실제 자격·학점 검증 대신 사용하지 않으며 개인정보 원본/actor/subject 매핑을 제공자에 보내지 않는다.
- **API 오류:** 통일된 응답 봉투는 `{code,message,requestId,retryable,contextId?}`. 상태 401(인증), 403(미공유/철회), 409(버전), 422(스키마/근거), 429(한도), 503(서비스 장애). 세부 `code` literal과 Zod 스키마는 실제 계약 PR에서 하나의 정본으로 고정한다.
- **Intake:** Forms 원본은 **26열 헤더/4인 응답**을 기대하고 6열 과목 CSV는 동일 4인의 사람별 한 파일을 기대한다. `까마르` 파일명은 현 roster와 일치하지 않아 소유자·alias 승인 전 **절대 자동 연결하지 않는다**. 동명이인/중복/가명 불명확·미수령·미동의는 fail closed, 원본 이수행은 GitHub 공용 fixture로 사용 금지.

## TASK-00 승인 체크리스트 — 합성 fixture만 사용

- [ ] 실제 `packages/contracts`에 TypeScript/Zod enum·필드·입출력·API 에러 정본을 작성하고, 하나의 버전/lockfile에 고정.
- [ ] TopicCode 24개·Forms 원문 26헤더·과목 CSV 정확히 6열을 합성 정상·실패 fixture에서 검증. alias 충돌, 빠진 열, 상태 불명, 성적 열 추가, 파일명 불일치 거부.
- [ ] 5개 demo 슬롯 중 **4개만 실제 입력 대상**인 경우 PENDING/synthetic 반환을 시험. 4명의 이름→S01~S05 대응은 별도 private 매핑이며 공개 코드에 하드코딩하지 않는다.
- [ ] 정상 snapshot/403 철회/409 버전충돌/422 형식 오류/429 quota/503 장애 합성 API 응답과 타입·Zod 검증. 20개 유향 전환·지연 응답·2탭 독립·캐시 철회 시험.
- [ ] A08 학점 9개·예외 누락 4개 독립 기준, A09 UNKNOWN/0/n·시간누출 차단을 소유 트랙의 소비 계약에 연결.
- [ ] 실제 학생 자료·Form 원문·비밀키·외부 AI 호출 없이 모든 계약 시험 실행. `.dockerignore`의 `csv/` 전체 제외와 Git/CI 차단 유지.
- [ ] **이의상(UI), 김채윤(추천), 박준영(학업), 이서연(API)** 소비자 검토 내용/미검증을 기록하고 심민성이 최종 승인. PR merge SHA·contractVersion을 후속 트랙 시작점으로 지정.

**변경 순서:** TASK-00 이슈 → 이 문서/A02~A13 기준 합성 fixture → `chore/contracts-...` 전용 PR → 네 소비자 교차검토 → 통합 담당 최종 병합 → 각 기능 브랜치 재동기화. 소비자가 공통 타입을 독자 생성하거나 실제 CSV를 fixture로 업로드하는 것은 금지한다.
