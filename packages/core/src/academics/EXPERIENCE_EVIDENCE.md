# 경험 ↔ 학사 기록 연결 범위 (#260)

상위 제안 #255. 학업 코어(박준영) 담당이며, 합성 자료로 검증한 설계까지만 담았다. 실제 학생 자료, 학교 시스템 연동, 사람 인수는 하지 않았다(#282/#276).

**한 줄 정책:** 교과 기록에서 경험에 붙일 수 있는 것은 "학생이 제출한 성적표에 이 과목이 이 학기에 있다"는 사실 하나뿐이다. 이 사실은 역량, 숙련도, 성적, 학교 확인 중 어느 것도 아니다.

## 1. 입력-근거-기록 상태표

#255의 입력 항목마다 지금 저장소에 있는 근거를 적었다.

| #255 입력 | 지금 저장소의 근거 | 기록 상태 | 경험에 연결 | 역량 후보로 쓰기 |
|---|---|---|---|---|
| 교과 성적(등급·평점) | 수강 CSV 6열(`COURSE_CSV_HEADERS`)에 성적 열이 없다. 평점 요건은 `GPA_NOT_COLLECTED` | 수집 안 함 | 불가 | 불가. 나중에 수집해도 성적을 역량으로 바꾸지 않는다 |
| 이수 과목 | 6열 CSV → 비공개 인입(`STUDENT_REVIEW_PENDING`, 계약 주석: 자기 보고이며 검증된 학사 사실이 아님) → 운영자 승인 projection(`transcript.state=APPROVED`) | 학생이 제출하고 운영자가 검토. 학교 대조는 NOT_RUN(#252 B03) | 학생이 직접 고른 과목만 `TAKEN`+학기로 | 불가. 과목명·이수구분으로 역량을 만들지 않는다 |
| 수강 중 과목 | 같은 경로, 원장 `IN_PROGRESS` | 위와 같음 | 그 학기 안에서만 `IN_PROGRESS`. 학기가 끝났는데 그대로면 `NEEDS_REVIEW` | 불가 |
| 수강 계획 | `STUDY_PLAN` 작업공간(DRAFT), 원장 `PLANNED` | 학생 초안 | 불가(`PLANNED_ONLY`). 아직 하지 않은 일이다 | 불가 |
| 재수강·중복·인정 보류/제외 | 원장 시도 규칙(`classifyLedgerAttempts`) | 위와 같음 | 승인된 재수강은 뒤 학기에 한 번 들은 것으로만 보인다. 승인 안 된 재수강과 중복은 `NEEDS_REVIEW`, 인정 보류는 `RECOGNITION_PENDING`, 공식 제외는 `RECOGNITION_EXCLUDED` | 불가 |
| 교내 비교과 이수 | HUFSAbility 메뉴 manifest의 `noncurricular-program`이 `NOT_IMPLEMENTED`. 연동과 권한이 없다 | 없음 | 학교 이수 기록으로는 불가. 학생이 `EXPERIENCE`(SELF_REPORTED)로 직접 적고 `sourceOpportunityId`로 공고를 고를 수는 있다. 이것은 이수 확인이 아니다 | 학생이 쓴 글에서 AI 후보 → 학생 승인(기존 `ExperienceTagApproval`) |
| 외부비교과·자율 활동(동아리·아르바이트·서포터즈) | `external-noncurricular`가 `NOT_IMPLEMENTED`. 직접 입력한 `EXPERIENCE`만 있다 | 학생 자기 보고(`DRAFT`/`SELF_REPORTED`) | 학사 기록 연결 대상이 아니다 | 위와 같음 |
| 상장·자격 | 학교 기록 연동이 없다. owner 추천 경로의 `ownerFacts`는 캠퍼스·학번·학적·전공만 채우고 `certification`은 채우지 않는다 | 없음 | 불가 | 학생이 쓴 글의 후보일 뿐이다. 수상·자격 확인이 아니다(A06) |
| 핵심역량 진단검사·HUFSAbility 역량 점수(6대 역량) | `core-capability-diagnostic`, `hufsability-capability-score`가 `NOT_IMPLEMENTED` | 수집 안 함 | 불가 | 불가. 점수를 추측하거나 보여 주지 않는다 |
| HUFSAbility 포트폴리오·진로 로드맵 | `portfolio`, `career-roadmap`이 `NOT_IMPLEMENTED` | 없음 | 불가 | 해당 없음 |
| Forms 자기보고(취득·수강 학점, 관심) | `PrivateOwnerIntakeProfileSchema`의 `*SelfReported` 칸 | 자기 보고 | 불가. 학점 숫자는 원장 근거가 아니다 | 관심 분야는 기존 프로필 관심 주제 경로로만 |
| 북마크 단계·결과 | `BookmarkOutcome.provenance=USER_ENTERED_UNVERIFIED` | 학생 기록 | 학사 근거가 아니다 | 불가. 합격이나 이수 확인이 아니다 |

## 2. 재사용 범위

- **그대로 쓴다**
  - 원장의 시도 규칙: `classifyLedgerAttempts`가 `buildAcademicLedger`와 같은 `classify`를 부른다. 그래서 학점 점검과 경험 연결이 "어느 시도가 인정되는가"에서 어긋나지 않는다.
  - 학기 경계: `termEndMs`. 학기 시작은 앞 학기가 끝나는 시각이다.
  - 경험 기록과 태그 승인: `OwnerWorkspaceValue`의 EXPERIENCE, `ExperienceTagApproval`의 content/consent 버전과 INACTIVE 사유.
  - 공유 grant: `SharingGrant`, `canReadSharedSection`.
- **이번에 새로 만들었다(학업 코어 안, 저장·API·계약 없음)**
  - `describeCourseEvidence`: 학생이 고를 과목 목록과 과목별 상태.
  - `resolveExperienceCourseLinks`: 저장된 연결이 asOf에 아직 유효한지와 그 사유.
- **지원하지 않는다**
  - 경험↔과목 연결을 저장할 계약·DB·API(#276/#282).
  - 교과 기록 선택 화면·목적별 학사 동의와 실계정 인수(#280/#283). 별도의 경험 글→학생 승인 태그 기능은 이 교과 연결과 구별한다.
  - 학교 시스템 연동.

## 3. 보수적 정책

- **P1 연결의 뜻:** 과목에 참여한 사실(학기)만 가리킨다. 결과에는 `basis: STUDENT_SUBMITTED_TRANSCRIPT`가 붙고, 이것은 학교 검증이 아니다.
- **P2 학생이 고른 것만:**
  - `provenance: STUDENT_CONFIRMED`인 연결만 유효하다. AI나 규칙이 제안한 연결(`SUGGESTED`)은 학생이 확인하기 전까지 유효하지 않다(A06).
  - 과목 목록은 학생이 고르는 선택지다. 시스템이 과목을 경험이나 역량 후보로 먼저 내밀지 않는다.
- **P3 역량으로 바꾸지 않음:**
  - 과목 연결은 TopicCode나 역량 태그를 만들지 않는다.
  - 역량 후보는 학생이 쓴 경험 글에서만 나온다(#259, A06). 학생이 승인하기 전에는 추천 입력(`approvedExperienceTopics`)에 들어가지 않는다.
- **P4 출력 최소화:**
  - 출력에는 과목 ID, 학기, 상태, 사유만 나온다.
  - 성적·평점·학점·영역·이수구분·요건 결과·재수강 여부·시도 횟수는 나오지 않는다.
  - 승인된 재수강은 뒤 학기에 한 번 들은 것과 똑같이 보인다. 재수강 사실은 낮은 성적을 드러내기 때문이다.
- **P5 0 ≠ 미공유 ≠ 확인 필요:** NOT_SHARED와 NEEDS_REVIEW 결과에는 목록 자체가 없다. "0개"는 SHARED이면서 목록이 비었을 때만 나온다.
  - 이슈의 UNKNOWN은 여기서 NEEDS_REVIEW로 부른다. 인입 계약(`PrivateOwnerIntakeTranscriptSchema`)과 원장의 이름에 맞췄다.
- **P6 시점:**
  - IN_PROGRESS는 그 학기 안에서만 참이다. 학기가 끝났는데 아직 수강 중으로 남아 있으면 이수로 추측하지 않고 NEEDS_REVIEW로 둔다.
  - EARNED는 원장과 똑같이 학기가 끝난 뒤에만 인정된다.
  - 학생의 확인 시각이 asOf보다 뒤라면, asOf에는 아직 없던 연결이다.
- **P7 RulePack과 분리:**
  - 입력에 RulePack이 없다. 팩이 DRAFT여도 과목 사실은 그대로이고, APPROVED라고 "공식 확인"이 되지도 않는다.
  - 영역 배정도 결과를 바꾸지 않는다.
- **P8 수정·정정·철회:** 연결은 학생이 확인한 때의 경험 내용 버전, grant 버전, 과목 학기에 묶인다.

  | 바뀐 것 | 결과 |
  |---|---|
  | 경험 내용 수정 | `STALE` |
  | 경험 삭제 | `EXPERIENCE_NOT_FOUND` |
  | 공유 철회 | `NOT_SHARED` |
  | 다시 공유(새 grant) | `STALE`. 예전 연결이 되살아나지 않는다 |
  | 그 과목의 학기 정정 | `STALE` |
  | 과목 삭제 | `NOT_IN_TRANSCRIPT` |
  | 인정 제외로 정정 | `RECOGNITION_EXCLUDED` |
  | 다른 과목만 정정 | 연결 유지 |

- **P9 목적 분리(호출하는 쪽 책임):**
  - `access: SHARED`는 "경험 기능에 학사 기록을 쓴다"는 목적의 동의가 현재 살아 있을 때만 넘긴다. 졸업 점검을 위해 ACADEMICS를 공유한 것을 이 동의로 다시 쓰지 않는다(A03 목적별 권리).
  - 별도 목적 동의를 받기 전에는 과목 연결을 외부 AI 입력에 넣지 않는다.

## 4. 화면 문구 제안 (#258에서 결정)

| 결과 | 뜻 | 문구 예 |
|---|---|---|
| `NOT_SHARED` | 공유 안 함·만료·철회 | "학업 정보를 공유하지 않아 교과 기록을 불러오지 않았어요" |
| `NEEDS_REVIEW`(전체) | 성적표 인입 실패 | "성적표 자료를 확인하고 있어 불러올 수 없어요" |
| `SHARED`, 0개 | 실제로 과목이 없음 | "불러올 교과 기록이 없어요" |
| `TAKEN` | 이수 | "2025-1 수강 (학생 제출 성적표 기준)" |
| `IN_PROGRESS` | 이번 학기 수강 중 | "2026-2 수강 중" |
| `PLANNED_ONLY` | 계획만 있음 | "계획한 과목은 경험으로 연결할 수 없어요" |
| `NEEDS_REVIEW`(과목) | 기록이 엇갈림 | "기록 확인이 필요한 과목이에요" |
| `RECOGNITION_PENDING` / `RECOGNITION_EXCLUDED` | 학점 인정 보류/제외 | "학점 인정을 확인하고 있어요" / "학점 인정에서 제외된 과목이에요" |
| 연결 `STALE` | 확인한 뒤 바뀜 | "내용이 바뀌어 다시 확인이 필요해요" |

## 5. 합성 반례

모두 `experience-evidence.test.ts`에 있다. 값은 SYN-* 합성뿐이다.

| 반례 | 기대 |
|---|---|
| 미공유 / 인입 실패 / 빈 성적표 | 각각 `NOT_SHARED` / `NEEDS_REVIEW` / `SHARED`+빈 목록. 앞의 둘에는 목록이 없다 |
| 미공유일 때 저장된 연결 | 연결 목록 없이 `NOT_SHARED` |
| 계획 과목 | `PLANNED_ONLY`, 연결 불가 |
| 학기가 끝났는데 수강 중 / 시작 전 / 학기 없음 | `NEEDS_REVIEW` |
| 학기 경계(1·S·2·W, 시작 시각과 종료 시각) | 원장과 같은 시각에 `IN_PROGRESS` → `TAKEN` |
| 승인된 재수강 | 뒤 학기 1회 수강과 결과가 같다 |
| 승인 안 된 재수강 / 같은 과목 EARNED 2줄 | `NEEDS_REVIEW` |
| 인정 보류 / 공식 제외 | `RECOGNITION_PENDING` / `RECOGNITION_EXCLUDED` |
| 무작위 성적표 400개 | `TAKEN` 과목 = 원장이 취득 학점으로 센 과목 − 확인 필요 과목. 입력 순서를 바꿔도 결과가 같다 |
| 영역 배정 변경, DRAFT/APPROVED 팩 | 과목 사실이 바뀌지 않는다 |
| 성적·점수 같은 여분 입력 | 출력에 나오지 않는다(허용 키 목록으로 검사) |
| AI 제안 연결 / asOf 뒤의 확인 | `NOT_CONFIRMED` |
| 철회 → 새 grant | `NOT_SHARED` → `STALE` |
| 경험 수정 / 삭제 | `STALE` / `EXPERIENCE_NOT_FOUND` |
| 과목 학기 정정 / 과목 삭제 / 인정 제외 정정 / 다른 과목 정정 | `STALE` / `NOT_IN_TRANSCRIPT` / `RECOGNITION_EXCLUDED` / 유지 |
| 수강 중에 연결 → 학기 끝 → 이수로 다시 제출 | `LINKED` → `NEEDS_REVIEW` → `LINKED`(TAKEN) |
| 나중에 승인된 재수강 | `STALE`. 연결을 몰래 옮기지 않는다 |
| 잘못된 입력(미공유 상태 포함) | `TypeError`/`RangeError` |

## 6. 교차 검토 요청

- **심민성 (#276 계약·운영 연결)**
  1. 연결을 저장할 때 이 코어의 입력(`ExperienceCourseLink`)을 그대로 쓸지 정해 주세요.
  2. 다시 공유할 때 새 `grantVersion`이 꼭 발급되는지 확인해 주세요. 같은 값을 다시 쓰면 철회했던 연결이 되살아난다.
  3. 경험 내용을 고치면 태그 승인처럼 과목 연결도 무효로 할지 정해 주세요. 지금 코어는 무효로 한다.
  4. 경험 기능용 목적별 학사 동의를 어디에 둘지 정해 주세요(#261과 함께).
- **김채윤 (#259 추천):** 과목 연결이 TopicCode나 추천 신호를 만들지 않는 정책(P3)에 동의하는지 봐 주세요. 과목명을 TopicCode로 바꿔야 한다면 카탈로그·RulePack 근거와 함께 따로 검토한다.
- **이의상 (#258 화면):** 4절 문구를 봐 주세요. 목록은 학생이 고르는 선택지일 뿐이고, NOT_SHARED를 0처럼 보이게 하면 안 된다.

### 자동 코드 검토에서 확인한 소비자 경계

이 항목은 **AI 코드 검토**이며 위 담당자들의 실제 리뷰·사람 인수를 대신하지 않는다. 해당 검토는 #280/#281/#282에서 계속 확인한다.

- `describeCourseEvidence`·`resolveExperienceCourseLinks`는 학업 코어 안에만 있으며 현재 API·웹이 이를 호출하거나 과목명을 TopicCode로 바꾸는 경로는 없다. 교과 연결 UI/저장·목적별 동의의 실연동은 `NOT_CONNECTED`다.
- `CourseEvidenceList`·`ExperienceCourseLinkResult`의 `NOT_SHARED`/`NEEDS_REVIEW`에는 목록이 없다. `SHARED`+빈 목록만 0개를 뜻한다. `basis: STUDENT_SUBMITTED_TRANSCRIPT`는 학교 확인·성적·역량 인증이 아니다. 합성 `experience-evidence.test.ts`에서 상태 구분과 최소 출력, 재수강·버전/철회 후 무효화를 확인한다.
- 실제 owner 추천 어댑터 `apps/api/src/modules/opportunities/owner-recommendations-postgres.ts`는 현재 actor의 전체 활성 태그 승인을 읽는다. actor·원본 종류/소유·`LOCAL_USER_SELECTION`·내용/동의 버전·삭제·asOf를 확인하며, 교과 기록을 읽어 태그나 자격을 만들지 않는다. SQL mock 회귀와 HTTP 합성 여정이 이 승인 경계를 다룬다.
- `withApprovedExperience`는 기존 경험 주제를 **현재 승인 신호의 전체 합집합으로 교체**한다. `ExperiencePortfolio`의 `coverage: PAGE`인 일부 목록을 actor 전체의 승인 목록이라고 넘기면 안 된다. portfolio의 버전 경쟁·미동의·합성 자료 제외는 `tests/api/experience-portfolio.test.ts`에서 확인한다.

## 7. 하지 않은 것

- 실제 4인 원본, 학교 대조(B03), 공식 학칙, 기관 권한, 현재 개인정보 동의, 사람 인수는 하지 않았다. 승인은 `OWNER_CONFIRMED_APPROVED`이며 실제 구성/검증은 #276/#280–#283에서 `NOT_RUN`으로 구별한다.
- **교과 연결** 저장·API·화면·추천 신호 연결은 없다. 일반 경험 글의 태그 승인·포트폴리오·추천 기능과 혼동하지 않는다.
- HUFSAbility나 성적 시스템에 연결하는 코드는 없다.
