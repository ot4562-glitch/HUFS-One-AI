# #343 장학금 자격·준비 체크리스트 — NCP 연결 전

> 2026-11-12 KST. 학생의 **자기신고**와 승인된 공식 출처/학업 자료 증거를 구별하는 코드 인수 범위입니다. 학교의 장학금 지급·합격/접수·공식 지원 자격 판정이 아니며 실제 장학금 지급에 사용할 수 없습니다.

## 합성·NCP 전 구현

- 기존 `checkScholarship` (`packages/core/src/feature-additions/scholarships-v2.ts`)은 서명된 현재 source 검증, 조건별 필수/선택·`ALL/ANY` 삼상 상태를 계산하고, 검증된 출처/학업 사실이 없는 경우 `UNKNOWN`, 본인 미공유 GPA/학적·장학 중복 수혜를 `MET`으로 승격하지 않습니다.
- 기존 `apps/api/src/modules/owner-preparation-http.ts`는 검증된 **BETA owner**, 별도 전용 목적/consent·권리·최신 head·지속 가능한 요청 제한 source port를 운영자가 주입한 경우에만 장학·배지 준비 상태를 리턴합니다. 없으면 `NOT_CONNECTED`. `officialDecision:null`, 지원서/실수혜 원장 DB 쓰기 없음.
- [이번 회차] `OwnerPreparationPanel`은 장학금별 `groups[]/conditions[]`를 펼쳐 **필수/선택 조건, 묶음 ALL/ANY, 충족/미충족/확인 필요, 문단 span ID, 부족 증빙 키**를 보여 줍니다. 원본 GPA·가구소득 등 숫자값은 표시하지 않고, 공식 지급·자동 지원을 수행하지 않습니다. owner 세션 epoch·권한/기능 kind/port 변경이나 unmount 시 늦게 돌아오는 옛 API 응답은 폐기합니다.
- 승인되지 않거나 취소/철회된 출처에는 규칙의 달력상 모집기간이 있더라도 `OPEN`을 표시하지 않고 `UNKNOWN`으로 격리합니다.
- `scholarships-offline-matrix.test.ts`: GPA 0~4.5 **24개 개별 독립 합성 오라클**, 승인/권리/학기/캠퍼스·증거 불일치·중복 조건/미래 학업 데이터의 반례, 지급 결정 누락 보장.
- `OwnerPreparationPanel.test.tsx`: 조건별 출력/개인 수치 미출력, `NOT_CONNECTED`, 기능 전환/소유자 권한 변경 중 오래된 결과 격리, 미확인 규정 checklist 보류. 최신 HEAD CI 결과와 사람의 독립 승인 여부는 PR에서 확인해야 합니다.

## NCP 연결 전에도 남아 있는 코드·자료 인수

1. **실제 장학 모집요강 12건 이상**의 기관/학년도·학기·유형·필수 서류·조건별 원문 문단/bbox·정정/철회/중복 조건 충돌 등 독립 source registry 검수. 합성 fixture를 실규정으로 표시하지 않음.
2. 학교의 실제 학업/성적·수혜 기록과 소득/가구의 **학생별 동의/목적 제한·현행 권리·RLS·철회/삭제** 확인. 동의하지 않아도 일반 공고 조회 가능해야 하고, 근거가 없으면 `UNKNOWN`.
3. 승인된 계약 아래에서 `GET .../scholarships`+서명 커서·`POST /:id/check`의 제한/409/422·운영 학기 버전과 SSR/CSRF 인수, DB schema/PG 테스트 및 공식 제출 링크 연결. 현재 이슈에서 원래 제안한 두 엔드포인트는 **아직 추가되지 않았고**, 합성 BETA 준비 조회 API만 존재합니다.
4. `/notices` 장학 카테고리/캘린더·행동계획 연결, 실제 신청 마감 vs 학내 행정 마감 분리, 검증되지 않은 금액/장학 가능성을 허구로 예측하지 않는 화면, 320~1440px 키보드/스크린리더 QA.
5. 익명/REVIEWER/BETA A/B와 교내 권리·비밀·API/RLS/429/503·실제 학생 E2E 및 독립 Gold; 최소 24 합성 회귀가 **독립 사람이 만든 Gold를 대체하지 않음**.

**상태:** `NCP NOT_CONNECTED`, 실학교 출처 사용권·인간 Gold·실학생 E2E `NOT_RUN`, `RELEASE_BLOCKED`. 이슈 #343 OPEN.
