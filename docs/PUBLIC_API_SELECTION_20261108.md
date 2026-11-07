# HUFS One AI — 공개 API 선별·연동 결과 (2026-11-08)

**참고 카탈로그:** [yybmion/public-apis-4Kr](https://github.com/yybmion/public-apis-4Kr) (MIT 라이선스, API 목록 정보). **실제 데이터 제공자:** 각 항목의 해당 공공기관/사업자. 목록 저장소의 MIT는 **외부 API의 데이터·상표·재게시 권리 또는 API 키 허가를 대신하지 않습니다.**

## 1. 현재 학생 제품 목적에 맞춘 우선순위

| 후보 | 공식 원문 / 구현 대상 | 적합성·인수 결정 | 코드·실사용 상태 |
| --- | --- | --- | --- |
| **사람인 채용정보** | [API 가이드](https://oapi.saramin.co.kr/guide/job-search) · `GET https://oapi.saramin.co.kr/job-search` | **P0 채용·인턴십 참고 후보.** `access-key` 발급 및 서비스 이용 승인 필요. 공식 안내 일일 최대 500회. 기업·직무 검색 결과는 학교 확인/취업 자격 확정이 아님. 목록에 실린 http 추적 URL은 사용하지 않고 숫자 공고 ID로 HTTPS 원문 링크 구성 | **서버 접속기 구현·자동검증**. 호출은 운영키·자료 이용 범위·분산 쿼터 예약·운영자 권한 모두 확인된 경우에만. 현재 **실호출 NOT_RUN**, 자동 추천 DB 반영 없음 |
| **커리어넷 직업백과** | [신형 API](https://www.career.go.kr/cnet/front/openapi/jobCenter.do) · `GET https://www.career.go.kr/cnet/front/openapi/jobs.json` | **P0 진로·직업 메타데이터**. 관리자 발급 `apiKey` 필요. 구형 `getOpenApi.json`의 **직업정보**는 공식 안내상 2023년 8월까지만 제공; 신형 **직업백과**를 사용해야 함. 직업 백과를 대학 졸업/채용 합격 자격으로 오용 금지 | **서버 접속기 구현·자동검증**. 목록 첫 페이지, 일반 직무 키워드 4개 중 하나만. **실호출 NOT_RUN**, 원문 자세한 설명/연봉 자동 재게시 없음 |
| **고용24 채용정보** | [공식 OpenAPI](https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do), [채용정보 명세](https://www.work24.go.kr/cm/e/a/0110/selectOpenApiSvcInfo.do?fullApiSvcId=000000000000000000000000000000) | **P1 보류.** 기업회원 가입, 심사, 인증키 필요. XML 파서/메타데이터 사용 약관·원문 판본·쿼터 확인 후 별도 지원. | 현재 **공식 사이트로 이동 링크만** 구현. API 클라이언트 미구현 |
| **Open DART 기업개황** | [공식 상세](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019002) · `GET /api/company.json` | **P1 기업 사실 확인**. `crtfc_key` 40자 + `corp_code` 8자리 필요. DART는 **채용공고 API가 아님**. 주소/기업명/업종 등을 실제 공고의 검증된 기업코드와 대조할 때에만 사용. | 현재 공식 링크 제공. API 클라이언트/기업코드 검증 매핑 미구현 |
| **대학알리미** | [공공데이터포털 대학 기본정보](https://www.data.go.kr/data/15037507/openapi.do) | **P2 참조만.** 대학 일반 기본정보는 개인 성적/학적/실제 한국외대 학칙·전공 졸업 요건의 법적 원본이 아님. 인증키/세부 데이터셋 검토 필요. | 공식 사이트 링크만. 개인 학업 DB 직접 연결 금지 |
| **한국산업인력공단 HRD/자격** | [HRDK 오픈API](https://openapi.hrdkorea.or.kr/main) | **P2 자격 목록 참고.** 인증키와 개인 증명 발급/인증을 구별. | 미연동 |
| **나이스/학교알리미** | [학교정보 목록](https://www.data.go.kr/data/15122275/openapi.do) | **범위 밖.** 초·중·고 대상이며 현재 대학생 학업/진로 코어의 필수 데이터 아님. | 연동 제외 |
| **KOSIS·ECOS·KESS·RISS** | 목록 저장소의 통계/학술 리소스 | **P2 연구·노동시장 배경 정보**. 경제/통계 콘텐츠는 개인별 진로 추천/채용 사실이나 공식 졸업 판정의 근거로 직접 대체하지 않음. 개별 키·통계 라이선스/시점 확인 시 별도 설계. | 미연동 |

## 2. 이번에 코드에 연결한 것

1. **학생에게 실제 즉시 제공:** `/career`의 `OfficialCareerReferences`는 다섯 공식 홈페이지를 HTTPS 링크로 표시한다. 외부 웹페이지로 이동하는 동안 학생 개인 정보·기록·검색어를 쿼리에 넣지 않는다. **링크만 제공**하며 API 데이터 연동으로 홍보하지 않는다.
2. **실제 프로토콜을 쓰는 서버 접속기:** `apps/api/src/modules/opportunities/operator-public-api.ts`. 사람인 `job-search`와 커리어넷 **신형** `jobs.json`에 올바른 요청변수/JSON 구조를 적용한다. 일반 주제 `DATA_ANALYTICS/SOFTWARE/MARKETING/BUSINESS` 중 하나만 사용, 회당 **최대 10건**, 외부 제목/회사명/직업명은 최소 필요 메타데이터만 정규화하고 URL은 안전하게 다시 구성한다. 제공처 문구/이미지/응답 전문은 저장/노출하지 않는다.
3. **실제 앱 경로:** root 관리 `createPostgresPlatformServices({publicApiDiscovery})` → `createIntegratedApi({publicApiDiscovery})` → **`POST /api/operator/public-api-discovery`**. **정식 세션 BETA + 별도 operator 권한 + CSRF/Origin + 출처별 이용권 판본 + 분산 provider quota 예약 + DNS 재검증/고정 public IP/TLS/SNI/리다이렉트 차단 + 호출 전후 권리 재검증** 모두 필요. 브라우저에서 임의 URL/개인 이름·성적·학적·토큰은 전달할 수 없다.
4. 응답 `mode=OPERATOR_REVIEW_ONLY` + 후보별 `RESEARCH_REFERENCE_ONLY / NEEDS_REVIEW / UNKNOWN`. **기존 SourceRevision 원장·공개 추천·실제 채용 게시물에 자동 삽입하지 않는다.** 필요한 경우 김채윤 #324 출처·재게시/전송 권리, 심민성 #325 서버 SourceRevision·operator 수락, 독립 검토자를 통한 정확한 판본 승격이 별도 필요하다.
5. **기본값: disabled.** 사설 root-owned NCP 운영 설정 파일이 `publicApiDiscovery`를 명시 제공하지 않으면 호출 HTTP 라우트가 아예 등록되지 않는다. 테스트는 합성 JSON/DNS/권한만 사용했고 외부 인증키·학생 원본 사용 또는 실제 공급자 호출을 수행하지 않았다.

### 운영자 연결 절차(실서버에서만)

- **김채윤 #324:** API 제공처의 호출/원문 표시·저장·재배포·검색·AI 전송/철회 조항을 공식 약관과 이용 승인 기록으로 확인. `permissionRef`와 만료/정책 판본을 비공개 인수하며, 확인 범위 밖이면 `REVOKED` 또는 미구성.
- **이서연 #323:** 제공처 운영 키를 공식 절차로 발급받고 NCP root-owned 비공개 `createOperatorConfig()` 안에서만 주입, egress/ACG/TLS/모니터링·쿼터 실증. 키는 GitHub, Pages, CI, React, URL 로그, 공개 PR에 기록하지 않는다. 사설 설정 없이는 실행 불가. 키가 쿼리 매개변수로 전달되는 것은 두 제공처 공식 명세에 따른 것이므로 서버 전용이다.
- **심민성 #325:** 해당 사설 설정에서 `createOperatorPublicApiDiscovery({scopes,egress,resolveRights,reserveCall})`를 구성하고 별도 operator 정책 `mayManage`와 함께 `platform.publicApiDiscovery={service,authority}`로 인계. `resolveRights`는 권리 만료·철회·목적 `LOOKUP_METADATA/DISPLAY_SOURCE_LINK`을 검증하고, `reserveCall`은 **공용 DB 기반**으로 제공처 전체 quota를 매 실제 실행 전 원자적으로 예약해야 한다. 일괄 자동 호출/주기 실행/브라우저 자체 API 키는 금지.
- **실검증:** 정확한 코드 SHA, 운영자/출처 권리 판본, 실호출 1건, 원문 진위/정정/삭제, 401/403/429/5xx, 실제 제공처 요금/횟수·로그 키 마스킹, 동의/이용권 철회 후 0 재노출을 비공개 증빙으로 기록. 현재 **NOT_RUN**. NCP/실계정/실기기 인수 완료로 처리하지 않는다.

### 테스트 예시(운영자가 승인한 계정에서만)

```http
POST /api/operator/public-api-discovery
Origin: https://<approved-private-ingress>
X-CSRF-Token: <current-session-token>
Content-Type: application/json

{"provider":"CAREERNET_JOBS","topic":"DATA_ANALYTICS"}
```

**반환:** 일반 직업/채용 메타데이터 0~10건, `observedAt`, `permissionRef`, `rightsPolicyVersion`. 합성 샘플이 아닌 실제 호출을 검증하기 전에는 실제 결과를 주장하지 않는다.

## 3. 비적용 경계

- 공개 API 목록 저장소에 있다는 사실 ≠ 그 제공처가 인증키 없이 사용할 수 있다 ≠ 데이터 사용·재게시·학습이 모두 허용된다.
- 초중고 나이스 데이터로 한국외국어대학교 학생 개인 성적/졸업 정보를 추정하지 않는다.
- 진로/직업 메타데이터를 학생 학업 기록/지원 적격/취업 확률로 자동 점수화하지 않는다.
- HTTP 200, 최신 API 후보 또는 사람이 보지 않은 게시글은 곧바로 `ACTIVE/REAL` SourceRevision이 아니다.
- 기존 `csv/` 원본 다섯 파일을 수정·삭제·재인코딩하지 않는다. **RELEASE_BLOCKED**와 #323/#324/#325 실제 인수는 유지한다.
