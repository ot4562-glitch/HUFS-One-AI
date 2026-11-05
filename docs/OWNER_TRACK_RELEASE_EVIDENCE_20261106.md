# HUFS One AI — 소유자 코드/실자료/운영 실행 증거 원장 (2026-11-06)

> 프로젝트 단위 승인: `OWNER_CONFIRMED_APPROVED`. 승인 완료는 실제 실행 또는 독립 사람 평가의 PASS가 아닙니다. 개인별 현재 동의·철회, 소유권·출처권, session/OIDC/RLS/CSRF, 비밀키 보호는 유지합니다.

## PR 순서와 코드 근거

| 단계 | PR | 실제 제출 변경 | 증거/범위 |
| --- | --- | --- | --- |
| 1 | #267 | 개인 동의·권한·AI 계약/공급자·SQL | 합성 CI 성공, 운영 자격증명 없음 |
| 2 | #268 | 경험 근거, AI 입력/후보, 사용자의 태그 승인·철회, API/포트폴리오 | 합성 CI 성공, UI #258 외부 소비는 별도 |
| 3 | #269 | 관리형 운영 PostgreSQL, private factory, Docker/NCP 설정, 학업 어댑터 | NCP IaC 오프라인 통과, 실 NCP 배포 NOT_RUN |
| 4 | #270 | A13 설계 API의 경로/범위 분류 및 문서 | 계약 감사 합성 통과 |
| 5 | #272 | 시연 계획/전망 가정 2개 API, HTTP/버전/철회 회귀 | 99 routes, 합성 CI 성공, 공식 학적 판정 아님 |
| 6 | #273 | 경험 선택→AI 모의 호출→검토 후보→학생 승인→추천/철회 HTTP 회귀 | 합성 테스트 결과는 해당 PR 현재 HEAD를 확인, 실 모델 호출 아님 |
| 7 | #274 | 실제 Forms의 `YES`/`NO` 원문 응답 분류 수정·4인 합성 부정 회귀 | 실제 동의 해석과 독립 owner mapping/권리는 분리 |

기존 #264는 77개 파일의 대형 PR이었으나 **미병합 종료, 새 스택으로 대체**했습니다. 새 스택의 초기 4단계는 원본 변경을 포함하며, 새 main에 반영된 동료의 academics/forecast 구현을 보존합니다. 최종 병합·실행 완료라고 주장하지 않습니다.

## 비공개 실제 파일의 구조 검사

- 출처: 모델 사용자 개인 Library에서 확인한 HUFS One AI Google Forms CSV와 수강기록 CSV. **원본·표시이름·개인별 권리표/해시·활동 문장은 PR/CI/공개 로그에 올리지 않았습니다.**
- Forms: **26열, 4개 응답**. 다섯 개 동의 항목의 텍스트 응답은 네 응답 모두 대문자 `YES`. 기존 `validateFormsCsv`의 한국어-only 해석은 이를 `UNKNOWN`으로 잘못 분류하여 #274에서 정확히 매핑합니다. 개별 권리/철회·현행 계정 확인을 대체하지 않습니다.
- 수강 CSV: 현재 검색 가능한 **3개/총128과목행/6열**을 비공개 검사. 열 너비/학점 0.5단위·이수상태/동일 학기 내 중복의 기초 구조 검사에서 실패를 발견하지 않았습니다. **128개 행의 학수번호는 모두 공란**으로, 과목 코드의 일치성·대체/재수강/이수구분 공식 판정을 자동 입증할 수 없습니다.
- **4번째 수강 CSV 부재**. 인적 신원 추정이나 점수/표시명으로 file↔Forms↔actor 연결을 자동 생성하지 않습니다. 현행 operator-only private 인입은 4개 파일, 명시적으로 검증된 4인 fingerprint/rights registry와 독립 DB 역할을 요구합니다.
- 이 구조 검사는 개인정보/원문 보호, 소스 내용 미변조 확인·공식 RulePack/졸업 인정·실 운영 DB 입고/rollback·학생 권한 조회를 수행한 것이 아닙니다. 결과: `PARTIAL_SOURCE_BATCH_NOT_RELEASE_READY`.

## 실제 환경과 자동 검증을 구별한 상태

| 항목 | 현재 판정 | 사실 관계 / 필요한 증거 |
| --- | --- | --- |
| 프로젝트 범위 승인 | `OWNER_CONFIRMED_APPROVED` | 사용자 확인. 미승인 차단을 반복 적용하지 않음 |
| TypeScript/합성 HTTP/일회용 PostgreSQL/NCP 오프라인 | `TESTED_SYNTHETIC` | 각 PR 정확한 SHA와 Actions 결과; 추가 6·7단계는 개별 실행 확인 |
| 실제 Google OIDC/외대메일 | `CONFIGURATION_REQUIRED` | 실제 tenant/credential/HTTPS callback·수신권 검증과 세션 철회/2클라이언트 테스트 |
| 실제 NCP/SSL/프록시/사설 SQL/role·복구 | `CONFIGURATION_REQUIRED` | NCP host/비공개 factory/CA 인증서·역할/계정·TLS/backup·rollback 증거 |
| CLOVA HCX/OCR/Vision/미디어 worker와 청구 | `CONFIGURATION_REQUIRED` | 실제 API key/허용 egress·가격·callback·청구/취소/재시도·native 패키징/NOTICE/SBOM 결과 |
| 실원본 학업 4명 인입 | `PARTIAL_SOURCE_BATCH_NOT_RELEASE_READY` | 현재 3 CSV/128행 구조 OK, 파일 1개·owner mapping·원본/RulePack 검증 누락 |
| 경험→추천 사용자 실UI (#258/#259) | `NOT_RUN` | #273 합성 HTTP와 별도로 teammate의 실제 UI/추천 소비에서 수락 검증 필요 |
| 자동 품질/정확도 평가 | `SYNTHETIC_ONLY` | 200 추천/32 이미지·시점 품질 정답을 임의 생성하지 않음. 실제 평가값 미측정 |
| 독립 사람 평가 | `EXCLUDED_BY_REQUEST` | 사용자가 이 작업 범위에서 제외, 인간 Gold 결과를 합성 생성하지 않음 |
| 배포·출시 | `RELEASE_BLOCKED` | 위 실환경 증거 없는 운영 완료/출시 판정 금지 |

## 인수 운영 방식

1. #267→#268→#269→#270→#272→#273→#274 병합; 각 PR 정확한 SHA의 TypeScript·단위/HTTP·일회용 PG·Chrome·NCP IaC를 확인합니다.
2. 비공개 운영자 서버에서 실 Google/학교메일/전용 SQL 역할/현재 동의·rights, NCP egress·HCX 비용 정책과 원본 4개를 제공된 운영 경로에 주입합니다. 비밀값은 공개 파일/채팅/CI에 복사하지 않습니다.
3. 실제 401/403/409/422/429/503·다중 actor/tab·버전충돌·권한철회·취소·출처제거·공급자 비용·OCR bbox·복구/운영 측정과 표시를 추적합니다.
4. 사람 골드 평가는 본 PR 범위에서 제외합니다. 독립 학생 승인 동작과 공식 RulePack·권한/출처 검증은 보안·정합성 조건으로 남습니다.

담당 이슈 [#252](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252), [#253](https://github.com/ot4562-glitch/HUFS-One-AI/issues/253), [#257](https://github.com/ot4562-glitch/HUFS-One-AI/issues/257). 협업 [#255](https://github.com/ot4562-glitch/HUFS-One-AI/issues/255), UI #258, 추천 #259, 학업 #260, NCP 비코드 #261.
