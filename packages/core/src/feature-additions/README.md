# 추가 기능 코어 선행 구현 (#341–#352)

## 핵심: AI 추천은 LLM 호출과 다르다

- 기본 추천은 **규칙·가중치·토픽 교집합·Jaccard·조건/시점 검증**으로 동작한다. `rankMentorsV2`와 `recommendLearningV2`는 기본적으로 `RULE_ONLY`이며 **HCX-007 또는 외부 LLM 호출이 전혀 없다**.
- #339의 반복 행사 전망은 과거 일정 통계, #340 교환 자격은 판본별 규칙으로 계산한다. **#341의 자연어 FAQ RAG 답변**만 명시적으로 HCX-007을 필요로 한다. 다른 10개 기능에 HCX-007을 강제하지 않는다.
- 추천 엔진의 최종 방식(가중치 조정, 형태소·동의어/집합 매칭, 임베딩, 필요한 경우에만 LLM)은 **박준영·이의상**이 결정한다. 기본 알고리즘을 대체하거나 추가 재정렬할 때도 기존 자격·근거·출처 검증은 유지한다. 모델 미설정/실패 시 규칙 추천으로 복귀한다.
- `SemanticProposalSchema.modelVersion`은 추가 전략의 **버전 식별자**이며 LLM 구동 증거가 아니다. `AI_RERANKED`는 입력된 재정렬 후보가 검증됐음을 의미하지 유료 모델이 사용됐다는 뜻이 아니다.

## 현재 협업·코드 소유·자료 인수 (2026-11-08)

**고정 `[본선 진출 이후]` 역할 이슈 #355–#359는 읽기 전용**이며 본문/댓글·담당·상태 등 어떤 쓰기 변경도 수행하지 않는다. [자동 이슈 배정 플레이북](../../../../docs/ISSUE_ASSIGNMENT_PLAYBOOK.md) · [팀 업무](../../../../docs/WORKSTREAMS.md).

| 담당 | 현재 개발/인수 방식 |
| --- | --- |
| **심민성** | 새 추가기능 **최초 assignee**로 구조를 설계하고 일반 Core·Contracts/API/DB/보안·비AI 기능/통합·테스트를 **가능한 한 직접 구현**한다. 코드 기반 AI가 겹치는 즉시 AI 주작성자에게 해당 구현을 인계하고 상시 코드 검수를 계속한다. |
| **박준영·이의상** | 두 사람 중 주구현자가 **코드 기반 추천·규칙 AI·랭킹·NLP/OCR/RAG·HCX-007 등 모든 AI 기능**을 구현한다. 상대 AI 개발자는 교차 리뷰/수정 피드백, 박준영은 AI 제품 기술 QA/재시험을 주도한다. |
| **김채윤** | **별도 `[데이터 요청]` 이슈**에서 공식 원문·포스터·출처/목적별 이용권·독립 Gold·웹 디자인 자산을 확보한다. 해당 기능에 **공동 assignee**로 참여해 자료를 직접 입력하며 전체 서비스를 가볍게 시연/제보한다. **기존 13개 기능 대규모 자료 요청: [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360).** |
| **이서연** | 김채윤의 허가된 실포스터/문구를 활용해 웹 UI/UX·기능/API·콘텐츠를 실제 기존 사이트에 배치한다. |

**현재 기능 담당:** 박준영은 #339/#340/#344/#348/#349/#350, 이의상은 #341/#343/#345/#346/#347/#351/#352의 AI/후속 개발 주담당이며, **모두 김채윤 공동 assignee**다. PR #342/#353은 심민성이 구현한 **기본 구조·합성 코어**이고 API/DB·실데이터·UI·QA/독립 인수는 별개로 추적한다. 아직 이 PR의 Pure Core가 실운영 출시됐다는 뜻은 아니다.

## 진행 매핑

