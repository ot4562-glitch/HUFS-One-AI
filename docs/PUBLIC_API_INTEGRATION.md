# 공개 API 후보 검토 — HUFS One AI (2026-11-08)

원본: https://github.com/yybmion/public-apis-4Kr (MIT). 목록은 제공처 발견용이며 각 제공처의 약관, 키, 응답 스키마, 과금, 재배포/AI 전송 권리는 개별 검토한다. 아래는 정적 후보 선별이다. 실제 API 호출 성공/사용권 승인 기록이 아니다.

| 우선 | 제공처 | 제품 용도 | 현재 판단 | 직접 연결 조건 |
| --- | --- | --- | --- | --- |
| P1 | [커리어넷](https://www.career.go.kr/cnet/front/openapi/openApiUseGuideCenter.do) | 직업·진로 설명 | 가장 적합 | 개발자 키, 직업정보 스키마, 저장·검색·AI 전송 권리 확인 |
| P1 | [고용24](https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do) | 채용·직업훈련 | 기업회원 신청·심사 필요 | 승인된 기업 자격/키, 공고 재배포 조건 |
| P1 | [사람인](https://oapi.saramin.co.kr/) | 채용 공고 | 제휴·약관 검토 필요 | 키·쿼터·원문/로고 사용권·삭제 정책 |
| P2 | [KERIS 학술연구정보](https://www.data.go.kr/data/3046254/openapi.do) | 연구·논문 메타데이터 | 학업 자료 탐색에 유용 | 키·제공 필드·저작권·인용 확인 |
| P2 | [KOSIS](https://kosis.kr/serviceInfo/openAPIGuide.do) | 산업/취업 배경 통계 | 실제 개인 전망이 아닌 맥락 | 통계표 코드·키·출처/갱신일 표시 |
| P3 | [KESS](https://kess.kedi.re.kr/index) | 교육 통계 | 참고자료 | 목록에서 API 엔드포인트 확인 안 됨 |
| P3 | [RISS 종합목록](https://www.data.go.kr/data/15071949/fileData.do) | 도서관 목록 | 참고자료 | 파일데이터와 실시간 API 구분 필요 |

## 코드 연결 범위

- apps/api/src/modules/opportunities/public-api-provider-catalog.ts: 7개 제공처의 타입 고정 발견 목록과, 독립 검토한 정확한 HTTPS 공개 문서 URL을 기존 ApprovedFetchPolicy로 변환하는 함수.
- 기존 createOperatorApprovedSource의 DB 권리 영수증, 철회 확인, 권한, DNS/IP 고정, TLS, 크기 제한, SourceRevision 판본 저장을 우회하지 않는다. 제공처 도메인 외부 URL, 쿼리스트링(키 유출 위험), 문서 홈 URL, 참고용 항목을 거부한다.
- **실제 API 키가 필요한 JSON/XML 호출은 아직 연결되지 않았다.** 기존 승인형 수집기는 키/인증 헤더를 보내지 않으며 GET 공개 원문만 수집한다. 문서 URL을 데이터 URL처럼 수집하거나 API 키를 URL에 삽입하면 안 된다.
- 키가 필요 없는 공개 원문은 운영자가 정확한 URL·권리 영수증을 확인한 경우에만 위 정책 객체를 기존 SourceRevision 수집기에 전달할 수 있다. 이 코드 자체는 네트워크 요청이나 DB 연결을 하지 않는다.
- 실제 공급자별 인증/응답 변환, 페이지네이션, 캐시/쿼터, 증분 동기화, 삭제/철회 처리와 NCP 배포는 별도 구현/승인 필요. 임의 크롤링이나 학생 프로필 자동 연결 금지.

## 팀원 인수

- **#324 김채윤:** 제공처별 수집·보관·검색·화면 표시·AI 전송 권리, 출처 표시, 철회, 실제 학생 A/B 검증.
- **#323 이서연:** 운영 API 키 비밀 저장, NCP 배포, 쿼터/요금 및 실호출 증거.
- **#325 심민성:** 서버 전용 키 제공처별 어댑터, 계약, 비공개 DB/RLS, 중복/캐시/실패 차단, SourceRevision 연결.
- **#321/#322:** 공급자 데이터를 모델에 활용할 경우 인용·정확도 및 독립 품질 검증.

**현재 판정: 후보 선별 완료 / 공개 원문용 안전한 코드 연결부 작성 / 실제 공급자 API 호출 NOT_RUN / 개별 자료 권리 미검증 / RELEASE_BLOCKED.**
