# #340 교환학생 지원 조건 비교 — NCP 연결 전 개발/인수

> 2026-11-12 KST, 합성 대학·합성 규칙만 검증한 코드 경계입니다. 학교의 실제 합격·서류 제출·학점 인정·모집 마감에 대한 공식 판정이 아닙니다.

## 이번 단계에서 실제로 구현한 것

- `packages/core/src/campus-assist/exchange.ts`: 소스 판본/asOf/KST 유효일, 경로 OIA/DEPARTMENT·기간/학기/학적/평점/편입/취소/어학과 검수된 해외대학 추가 기준을 결정적으로 비교. 누락/중복/권리 철회 규정은 `UNKNOWN` 또는 차단, 현재 적용되는 단 하나의 검수판본만 평가. 기존 합성 자격 결정표가 있습니다.
- `apps/api/src/modules/campus-assist-http.ts`: 주입된 공식/검수 데이터 port가 있을 때만 BETA actor 인증·권리 receipt 재확인 후 파견대학 목록과 자격 결과 제공. NCP 미연결이면 그 port 자체가 없습니다. 학점을 프런트 모델/로그에 저장·전송하는 추가 AI 기능은 없습니다.
- `apps/web/src/features/campus-assist/OwnerPanels.tsx`: 서버에서 검증받은 파견대학을 **최대 3곳** 같은 `asOf`와 같은 자기 입력으로 독립 비교. 파견경로 `partnerId+track`을 별개 식별, 결과 판본 충돌·인증 전환·필터 변경·어느 한 API 실패 시 전체 비교 격리. 각 대학 공식 원문 링크/판본을 보여 줍니다.
- `packages/core/src/campus-assist/exchange-preparation.ts`: 검증받은 `ExchangeResult`의 **7개 규칙 검토 결과**로부터 대학별 안내 체크리스트만 만듭니다. URL·정확한 판본·asOf가 일치하지 않으면 `STALE_POLICY`로 안내를 보류합니다. `PASS`도 학생 **자기신고 입력**과 공통 규정의 비교일 뿐 실제 학교 검증 성적이 아닙니다. `FAIL/UNKNOWN/NOT_APPLICABLE`는 명확히 분리합니다.
- **모집 마감일·확정 신청 일정/학점 인정 계획이 없는 계약에서는 날짜를 만들지 않습니다.** 실제 지원서 작성·제출·학점 인정·비자 판정은 제공하지 않습니다.
- `exchange-preparation.test.ts`, `OwnerExchangePanel.compare.test.tsx`와 기존 `exchange.test.ts`의 합성 회귀; 최신 HEAD의 테스트 결과와 동료 승인 여부는 GitHub Actions/PR 리뷰를 별도로 확인해야 합니다.

## NCP/실자료 연결 이전 미완료

1. 공식 OIA·학과·파트너별 최신 모집공고/파견 대학 요강의 **원문 사용·지속 보관·AI 전송 권리**, sourceRevision·공고 유형·학년도/학기·경로·예외의 독립 검수.
2. 일반 소개 vs 모집연도/학과/파트너 특칙의 우선순위 계약과 잘못된 중복·미효력·권리철회 quarantine, source manifest·변경 알림·재평가.
3. 학생 본인의 **실제 학적/성적/어학 자료**는 별도 동의·목적 제한·RLS/철회/삭제와 원본 비저장 원칙이 확보된 뒤에만 연결. 현재 입력은 개인 자기신고로만 취급.
4. 최신 공고에 명시된 **실제 공식 제출기한/시험 만료/서류·비자/학점 인정 일정**이 검증될 때만 캘린더·What-if와 연계. 일반 연례 예상과 공고 확정을 섞지 않음.
5. 공식 선발 담당자·실학생/교환학생 코디네이터의 독립 Gold·학년도 경계·캠퍼스/트랙·320/360/390/768/1440px 키보드/스크린리더 테스트, 권리 변경·동시 다중탭·NCP 401/403/409/429/503 확인.

**상태:** 합성 코어·웹/비교·준비 체크리스트는 NCP 없이 개발 가능. `NCP NOT_CONNECTED`, 실제 학교 자료/학생 권리/Gold `NOT_RUN`, `RELEASE_BLOCKED`. 이슈 #340 OPEN. 