| 이슈 | 코어 함수 | 현재 제공하는 것 | 이어받을 팀 |
| --- | --- | --- | --- |
| #341 | 기존 [PR #342](https://github.com/ot4562-glitch/HUFS-One-AI/pull/342) | FAQ·RAG 합성 구현 후보, 중복 개발 없음 | AI 연결/품질 #355·#356, 데이터 #358, 배치 #357 |
| #342 | GitHub PR 번호 | 독립 기능 이슈가 아님 | 기존 PR 리뷰/인수 |
| #343 | `evaluateScholarship` | 판본 검증된 장학 조건별 MET/NOT_MET/UNKNOWN | 실제 모집요강 #358, UI #357 |
| #344 | `rankMentors` | 전공·직무·승인 경험의 결정론적 유사도 정렬·근거 목록 | 멘토 출처 #358, AI rerank #355·#356, UI #357 |
| #345 | `routeCounseling` | 문의 목적/캠퍼스/언어 기반 공식 기관 후보 3곳 | 공식 기관 #358, 웹 #357 |
| #346 | `prepareActivityRecognition` | 활동별 증빙 종류와 인정 준비 상태(공식 인정 아님) | 자료 #358, OCR·문서 분류 #355·#356, UI #357 |
| #347 | `compareJobRequirements` | NCS형 직무 요구 토픽↔본인 승인 경험 근거 매핑 | 공식 NCS 매핑 #358, AI 검증 #355·#356, UI #357 |
| #348 | `searchApprovedOpportunities` | 전체 **호출자가 권한 확인한** 카탈로그의 필터·안정 커서 페이징 | 데이터 #358, 서버 검색/웹 연결 #357·#359 |
| #349 | `evaluateBadgePreparation` | 오픈배지 요건별 서로 다른 자기승인 경험 집계·확인 | 공식 배지요건 #358, UI #357 |
| #350 | `recommendLearningPrograms` | 학습 목표/수강 과목/관심 주제 기반 추천·자격 보류 | 모집 자료 #358, AI rerank #355·#356, UI #357 |
| #351 | `calculatePublicEmploymentRate` | 숫자 0/미관측/소표본 억제·검증된 집계 비율 | 출처/공개 규정 #358, AI 해설 #355·#356, 시각화 #357 |
| #352 | `selectInternationalGuide` | 적용 캠퍼스·학기 검증과 사람 검수 번역 우선/한국어 안전 대체 | 공식 다국어·사람 번역 #358, UI #357 |

## 소비자 연결을 위한 절대 계약

1. **값이 존재한다는 사실은 자료 이용권·공식성/최신성의 증거가 아닙니다.** 이 모듈의 `VERIFIED` 입력은 검수된 source head에서만 주입해야 합니다. 실제 검수 없이 하드코딩한 `VERIFIED`는 합성 테스트 외 금지입니다.
2. API는 매 요청 전/후 actor·role·purpose별 consent·SourceRevision/rights·asOf를 확인하고 RLS/CSRF 및 낡은 응답·다중 탭 방어를 합니다. `searchApprovedOpportunities`의 cursor는 **신뢰되지 않는 내부 값을 표현한 것일 뿐**, HTTP에 그대로 노출해서는 안 됩니다. 서버에서 actor/source/filter와 결속하여 서명된 opaque cursor로 변환하고 교차 검증합니다.
3. `RULE_ONLY`는 네이버 HCX/GPT/Laya **모델 호출 없음**을 의미합니다. AI가 필요할 때는 박준영·이의상의 서버 포트가 별도 실행·검증 후 후보만 입력하고, 적격·발급·마감·학교 규정 판단은 AI 점수로 덮지 않습니다.
4. `READY_TO_CHECK`, `READY_FOR_OFFICIAL_REVIEW`, `SUPPORTED_BY_EVIDENCE`는 본인이 준비하거나 증빙을 연결할 준비 상태일 뿐 기관 인증·발급 또는 합격을 의미하지 않습니다.
5. 취업통계의 0 공개·소표본 억제는 **출처별 공개 규칙**의 승인과 분리할 수 없습니다. 현재 계산 함수는 검증된 정책을 인자로 요구하며 정책 미확인 시 공개를 막습니다.
6. 기존 `csv/` 5개 원본은 변경하지 않습니다. 이 PR에는 `packages/core/src/feature-additions/` 이외에 `packages/contracts/src/feature-additions/` 및 NCP IaC 오프라인 CI의 안전한 수정도 포함한다. 기존 `csv/` 5개 원본은 변경하지 않는다.

## 검증·미완료 표기

