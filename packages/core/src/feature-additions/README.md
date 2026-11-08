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
