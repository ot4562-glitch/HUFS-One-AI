# 학점 원장·동등 교과 속성 테스트: 무엇을 재고 무엇을 안 재나 (#11, #202)

이 문서는 아래 두 속성 테스트가 재는 것을 한곳에 모은다. 자료는 모두 합성(SYN-*)이고, 시드를 고정한 mulberry32 생성기를 쓴다. 실패하면 시드, 줄인(shrink) 반례, 해시, 재현 명령을 출력한다.

- `ledger.property.test.ts`: `buildAcademicLedger`
  - 재현: `LEDGER_PROP_SEED=<seed>`
  - 더 많이: `LEDGER_PROP_RUNS=<n>` (기본 400)
- `course-equivalence.property.test.ts`: `applySameCourseRules`와 원장
  - 재현: `SAME_COURSE_PROP_SEED=<seed>`

**재는 방식**
- **모형:** 테스트 안의 별도 참조 모형과 맞춰 본다. 기대값을 원장을 다시 불러 만들지 않는다.
- **관계:** 큰 입력에서 규칙이 정하는 관계만 확인한다. 예: 순서 무관, 2배.
- **손:** 손으로 정한 사례.

## 1. 학점 원장 (`buildAcademicLedger`)

| 성질 | 재는 곳 | 방식 | 비고 |
|---|---|---|---|
| R1 끝나지 않은 학기는 취득으로 세지 않음 | 참조 모형, `never counts a term that had not ended` | 모형·관계 | |
| R2 재수강: 승인·같은 과목·나중 학기일 때만 앞 시도 제외, 갈래·순환은 보류 | 참조 모형 | 모형 | 생성기가 갈래·순환·자기 참조·사슬을 실제로 만드는지 확인함(11/6 추가) |
| R2 사슬 A←B←C | `an approved retake chain…`, `a chain with an unapproved middle link…` | 손+모형 | 11/6 추가. 승인 사슬은 마지막만 남고, 중간이 미승인이면 두 번 세지 않음 |
| R3 같은 과목 중복은 한 번만 | 참조 모형 | 모형 | |
| R4 인정 대기(PENDING)·공식 제외 | 참조 모형 | 모형 | |
| R5 총계는 과목당 한 번, 영역은 영역마다 전부 | 참조 모형, `keeps integer units and consistent sums` | 모형·관계 | |
| R6·R7 미승인 팩은 충족·READY 없음, 승인 없는 재수강은 학점을 빼지 않음 | 참조 모형, `never passes on an unapproved pack…` | 모형·관계 | |
| 시도 순서와 무관 | `gives the same result for any attempt order` (+ 영역 분산·그룹 행 포함판) | 관계 | 영역 분산·그룹 포함판은 11/6 추가 |
| 정수 단위(1단위 = 0.5학점), 합이 단위를 잃거나 만들지 않음 | `keeps integer units and consistent sums` | 관계 | |
| 단위 범위: 음수·NaN·무한대·소수·문자열·2^53 거부, 최댓값 1개 허용, 합이 안전 정수를 넘으면 거부 | `refuses credit units outside…` | 손 | 11/6 추가 |
| 0.5학점 단위를 그대로 셈 | `counts half-credit units exactly` | 손 | 11/6 추가 |
| 모든 단위를 2배 하면 모든 단위 값이 2배, 상태는 같음 | `doubling every credit unit…` | 관계 | 11/6 추가. 영역 분산·그룹 행 포함 |
| 깨끗하게 이수한 새 과목 하나는 학점·충족 행을 빼앗지 않음 | `one more cleanly earned course…` | 관계 | 11/6 추가. 아래 예외 2가지 |
| 입력을 바꾸지 않음 | `never modifies its inputs` | 관계 | 11/6 추가. 그전에는 동등 교과 쪽에만 있었음 |
| 영역 분산(AREA_SPREAD)·그룹 선택(GROUP_CHOICE) 행이 충족·미충족 둘 다 나옴 | `the spread and group rows reach…` | 생성기 확인 | 11/6 추가 |
| 영역 분산·그룹 선택 결과 = 참조 모형 | `matches the reference model on the general generator with spread and group rows`, `matches the brute-force spread model on spread-heavy cases` | 모형 | 11/6 추가. 영역 분산은 모든 배정을 다 세는 방식(`spreadModel`)이라 원장의 매칭·탐색 코드와 공유하는 부분이 없음. 영역 6개·과목 8개까지 |
| 탐색 예산(50000번)을 넘으면 검토 필요 | `past the search budget…`, `a spread the search can finish…` | 손 | 11/6 추가. 삼각형 10개(영역 30개): 실제로는 충족이지만 예산을 넘어 검토 필요. 미충족으로는 절대 안 감 |
| 큰 입력: 과목 1000개·영역 30개·그룹 10개 | `a large transcript of single-area courses…` | 모형 | 11/6 추가 |