- 자동 테스트: `npx vitest run packages/core/src/feature-additions/feature-additions.test.ts`.
- 타입 검사: `npm run typecheck` (프로젝트 전체 타입 오류 발생 시 본 PR 신규 코드와 기존 지역 수정/다른 협업자 파일의 오류를 별도로 기록).
- 여기서 자동 검증하더라도 실자료·사람 Gold·API/DB·실 AI·NCP·웹 UI는 **NOT_RUN / NOT_CONNECTED**입니다.
- 코어/DTO 소비 인터페이스의 실제 API·웹 장착은 심민성이 비AI 통합을 구현하고 이서연이 기존 UI에 배치합니다. AI 구현·교차검증/QA는 박준영·이의상이 진행하며, 실데이터/Gold는 김채윤의 독립 요청 #360으로 인수합니다. 출시 판단은 심민성이 전 과정 검수합니다.
## 2026-11-08 확장 구현 — v2 계산 엔진·계약 인계

기존 v1 함수는 중간 착수 버전으로 보존한다. **추가 구현의 소비자는 v2 함수를 기준**으로 개발한다. 기본 계산 로직뿐 아니라 Zod 입력/출력 검증, 권리/시점 경계, 모델 결과 재검증 및 부정 회귀를 추가했다.

| 문제 | 구체 구현 파일 / export | 소비자 계약 |
| --- | --- | --- |
| #343 장학금 | scholarships-v2.ts: checkScholarship — 정책 학기/적용기간, ALL/ANY, GPA 등 검증 사실, 누락·상충·마감 | ScholarshipPolicySchema / ScholarshipReportV2Schema |
| #344 멘토 | mentors-v2.ts: rankMentorsV2 — 전공·직무·본인 승인 경험 가중치, 검증된 semantic 후보만 선택 재정렬, 이유 코드 | MentorCardSchema, MentorPreferenceSchema / MentorRankingV2Schema |
| #345 상담 | counseling-v2.ts: routeCounselingV2 — 목적·캠퍼스·언어·학생 대상 확인, 상위 3기관, 공개 HTTPS 링크 | CounselingServiceSchema / CounselingGuideV2Schema |
| #346 교외활동 | recognition-v2.ts: prepareRecognitionV2, classifyProofCandidate — ALL/ANY 서류, 만료, 본인검토, 제출준비만 | ActivityRecognitionRuleSchema, ActivityProofSchema / RecognitionReportV2Schema |
| #347 의미 후보 (이의상) | skills-semantic.ts: proposeSkillMatches, compareSkillsWithCandidates — 요건 문장↔승인 경험 설명의 역량 개념 사전+글자 bigram 점수, 입력 digest 결속 SemanticProposal. 규칙 결과 위에 후보만 추가, 근거 없는 행은 NEEDS_REVIEW로만 전환, 보호 특성 요건 제외. 모델 호출 없음 | 입력: JobRequirement, ExperienceEvidence, 서버가 준 정제 경험 텍스트 / 출력: reviewSkillMatchProposals 통과 후보 |
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
- 본 코어 PR은 실학생 자료·실 API/DB·웹사이트 배치·NCP 서버·유료 모델 실행이 모두 **NOT_CONNECTED/NOT_RUN**. 실제 기관 자료·권리는 #358, 사이트 장착은 #357, AI 연결/품질은 #355·#356, 통합/출시는 #359에서 인수한다. 기존 csv/ 5개 파일 원본 불변.

### 재현 명령

- npm run build:contracts
- npx vitest run packages/core/src/feature-additions tests/contracts/feature-additions-v2.test.ts tests/contracts/feature-additions-results.test.ts
- npm run typecheck

당시 v2 코어·계약 **193개 PASS**는 중간 결과이며, 후속 보강으로 **230개 PASS(2026-11-08 로컬)**를 추가 확인했다. 전체 로컬 주작업트리에는 범위 밖의 node-approved-egress.ts Headers iterable TS2488이 있어 full-root typecheck는 별도 실패로 보존; 정확한 PR HEAD CI 결과와 사람/실운영 인수는 별도 기록한다.
## 2026-11-08 추가 구현·인수 준비 점검

