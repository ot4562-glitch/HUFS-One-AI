# 추가 기능 코어 선행 구현 (#341–#352)

이 디렉터리는 **학교 운영 데이터·웹페이지·유료 AI를 전혀 연결하지 않는 순수 계산 코어**입니다. 확정 학교 자격/발급/상담/취업률을 생성하지 않습니다. 구현 책임 분리 지시에 따라 모델 포트·프런트엔드·DB·NCP 배치 코드는 여기서 건드리지 않습니다.

## 진행 매핑

| 이슈 | 코어 함수 | 현재 제공하는 것 | 이어받을 팀 |
| --- | --- | --- | --- |
| #341 | 기존 [PR #342](https://github.com/ot4562-glitch/HUFS-One-AI/pull/342) | FAQ·RAG 합성 구현 후보, 중복 개발 없음 | AI 연결/품질 #321·#322, 데이터 #324, 배치 #323 |
| #342 | GitHub PR 번호 | 독립 기능 이슈가 아님 | 기존 PR 리뷰/인수 |
| #343 | `evaluateScholarship` | 판본 검증된 장학 조건별 MET/NOT_MET/UNKNOWN | 실제 모집요강 #324, UI #323 |
| #344 | `rankMentors` | 전공·직무·승인 경험의 결정론적 유사도 정렬·근거 목록 | 멘토 출처 #324, AI rerank #321·#322, UI #323 |
| #345 | `routeCounseling` | 문의 목적/캠퍼스/언어 기반 공식 기관 후보 3곳 | 공식 기관 #324, 웹 #323 |
| #346 | `prepareActivityRecognition` | 활동별 증빙 종류와 인정 준비 상태(공식 인정 아님) | 자료 #324, OCR·문서 분류 #321·#322, UI #323 |
| #347 | `compareJobRequirements` | NCS형 직무 요구 토픽↔본인 승인 경험 근거 매핑 | 공식 NCS 매핑 #324, AI 검증 #321·#322, UI #323 |
| #348 | `searchApprovedOpportunities` | 전체 **호출자가 권한 확인한** 카탈로그의 필터·안정 커서 페이징 | 데이터 #324, 서버 검색/웹 연결 #323·#325 |
| #349 | `evaluateBadgePreparation` | 오픈배지 요건별 서로 다른 자기승인 경험 집계·확인 | 공식 배지요건 #324, UI #323 |
| #350 | `recommendLearningPrograms` | 학습 목표/수강 과목/관심 주제 기반 추천·자격 보류 | 모집 자료 #324, AI rerank #321·#322, UI #323 |
| #351 | `calculatePublicEmploymentRate` | 숫자 0/미관측/소표본 억제·검증된 집계 비율 | 출처/공개 규정 #324, AI 해설 #321·#322, 시각화 #323 |
| #352 | `selectInternationalGuide` | 적용 캠퍼스·학기 검증과 사람 검수 번역 우선/한국어 안전 대체 | 공식 다국어·사람 번역 #324, UI #323 |

## 소비자 연결을 위한 절대 계약

1. **값이 존재한다는 사실은 자료 이용권·공식성/최신성의 증거가 아닙니다.** 이 모듈의 `VERIFIED` 입력은 검수된 source head에서만 주입해야 합니다. 실제 검수 없이 하드코딩한 `VERIFIED`는 합성 테스트 외 금지입니다.
2. API는 매 요청 전/후 actor·role·purpose별 consent·SourceRevision/rights·asOf를 확인하고 RLS/CSRF 및 낡은 응답·다중 탭 방어를 합니다. `searchApprovedOpportunities`의 cursor는 **신뢰되지 않는 내부 값을 표현한 것일 뿐**, HTTP에 그대로 노출해서는 안 됩니다. 서버에서 actor/source/filter와 결속하여 서명된 opaque cursor로 변환하고 교차 검증합니다.
3. `RULE_ONLY`는 네이버 HCX/GPT/Laya **모델 호출 없음**을 의미합니다. AI가 필요할 때는 박준영·이의상의 서버 포트가 별도 실행·검증 후 후보만 입력하고, 적격·발급·마감·학교 규정 판단은 AI 점수로 덮지 않습니다.
4. `READY_TO_CHECK`, `READY_FOR_OFFICIAL_REVIEW`, `SUPPORTED_BY_EVIDENCE`는 본인이 준비하거나 증빙을 연결할 준비 상태일 뿐 기관 인증·발급 또는 합격을 의미하지 않습니다.
5. 취업통계의 0 공개·소표본 억제는 **출처별 공개 규칙**의 승인과 분리할 수 없습니다. 현재 계산 함수는 검증된 정책을 인자로 요구하며 정책 미확인 시 공개를 막습니다.
6. 기존 `csv/` 5개 원본은 변경하지 않습니다. 이 PR은 `packages/core/src/feature-additions/` 신규 파일 외 다른 영역을 건드리지 않습니다.