**단조성의 예외 2가지 (원장 규칙대로 "검토 필요"로 가는 경우):**
- 근거(`evidenceRefs`)가 없는 요건은 조건을 채워도 충족이 아니라 검토 필요다.
- 영역 분산에서 2개 이상 영역에 걸친 이수 과목이 있으면, 공식 배정에 따라 결과가 달라질 때 검토 필요다. 새 학점이 학점 문턱만 넘겨 줘도 그렇다.

## 2. 동등 교과 규칙 (`applySameCourseRules` + 원장)

| 성질 | 재는 곳 | 방식 |
|---|---|---|
| S1~S4 규칙 적용 결과 | P1 | 모형 |
| 입력을 바꾸지 않음 | P2 | 관계 |
| 시도·규칙 순서와 무관 | P3 | 관계 |
| 두 번 적용해도 그대로 | P4 | 관계 |
| 미승인 규칙은 숫자를 바꾸지 않고 해당 시도를 보류 | P5 | 관계 |
| 적용 후 원장 = 모형이 고친 성적표의 원장 | P6 | 모형 |
| 옛 과목 이수로 새 과목 필수 충족 | P7 | 손+관계 |
| 이름이 바뀐 과목 사이의 재수강은 규칙 뒤에만 인정 | P8 | 손+관계 |
| 승인 사슬·순환 거부, 하나가 미승인이면 허용 | P9, 단위 테스트 | 관계·손 |
| 한 옛 과목이 두 새 과목으로 가는 갈래는 `AMBIGUOUS` 보류 | 생성기 확인, P1 | 모형 |

## 3. 겹치는 것 (일부러 둔 것)

- **재수강 의미:** 원장 참조 모형 R2와 동등 교과 P8이 같은 규칙을 다른 입력으로 잰다. P8은 이름 바뀐 과목 사이의 재수강이다.
- **순서 무관·입력 불변:** 두 파일 모두에 있다. 대상 함수가 다르다.
- **소수 단위 거부:** 원장 속성(`keeps integer units…`)과 새 범위 테스트(`refuses credit units outside…`)에 모두 0.5 같은 소수 거부가 있다. 수강 계획 쪽(`plan.test.ts`)에도 따로 있다.

## 4. 재지 않는 것

- 실제 학칙·실제 성적표와의 일치. 이것은 본선 이후 #282 범위다.
- 무작위 생성기보다 큰 경우의 영역 분산 모형 대조. 모든 배정을 세는 방식이라 다중 영역 과목이 많으면 대조할 수 없다. 큰 입력은 단일 영역 과목 1000개와 손 사례(삼각형)로만 확인한다.
- 탐색 예산을 넘었을 때 실제 답이 무엇인지 원장이 알려 주지는 않는다. 검토 필요로 두는 것까지만 확인한다.
- 성적·평점: 원장은 받지 않고 `GPA_NOT_COLLECTED`로만 표시한다.
