# 졸업·학점·학사 계획

**박준영 학업 코어 소유**, 심민성 API/SQL·이의상 UI와 교차 검토. 취득·수강 중·계획 별도 정수 CreditUnits, 재수강/동등인정·AREA_SPREAD/GROUP_CHOICE·cohort/전공/문서별 RulePack/What-if 버전 유지. 공식 규정/실 4명 원본·선수/중복·언어 등 검증 불명은 UNKNOWN/NEEDS_REVIEW, 공식 졸업 확정 불가. 순수 계산·반례·버전 회귀는 합성, 공식 원본/독립 손계산은 #252 B03.

경험에 붙이는 교과 기록(#260)은 "학생 제출 성적표에 이 과목이 이 학기에 있다"는 사실만 다룬다. 성적·재수강·학점·역량은 내보내지 않는다. 범위·정책·반례: [EXPERIENCE_EVIDENCE.md](EXPERIENCE_EVIDENCE.md).

판본 비교(`rule-diff.ts`)에서 과목의 인정 영역은 RulePack이 아니라 성적표 행(`areaIds`)에서 온다. 새 판본에서 과목이 다른 영역으로 옮겨지면 `nextAttempts`에 새 판본 기준 분류를 넘겨야 `areaMembership` 변경으로 보인다. 넘기지 않으면 영역 요건 결과는 UNKNOWN이다. 같은 행을 넘기면 "분류 변화 없음"이라고 밝히는 것이다.

학점 원장·동등 교과 속성 테스트가 재는 것, 겹치는 것, 재지 않는 것: [PROPERTY_COVERAGE.md](PROPERTY_COVERAGE.md).

과목 코드나 동등성이 확인되지 않은 성적표 행(#11)은 `course-identity.ts`가 따로 받는다. 행마다 `identity`가 `RESOLVED`(확인된 과목 ID)인지 `NEEDS_REVIEW`(원본 행 토큰만, 과목 ID·영역 없음)인지 밝혀야 하고, 미확인 행에 임시 과목 ID를 넣으면 거부한다. 확인된 행만 원장에 넣고, 미확인 행은 학점에 넣지 않고 목록으로 낸다. 미확인 행이 인정(`RECOGNIZED`)이거나 재수강 연결이 있으면 시도를 읽는 요건 행을 모두 검토 필요로 둔다. 이미 센 학점은 빼지 않는다. 지금 API는 이 입력을 보내지 않는다(`NOT_CONNECTED`, #276/#282).