## 검증·미완료 표기

- 자동 테스트: `npx vitest run packages/core/src/feature-additions/feature-additions.test.ts`.
- 타입 검사: `npm run typecheck` (프로젝트 전체 타입 오류 발생 시 본 PR 신규 코드와 기존 지역 수정/다른 협업자 파일의 오류를 별도로 기록).
- 여기서 자동 검증하더라도 실자료·사람 Gold·API/DB·실 AI·NCP·웹 UI는 **NOT_RUN / NOT_CONNECTED**입니다.
- 코어/DTO 소비 인터페이스를 기존 앱 API와 조립해 실제 화면에 장착하는 일은 #323, 모델/품질은 #321·#322, 데이터는 #324의 작업으로 인계합니다. 출시 승인은 #325 별도입니다.
## 2026-11-08 확장 구현 — v2 계산 엔진·계약 인계

기존 v1 함수는 중간 착수 버전으로 보존한다. **추가 구현의 소비자는 v2 함수를 기준**으로 개발한다. 기본 계산 로직뿐 아니라 Zod 입력/출력 검증, 권리/시점 경계, 모델 결과 재검증 및 부정 회귀를 추가했다.

| 문제 | 구체 구현 파일 / export | 소비자 계약 |
| --- | --- | --- |
| #343 장학금 | scholarships-v2.ts: checkScholarship — 정책 학기/적용기간, ALL/ANY, GPA 등 검증 사실, 누락·상충·마감 | ScholarshipPolicySchema / ScholarshipReportV2Schema |
| #344 멘토 | mentors-v2.ts: rankMentorsV2 — 전공·직무·본인 승인 경험 가중치, 검증된 semantic 후보만 선택 재정렬, 이유 코드 | MentorCardSchema, MentorPreferenceSchema / MentorRankingV2Schema |
| #345 상담 | counseling-v2.ts: routeCounselingV2 — 목적·캠퍼스·언어·학생 대상 확인, 상위 3기관, 공개 HTTPS 링크 | CounselingServiceSchema / CounselingGuideV2Schema |
| #346 교외활동 | recognition-v2.ts: prepareRecognitionV2, classifyProofCandidate — ALL/ANY 서류, 만료, 본인검토, 제출준비만 | ActivityRecognitionRuleSchema, ActivityProofSchema / RecognitionReportV2Schema |
| #347 직무 | skills-v2.ts: compareSkillsV2, reviewSkillMatchProposals — 공식 NCS 코드↔정본 24 TopicCode 교차표, 미매핑/기록없음 구분 | JobRequirementSchema, TopicCrosswalkSchema / SkillRowV2Schema |
| #348 공고 | catalog-v2.ts: searchApprovedCatalogV2 — **허가된 전체 스냅샷 내** 검색/필터/안정 정렬/커서. 실DB SQL·서버 서명은 API 담당 | OpportunityCatalogItemSchema, OpportunityQuerySchema / SignedCatalogPageV2Schema |
| #349 배지 | badges-v2.ts: prepareBadgeV2 — 발급 기준 ALL/ANY·서로 다른 승인경험·기간·발급 분리 | BadgeDefinitionSchema / BadgePreparationV2Schema |
| #350 튜터링 | learning-v2.ts: recommendLearningV2 — 학습목표/관심과목, 학기·캠퍼스·정원·선수과목(검증값만), AI 후보검증 | LearningProgramSchema / LearningRankingV2Schema |
| #351 취업통계 | employment-v2.ts: evaluatePublishedStat, comparePublishedStats, validateEmploymentStatements — 표본 공개 억제·분자/분모·AI 수치 근거 검산 | EmploymentAggregateSchema / EmploymentValueV2Schema |
| #352 국제학생 | international-v2.ts: resolveInternationalGuide, reconcileGuideChecklist — 학기/캠퍼스·대상, 사람 승인 KO/EN/ZH 및 한국어 대체·체크리스트 버전 | InternationalGuideSchema / GuideResolutionV2Schema |