- #343: action-planner.ts / planScholarshipPreparation 는 checkScholarship 산출물과 **같은 공식 정책 판본**을 대조한 뒤, 증빙 미확인·검증된 미충족·철회된 정책 재확인 항목을 구분한다. 별도의 장학금 지급/학교 승인 판단이 아니다. 출력 계약 ScholarshipPreparationV2Schema.
- #347: compareSkillsV2 는 matchedOneAiTopics(실제 승인된 경험과 겹친 항목)와 **requiredOneAiTopics(공식 NCS 교차표에서 요구하는 항목)**를 분리한다. 경험이 전무해도 요구 TopicCode가 살아 있어 보완 활동을 찾을 수 있다.
- #347·#349: action-planner.ts / planEvidenceOpportunities 는 **이미 actor에게 허가되고 SourceRevision이 확인된 공고 목록**에서 실제 요구 토픽과 일치하는 공고만 상위 1~10개 제안한다. 공고의 마감·캠퍼스·개인 적격·철회·중복을 적용하며, 미검증 상태는 UNKNOWN으로 표시한다. 출력 계약 EvidenceOpportunityPlanV2Schema. 이는 취업 합격·배지 발급을 보장하지 않는다.
- #344·#350: source-policy.ts / verifySemanticProposals의 requireCompleteSet 옵션은 **모든 허가 후보가 정확히 한 번, 동일 모델버전/입력 digest와 실제 근거로 제출**됐을 때만 AI 재정렬을 허용한다. 하나라도 허위 ID/중복/누락이면 전량 규칙 기반으로 복귀한다.
- #348: **서버 전용** server-cursor.ts / createCatalogCursorSigner는 Node 내장 crypto의 HMAC-SHA256을 사용한다. 실제 서버에서만 주입한 32바이트 이상 키와 최대 15분 TTL로 검색 커서를 서명·검증하고, actor/동의·출처 스냅샷·검색필터·시점이 달라지면 실패한다. 키 교체를 지원하며 토큰 내부의 학생 ID/동의 판본/검색어는 복원 불가능한 키 기반 결속값으로 저장한다. node:crypto와 서버 비밀을 쓰므로 **브라우저 공용 barrel에는 export하지 않는다**. API의 Node 코드에서 'packages/core/src/feature-additions/server-cursor.js'를 직접 import한다. 내부 Core Cursor 객체를 HTTP에 직접 넘기지 않는다.
- 계약 export 동시 편집: PR #342도 packages/contracts/src/index.ts 하단에 campus-assist를 추가한다. PR #353은 같은 파일 **상단**에 FeatureAdditions namespace를 배치해 동일 하단 줄 변경 충돌 위험을 낮췄다. 두 PR의 실제 순차 병합 후 **새 HEAD에서 CI 재확인**은 필수다.

재현 테스트: 'npx vitest run packages/core/src/feature-additions tests/contracts/feature-additions-v2.test.ts tests/contracts/feature-additions-results.test.ts tests/api/feature-cursor.test.ts'. **230/230 PASS** (2026-11-08 로컬). 타입 검사/계약 빌드도 성공. 실 OAuth·실학교 자료·학생 A/B·NCP/모델 과금·Pages 운영 URL과 본선 이후 독립 검증은 **미인수**다.

**병합 지침:** PR #342 → PR #353 순서로 비작성자 리뷰/정확한 HEAD CI를 확인하고 병합한다. 병합은 코드만 main에 합치는 작업이며 웹 화면·실DB·학교 데이터·HCX/OCR 모델 자동 연결은 하지 않는다. 실제 학교 자료는 김채윤 #358, UI/API/NCP 실운영은 이서연 #357, AI 모델과 품질은 박준영 #356·이의상 #355이 담당한다. #359는 공통 권한·보안과 최종 릴리스 게이트를 확인한다. 자동 이슈 종결 금지.

## NCP IaC CI 복구

기존 GitHub Terraform 공급자 서명 조회가 HTTP 504로 반복 실패했다. 이를 CI 예외 처리하거나 검사를 생략하지 않고, **공식 ncloud v4.0.7 ZIP의 SHA-256 검증 → 캐시된 로컬 파일시스템 미러 → 네트워크 없는 init/validate/mock test**로 바꿨다. 수집/해시가 실패하면 CI도 실패한다. `infra/ncp/terraform/provider-mirror.py`, `check-offline.py`, `ncp-iac-offline.yml` 및 14개 Python 부정 테스트로 재현한다. 수정 HEAD에서 NCP IaC Windows/Ubuntu/network-mock 잡 모두 성공했으나 실제 NCP API·apply·배포는 `NOT_RUN / RELEASE_BLOCKED`다.