계약 import: 패키지 @hufs-one/contracts의 FeatureAdditions 네임스페이스를 사용한다. 순수 코어 export: packages/core/src/feature-additions/index.ts. 계약 결과는 실제 core 출력이 Zod 스키마와 정확히 맞는지 tests/contracts/feature-additions-results.test.ts에서 검증한다.

### 팀이 장착할 때 절대 지켜야 할 경계

- 검증된 SourceRevision과 개별 자료 사용권, 현재 actor/consent/RLS, asOf를 API에서 **요청 전후** 재확인한다. source-policy.ts의 verifySource는 도메인 자료의 VERIFIED/CLEARED/시점 확인용이며, 학생 인증이나 실제 데이터 권리를 대신하지 않는다. source.status SYNTHETIC는 명시적 SYNTHETIC 모드에서만 사용 가능.
- 장학금 자격이 MET여도 지급/수혜 승인은 아니다. 인정 서류의 READY_FOR_OFFICIAL_REVIEW도 학교 인정 완료가 아니다. 오픈배지 READY_TO_REQUEST_REVIEW는 발급이 아니다. AI 관련성 점수는 공식 자격·지원/배정 결과를 만들지 못한다.
- SemanticProposalSchema의 후보 ID, 승인된 근거 코드, 입력 digest, 모델 버전이 모두 맞아야 모델 후보를 적용한다. 박준영·이의상이 권한 확인·개인정보 제거·실제 모델 연결·독립 Gold/품질과 비용 경계를 맡는다. core는 모델을 **호출하지 않는다**.
- searchApprovedCatalogV2가 반환하는 내부 커서는 HTTP 토큰이 아니다. 기존 API는 actor/consent/SourceRevision/asOf/필터에 결속한 **서명된 opaque cursor**로 변환해야 한다. 대량 실DB에서 정렬의 키셋 SQL/인덱스는 이서연·통합 담당이 구현한다. 이 pure 함수는 승인된 스냅샷의 참조 정답을 제공한다.
- 출처별 통계의 최소 공개 셀 수, zero 공개 정책, 집계 정의는 김채윤의 자료 판본에 근거해 주입한다. 미확인 값은 공개 차단. 공식 URL은 OfficialHttpsUrlSchema로 javascript/http/내부 호스트 등을 제거하고 서버는 별도 허용 도메인 목록으로 재검증한다.
- 본 코어 PR은 실학생 자료·실 API/DB·웹사이트 배치·NCP 서버·유료 모델 실행이 모두 **NOT_CONNECTED/NOT_RUN**. 실제 기관 자료·권리는 #324, 사이트 장착은 #323, AI 연결/품질은 #321·#322, 통합/출시는 #325에서 인수한다. 기존 csv/ 5개 파일 원본 불변.

### 재현 명령

- npm run build:contracts
- npx vitest run packages/core/src/feature-additions tests/contracts/feature-additions-v2.test.ts tests/contracts/feature-additions-results.test.ts
- npm run typecheck

코어·계약의 해당 테스트는 2026-11-08 로컬 **193개 PASS**. 전체 로컬 주작업트리에는 범위 밖의 node-approved-egress.ts Headers iterable TS2488이 있어 full-root typecheck는 별도 실패로 보존; 정확한 PR HEAD CI 결과와 사람/실운영 인수는 별도 기록한다.
