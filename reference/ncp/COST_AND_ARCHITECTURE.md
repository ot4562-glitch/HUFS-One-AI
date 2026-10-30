# 네이버클라우드 실제 적용·비공개/공개 배포·요금 조사 (2026-10-28)

**우선 적용: 학교 자료 사용 허가 없음.** 이 문서의 NCP Server/자체 PostgreSQL·Object Storage·CLOVA 설계와 비용은 **학교 실제 공고/강의/학사/수강 자료를 수집하거나 AI에 전송할 권한을 전제하지 않는다**. 현재 비공개 5인 PoC에서는 **합성 A/B 학생·합성 학교 비슷한 프로그램·합성 교외채용·합성 강의/규칙 데이터만** NCP/CLOVA에 넣는다. 학교 공식 PDF/HTML/CSS·공고 표본 30건/학생 개인정보 원본은 **RESEARCH_REFERENCE_ONLY**이며 DB·버킷·서버·AI 입력에서 제외한다. 학교로부터 실제 이용 허가를 받은 사실이 없고, 향후 서면으로 범위가 정해지기 전까지 소스 어댑터 OFF. 권한 자세히: [DATA_PERMISSION_GATE.md](../hufsability/DATA_PERMISSION_GATE.md).

**프로젝트 상태:** HUFS One AI는 11월 6일 아이디어 선정 전에 작성된 개인 제안 후보. **팀 아이디어 선정 → 문서 예선 채택 → 실제 구현**. 이 문서는 *실제 사용·계약·지급금 확인 결과가 아닌* 공식 공개 요금 및 기술 타당성 조사다. [전체 상품 114개 전수 검토표](SERVICE_CATALOG.md)와 구분해 본 문서는 기술·예산만 상세히 설명한다.

## 1. 먼저 결론: 꼭 필요한 네이버클라우드 구성

**5인 비공개 NCP P0(예선 채택 후의 후보안):** **NCP Server(VPC) + VM 내부 PostgreSQL 또는 별도 Cloud DB for PostgreSQL(비용 검증 후 선택) + 비공개 Object Storage + CLOVA Studio + VPN/ACG + 5인 앱 인증 + 비용 통제**. **공개 웹/회원가입/공개 API 엔드포인트는 만들지 않는다.**
- Server는 **VPN 내부에서만 접속 가능한 HTTPS 웹사이트/API**를 호스팅한다. Node/TypeScript 공용 규칙 엔진을 실행하고, **클라이언트·서버 두 곳에 같은 판정 함수**를 적용한다. 공인 인터넷에서 직접 80/443으로 웹서버 접속할 수 없게 차단한다.
- PostgreSQL은 학생 동의 상태/개인화 태그, 프로그램/채용 공고 정형 필드, 두 전공/이수과목, 추천 이유·검증 상태를 관계형 구조로 저장한다. **5명 데모의 우선 비용안은 NCP Server 내 PostgreSQL**, 별도 관리형 Cloud DB for PostgreSQL은 운영부담과 비용 비교 후 결정한다. **시연 기본은 합성 학생 정보만 NCP**에 저장한다.
- Object Storage에는 **재배포·보관 허가를 확인한** 공고 원문 버전/해시·합성 fixture·검증 리포트를 비공개 버킷으로 저장하고 DB에는 출처 URL·객체 키·해시를 참조한다.
- CLOVA Studio는 **HCX-007**으로 공고 본문의 예외조건/신청 경로/필요서류·원문 근거를 구조화하고 **HCX-DASH-002**로 학생이 동의한 교외활동 SkillTag를 제안한다. **수강내역 이미지/OCR/HCX-005 분석은 사용하지 않음**. CLOVA 키는 5인 VPN+앱 로그인에 접근 가능한 서버만 가지고, 사용자별/전체 요청 상한과 관리자 kill switch를 거친다.
- TypeScript 규칙: 개인정보 제공 범위/학과·학년/학적 상태/마감/추가 조건 판정은 **코드가 수행**. ELIGIBLE/INELIGIBLE/EXPIRED/UPCOMING/UNKNOWN/NEEDS_REVIEW 상태 및 원문·날짜 비교. LLM의 추측으로 공식 졸업사정을 확정하지 않는다.
- API Key·DB 비밀번호는 브라우저에 절대 전송하지 않으며, **서버 측 보안 저장소**에서만 처리한다. ACG로 DB 포트를 공인망에 공개하지 않는다.
- 발표용 오프라인 데모는 **5인 비공개 온라인 앱과 같은 UI/결정론 TypeScript 코어**를 사용하되 브라우저 JSON/IndexedDB 합성 fixture와 사전 CLOVA replay로 수행한다. **실시간 네이버클라우드 AI가 아님**을 명시하고 공개 인터넷 웹서비스를 만들지 않는다.

## 2. 데이터베이스 8종 비교 — 실제 어떤 데이터를 어디에 저장할 것인가

| 공식 서비스 | 데이터 구조/사용처 | 이 제품에서 선택 이유와 위험 |
| --- | --- | --- |
| **Cloud DB for PostgreSQL** | **학생(StudentAlias, Program, MajorEnrollment, Course, Opportunity, SkillTag, Consent, Evidence, ActionTask)** 관계 및 JSONB | 관리형 RDB 장점이 있으나 **5인 시연은 단일 NCP Server 안의 자체 PostgreSQL부터 우선 검토**. 관리형을 별도 구동하면 24시간 인스턴스 과금·백업·데이터 디스크 비용 |
| **Cloud DB for MySQL** | 동일 관계형 모델 | 팀이 MySQL에 익숙하다면 대안. PostgreSQL과 중복 설치하지 않는다 |
| **Cloud DB Serverless** | 자동 스펙 조절 MySQL 계열 관리형 DB | 현재 공식 안내는 **MySQL 기반**. 'Serverless'가 무료/사용 없을 때 항상 0원이라는 뜻이 아님. 인스턴스·스토리지 종량 요금과 최소 사양 확인 전 제외 |
| **Cloud DB for MongoDB** | 공고 원문 비정형 필드·활동 문서 | PostgreSQL JSONB로 초기 기능 충분하므로 DB 두 개 운영 금지 |
| **Cloud DB for Cache** | Redis 계열 최근 추천/지원가능 목록 캐시 | 비용·동기화 복잡성 증가. P0는 PG 인덱스/서버 메모리 우선 |
| Cloud DB for MSSQL | 학교가 정식 Microsoft DB 연계를 제공하면 | 정식 인증·스키마 허가 이전엔 제외, 라이선스 비용 주의 |
| Database Migration Service | 학교가 기존 DB의 승인된 복제/이관을 요구할 때 | 학교 DB 직접 접근 권한 부재, 지금 활용 불가 |
| Tibero | 한국 기관의 기존 Tibero 환경 연계 시 | 정식 계약 없으므로 제외 |

**예시 스키마(일부 항목):**
- `student_alias(alias_id, consent_version, admission_year, campus, student_status)`
- `major_track(alias_id, role:primary/double, major_code, curriculum_year, evidence_status)`
- `course_enrollment(alias_id, term, course_code, course_name, credits, credit_category, completion_status, verified_at)`
- `experience(alias_id, narrative_redacted, activity_type, term, provenance, disclosure_scope)`
- `skill_tag(alias_id, tag_name, source_experience, model_id, student_approved)`
- `opportunity(source_url, source_hash, title, category, date_kind, deadline, raw_object_key, last_verified_at)`
- `eligibility(opportunity_id, alias_id, rule_version, state, evidence_span, conflict_flags)`
- `action_task(opportunity_id, role, action, due_at, evidence_span, checked_by_student)`
- `consent(alias_id, purpose, choice, timestamp, revoked_at)`
- **수집 금지:** 학번 전체, 실명 인증정보, 성적등급, 평점(GPA), 백분위/석차, 상담·심리기록, 성적증명서 원본. 공식 HUFSAbility 역량인증에 성적을 사용하더라도 **우리 서비스가 성적을 받을 이유는 없다**.
- 실제 데이터 저장은 팀·예선 채택 후 학생 동의 및 학교 데이터 권한 검토가 끝난 경우로 제한. 5명 비공개 시연은 합성 StudentAlias로도 충분하다.

## 3. 팀원 5명의 이수과목 정리 — OCR 기능 제외(2026-10-28 사용자 결정)

**범위:** 이 서비스는 5명의 팀원만 사용하는 비공개 웹이며, HUFSAbility 화면 캡처를 업로드해 CLOVA OCR/멀티모달로 수강과목을 자동 입력하는 기능은 **이번 제품 범위에서 제거**한다. 과목 수집 대상도 5명이므로 자동 OCR 기능을 개발·과금하는 것보다 **팀원이 본인 이수과목을 제공하고, 사용자와 ChatGPT/CodexPro가 직접 자료를 정규화해 로컬 입력**하는 방식이 단순·정확하다.

**인입 계약(팀 선정·예선 채택 이후, 자발적 제공/동의가 있는 경우):**
1. 각 팀원은 HUFSAbility 이수교과목 조회에서 과목 정보만 정리해 텍스트 표/CSV·Excel/성적영역 제거된 PDF 또는 가린 화면 자료로 전달한다. CSV/Excel 공식 내보내기 버튼이 실제로 있는지는 확인 전이다.
2. **성적등급·평점(GPA)·석차·백분위·전체 학번·성명·비밀번호 및 원본 성적증명서는 요청하거나 수집하지 않는다.** 사진/캡처에 보이면 제출자가 로컬에서 삭제 후 전달. 이미지 OCR 자동처리/API 전송은 하지 않는다.
3. ChatGPT/CodexPro로 **5명 각각의 이수과목을 수작업 정리·검수**하여 `studentAlias, term, courseCode, courseName, credits, creditCategory, completionStatus, sourceType, verifiedAt` 형태의 로컬 표준 CSV/JSON을 작성한다. 불확실한 과목명/이수구분/중복 인정은 `UNKNOWN`으로 표시하고 팀원에게 확인한다.
4. 원본 자료의 열람·정정·삭제 권한은 자료 제공자/최소 담당자만 갖는다. 로컬 파일은 `.gitignore`에 들어가는 비공개 경로에 보관하며, GitHub/ChatGPT 공개링크/NCP로 자동 동기화하지 않는다.
5. **LIVE_NCP 시연에는 원칙적으로 합성·비식별 학생 프로필**을 사용한다. 다섯 팀원 실데이터를 NCP에 올리려면 수집·보관·AI 전송 각각의 명시적 동의와 학교 데이터 조건을 별도 검토한다.

**결과:** 캡처 업로드 UI, CLOVA OCR 수강표 인식, HCX-005 이미지 모델 호출·추출 정확도 시험·관련 토큰/유지비는 이번 MVP 산출물·필수비용에서 제외한다. **CLOVA Studio는 활동 텍스트 SkillTag와 공고 본문 해석에만 사용**한다. 공식 NCP 카탈로그의 OCR 상품은 전수조사 기록으로만 남긴다.

## 4. 실제로 검색·추천에 더해볼 NCP 기능 (전수 검토표 참고)

| 후보 | 기획 아이디어 | 지금 우선도 |
| --- | --- | --- |
| **CLOVA OCR / HCX-005 이미지 처리** | **팀원 5명 이수과목은 사용자/ChatGPT가 직접 정리하므로 수강내역 이미지 자동입력 기능 제외**. 공식 상품 카탈로그 조사기록으로만 남김 | **제외** |
| **Cloud DB for PostgreSQL** | 교내/교외 공고·학사·학생 승인 SkillTag, 근거·마감·동의·수정 이력을 일관되게 저장 | P0 |
| **CLOVA Studio HCX-007 Structured Outputs** | '팀원 전원 신청', '팀장 파일 제출', '외부 신청 페이지' 등 본문 예외조건 추출 | P0 |
| **Cloud Functions + Object Storage** | 정식 허가받은 공고만 저빈도로 수집·정규화·변경감지, 진위/마감 재검증 | P1 |
| **Cloud Search** | 경제+개발·Linux 등 자연어 동의어 검색·전공 맥락 검색 | P1 |
| **SENS + Cloud Outbound Mailer** | 자발적 수신 신청자만 마감·장학·대회 알림, 푸시/메일 수신 거부 기능 | P2 |
| **Papago Translation + CLOVA Speech** | 외국인 학생 다국어 공고 요건 안내·활동 음성입력 | P2 |
| **Data Query + Cloud Log Analytics** | 비식별 데이터로 클릭·정보발견/추천성과 측정해 학교 교육혁신원에 공유할 수 있는 보고서 | P2 |
| **AiTEMS/NCLUE** | 개인정보 동의·충분한 데이터가 쌓이면 장기 추천모델 실험 | P3 |
| **Cloud Insight + Cost Explorer** | 비용 상한·초과/타임아웃 경고·이상 API 사용 모니터링 | P0 |
| **Secret Manager + ACG** | 학생 프로필/AI 키/DB 보안. API Key 브라우저 노출 금지 | P1 |

## 5. 공식 공개 요금·무료구간 — 2026-10-28

**유의:** 한국 리전/일반 민간 NCP 공개표를 기준으로 읽은 **상품별 일부 확인 단가**다. 실제 요금은 리전/서버 세대/스토리지 유형/VPC/추가 공인 IP/네트워크/VAT/장애보호/신청 상품에 따라 달라지며, **공식 콘솔 요금계산기 실제 스냅샷을 확보하기 전의 대략적 비용표**다. **'무료'·'-'는 모든 기능 무제한 무료가 아니다.**

| 서비스/기준 | 공식 공개 정보·사용료(일부) | 실무적 의미 |
| --- | --- | --- |
| **Server Linux Standard-g2 2vCPU/8GB, 100GB 시스템 디스크 선택** | 공개 예시 **123원/시간 또는 월 88,000원** | 웹/DB 모두 한 VM에 올리면 관리형 DB 불필요, 운영·보안 책임은 팀에 |
| **Server Linux High CPU-g2 2vCPU/4GB, 100GB 시스템 디스크 선택** | 공개 예시 **100원/시간 또는 월 72,000원** | 소형 API·개발 테스트 후보. 서버 타입/가용 지역/상품 페이지 확인 |
| **Cloud DB for PostgreSQL High CPU 2vCPU/4GB** | 공개 예시 **158원/시간/대** | 단일 DB 약 **113,760원/30일(720시간)**, 고가용성/백업/데이터 디스크는 별도 |
| **Cloud DB for PostgreSQL Standard 2vCPU/8GB** | 공개 예시 **250원/시간/대** | 단일 DB 약 **180,000원/30일**, HA 2대 **360,000원/30일**(공식 요금 예시) |
| **Object Storage** | **28원/GB-월**(1PB 이하), PUT/LIST **45원/1만건**, GET **4원/1만건** | 공개 공고 합성 자료 5GB 보관만이면 약 **140원/월** + 요청·외부 전송 별도 |
| **Cloud Functions** | 요청 월 **100만건 무료**, 사용 월 **400,000 GB-초 무료**, 초과시 **200원/100만 호출** 및 **0.017원/GB-초** | 소량 ETL은 함수료 거의 없을 수 있으나 **Cloud Log Analytics 필수 연동 및 별도 과금** |
| **API Gateway** | 최초 월 **100만 호출 무료**, 초과 **0.004원/요청**, 전송 1GB 초과 **100원/GB** | **5인 VPN 내부 앱 서버 호출만 사용하면 불필요**. API Gateway를 외부에 열어 NCP AI를 우회 호출하도록 하는 구조 금지 |
| **Cloud Log Analytics(Standard)** | 수집 기본 무료(한도), 보관 **1GB 이하 무료, 초과 800원/GB-월** | 서버 로그를 필수 보관하는 함수 구성시 규모 관리 |
| **CLOVA OCR General (미채택)** | 공식 상품페이지 **글자 100회/월·표 100회/월 무료 제공 표시**, 표 추출시 글자 추출도 호출되며 **25원/건 청구** 안내 | **이번 5인 시연에서는 활성화하지 않음**. 문서·템플릿 일부는 기본 월정액 존재·미사용 청구 가능 |
| **CLOVA Studio HCX-007/HCX-005/DASH-002** | 공식 상품 HTML은 입력/출력 각 **1,000토큰 요금 셀을 '-'로 표기**해 이 조사로는 **현재 확정 실단가 검증 불가** | 입력/출력 토큰 별도 과금, 실제 콘솔 청구표/특강 지원 크레딧·할당량 확인 전 금액 만들지 말 것 |
| **Cloud DB Serverless** | **컴퓨트 인스턴스·저장용량 종량 과금**, 무료 수치/최소 단가 별도 확인 필요 | MySQL 기반 자동확장인데 **미사용=0원/무료라 단정 금지** |
| **Public IP, VPC 인터넷 네트워크, 로드밸런서/비공개 DB 통신** | 서비스별 별도 표. 일부는 고정 월/시간, 아웃바운드 트래픽 사용량 | 비공개 API냐 공개 사이트냐와 별개로 서버/DB 지속 사용요금 발생 |
| **Papago/Cloud Search/보안 모니터링/오픈배지 아이디어** | 서비스별 추가 정액/종량 요금·권한 확인 필요 | 구현 1차의 고정비가 증가하므로 필요성 실증 뒤 적용 |

**공식 출처**
- 상품 전체: https://www.ncloud.com/product
- 일반 한국 리전 공개 요금: https://www.ncloud.com/charge/price/ko 및 https://www.ncloud.com/charge/region/ko
- CLOVA Studio 공개 모델·기능/요금표(실시간 가격 셀 '-'): https://www.ncloud.com/api-cms/service-product/static/clovaStudio
- 모델별 입출력·구조화 지원: https://guide.ncloud-docs.com/docs/clovastudio-model
- CLOVA OCR 요금·일반 인식/표 추출: https://www.ncloud.com/api-cms/service-product/static/ocr
- CLOVA OCR 데이터 처리·추가 월 유지비: https://guide.ncloud-docs.com/docs/clovaocr-spec
- DB Serverless VPC 종량/MySQL 안내: https://guide.ncloud-docs.com/docs/db-clouddbserverless-overview
- DB PG 서비스: https://www.ncloud.com/api-cms/service-product/static/cloudDbPostgresql

## 6. 팀원 5명 전용 비공개 배포 — 외부인 웹/AI 접근 차단(2026-10-28 최종 결정)

**현재 확정된 사용자 요구:** 공개 서비스/회원가입/검색엔진 노출/공개 AI API를 **하지 않는다**. 사용자는 허용된 팀원 **정확히 5명**이다. 외부인이 사이트/AI API에 접근하여 크레딧을 소진하지 못하게 웹 네트워크 계층과 애플리케이션 계층을 **이중 차단**한다. **아래는 예선 문서 채택 뒤 구현할 설계안이며 현재 서버나 보안장치를 실제 구축한 것은 아니다.**

### 6.1 추천 구성: NCP Server(VPC) + 팀원 전용 VPN + 비공개 웹 + 서버 측 CLOVA

1. **NCP Linux Server/Private VPC:** 기본 웹·API는 VPN 사설 인터페이스/사설 주소에서만 서비스한다. **인터넷 공인 IP에서 TCP 80/443/DB 포트/관리자 웹/health/API로 직접 접근 불가**. 허용된 공고·합성 학생 데이터 외 외부 공개 콘텐츠가 없다.
2. **5명 VPN 네트워크 인증:** 3주 실증의 저비용 우선안은 NCP VM에 **자체 WireGuard** VPN을 설정하는 것(오픈소스 소프트웨어 자체 이용료 0원, VM/공인 IP/전송/관리 비용은 별도)이다. 외부로 열리는 것은 **인증된 WireGuard 키로만 VPN을 수립하는 단일 UDP 포트**다. 각 팀원 장치에 고유 VPN 키를 발급하고 유출·탈퇴 시 해당 키 폐기. 개인별 인증·접속 기기 지원 비용도 검토한다. **인터넷에서 VPN UDP 포트의 존재를 관찰할 수 있어도 웹/API는 보이면 안 된다.**
3. **별도 앱 인증:** VPN 접속 자체가 앱 회원임을 뜻하지 않는다. 직접 초대한 **서로 다른 팀원 계정 5개**에만 로그인 가능, 공개 회원가입/초대 코드/게스트 계정/암호 공유 금지. 개인별 세션 만료·계정 잠금·비밀번호 해시와 가능하면 MFA. 서버는 요청마다 `authenticated && allowlisted && active`와 행별 권한을 확인한다. 팀원 5명의 계정과 해당자 프로필만 접근 가능해야 한다.
4. **CLOVA Studio 호출 차단:** API 키는 서버 안에만 보관한다. 브라우저로 직접 API 키 전달/서버에서 공개 프록시 라우트 제공 금지. AI 버튼/분석 요청은 **VPN+5인 앱 인증+목적별 동의+사용량 quota**를 통과할 때만 서버가 호출. 클라이언트의 AI 요청 횟수/모델명/출력토큰 지정은 서버에서 검증·축소한다.
5. **이중 과금 안전장치:** 사용자별 1일 예시 **5회**, 전체 팀 1일 예시 **20회** AI 호출, 입력 최대 **1,500 토큰/요청**, 출력 상한 **400 토큰/요청**(모두 **개발 시 확정할 보수적 제안값**). **동일한 내용의 입력 해시 캐시/요청 중복 방지·1회성 추출·실패 시 자동 무한 재시도 금지**. 총 예상비용을 사전 계산하고 관리자 `AI_ENABLED=false` kill switch 기본 적용. 비용 이상/불명 접근/반복 429는 AI를 즉시 비활성화하고 로컬 규칙 폴백.
6. **데이터/감사:** Object Storage 버킷은 Public ACL/공개 URL OFF, 사전서명 링크는 최소 필요·짧은 만료에 한정하거나 아예 사용하지 않는다. DB 포트는 사설망에서 앱 서버로만 허용, 계정별 최소권한/백업·로그 암호화·민감값 마스킹. 팀원 계정/학사/활동자료를 행 단위로 분리하고 로그·분석에 실명/학번/성적 원본 금지.
7. **오프라인 시연:** 실제 발표장에선 팀원 노트북의 **LOCAL_OFFLINE** 빌드만 실행해도 된다. 외부 심사위원에게 NCP 비공개 서버 계정을 지급하지 않는다. 온라인 NCP 실사용 증빙(서버·DB/Storage·CLOVA 토큰)은 화면 캡처/비식별 보고서로만 제시한다.

**IP 허용목록만으로 접근 통제하지 않는다.** 모바일 네트워크·Wi-Fi 변경 시 IP가 달라질 수 있으며, CORS/숨긴 URL/robots.txt도 접근 인증 수단이 아니다. VPN 5키 + 앱 5계정 + 서버 quota + 공개 웹 차단의 독립 방어를 기본으로 한다.

### 6.2 NCP SSL VPN은 기본 채택하지 않음 — 서비스 종료 공지

- NCP의 **2026-10-08 공식 공지**: 기존 **SSL VPN 신규 가입 2026-11-24 18:00 종료**, **기존 서비스 2027-01-21 18:00 종료**. 대체 **Secure Access(제로트러스트) 2026-11-24 출시 예정**. **개발 시점이 겹치므로 기존 SSL VPN을 신규 구축/장기 운영 계획의 필수 요소로 지정하지 않는다.**
- 기존 VPC SSL VPN에는 ID 5개를 지원하는 OTP 인증 상품이 있지만, **2026-10-28 공개 가격표상 5 ID 월 150,000원(VAT 별도)**이며 이를 쓰더라도 웹앱 자체 5인 로그인은 별도 필요하다. 종료 예정이라 비권장.
- **Secure Access**는 출시 전 정확한 요금·가입 조건·OS 지원·사용자 수/설치 방법이 **미확정**이다. 11/18 특강 및 11/24 출시 뒤 비교하여 실제 이용 가능할 때만 WireGuard 대안으로 검토.
- 공식: https://www.ncloud.com/support/notice/all/2280 , https://guide.ncloud-docs.com/docs/sslvpn-user-vpc , https://www.ncloud.com/charge/price/ko , https://guide.ncloud-docs.com/docs/server-ts-access-architecture-vpc

### 6.3 5명 비공개 운영 시 예상 비용 — 외부 공개 웹 없음

**중요:** '비공개'는 **네트워크 접근 제한**이지 NCP의 서버·스토리지·DB 과금을 없애는 무료 요금제가 아니다. 요금은 한국 리전 공개표에서 선택한 예시 사양·30일 환산이며, VAT·VPN UDP 용 공인 IP/트래픽·NAT·관리형 DB 백업/디스크·AI 입출력 토큰·암호화/보안·크레딧 적용 여부 제외. **정식 견적 아님**.

| 시나리오(30일) | 팀원 5명 접근 경로 | 기본비 예시(VAT/AI/네트워크 제외) | 판단 |
| --- | --- | ---: | --- |
| **A. 로컬 오프라인** | 본인 PC/시험용 노트북만 | **NCP 0원** | 비용·보안 단순, **NCP 실제 사용 증거가 없음** |
| **B. 비공개 NCP 1대 + 자체 DB** | VM 내 WireGuard + 앱 5인 로그인, PostgreSQL 자체운영, 5GB 비공개 Object Storage | **72,140원/월** (Linux High CPU-g2 72,000 + Object Storage 약 140) | 5명 실증에서 우선 검토. VPN 소프트웨어 0원, **공인 IP/네트워크/토큰/VAT 추가**, 운영 책임 팀 |
| **C. 비공개 NCP + 관리형 PG 1대** | WireGuard/5인 로그인 + VM 2vCPU/8GB + PostgreSQL 관리형 2vCPU/4GB + 5GB Storage | **201,900원/월**(88,000 + 113,760 + 140) | DB 관리 부담 감소, 관리형 고정비·기타 과금 추가 |
| **D. NCP 기존 SSL VPN 5인 + B** | 기존 VPC SSL VPN 상품 추가(종료 예정) | **222,140원/월**(B 72,140 + SSL VPN 150,000) | **신규 구축 비권장/2026-11-24 이후 가입 불가 예정**, 네트워크·기타 과금 추가 |
| **E. 향후 Secure Access + B** | 2026-11-24 출시 예정 제로트러스트 상품 | **미확정** | 실제 출시/요금/인증 방법/혜택 확인 후만 선택 |

**본선 21일 비용의 계산 참고:** 2vCPU/4GB VM을 100원/시간 × 504시간 = **50,400원**, 관리형 PostgreSQL 2vCPU/4GB를 158원/시간 × 504시간 = **79,632원**. 실제 사양별 월/시간 요금제·기간 계산이 다르므로 두 결과를 **보장된 청구액**으로 간주하지 않는다. Object Storage·네트워크·CLOVA·VAT 별도.

**크레딧/과금 통제 정책:**
- 계정의 **실제** 50만원 지원/적용 서비스/만료일/AI 토큰 지급 형태/초과 청구 여부를 관리자 화면과 주최측 안내에서 확인하기 전 **유료 리소스 생성 금지**.
- CLOVA의 공식 **QPM/TPM은 안정성용 이용량 상한이지 금액 지출 하드캡이 아니다**. 계정 전체·앱 내부 두 단계 quota를 분리하고, 모든 모델 호출은 server-side budget gate를 통과한다. 공식 가이드 https://guide.ncloud-docs.com/docs/clovastudio-ratelimiting
- NCP 비용 알림/Cloud Insight/Cost Explorer를 확인하지만 **클라우드 지출 경고 자체가 자동 중지/절대적 손실 방지 장치라는 보장은 없다**. 위험 발생시 API 키 비활성화→앱 AI kill switch→VM/DB 중지·반납하고 크레딧/잔액 확인. **실제 실행·자동 중지는 미구현**.
- 팀원 5명만 접근 가능하더라도 **실수·계정유출·무한 재시도·기본비용에 의해 과금이 발생**할 수 있다. 접근 통제는 필요한 첫 조건일 뿐 무과금 보증은 아니다.

## 7. 예선 문서의 NCP 가치 전달 문구 (개발 전)

**왜 NCP가 필요한가:** 학교 공고·학사·진로 자료의 정형 필드와 본문 추가조건은 별도의 해석/검증 문제를 가진다. **CLOVA Studio는 학생의 방학 활동과 비정형 공고를 구조화하고, PostgreSQL은 5명 팀원의 허용된 두 전공·이수과목/승인 태그와 공고·마감·근거를 연결하며, NCP Server/Object Storage는 5명만 접근할 수 있는 비공개 웹의 검증 가능한 운영·출처 보관을 맡는다.** 학사·자격·마감은 결정론 규칙으로 판단하고 UNKNOWN을 노출한다. **수강내역 OCR은 제외**하고 소수 팀원의 과목을 직접 정리하여 입력한다.

**학교의 지속적인 개선에 기여:** 한국외대는 이미 HUFSAbility 고도화를 공식 과제로 두고 매년 기능과 인증제도를 개선했다. 이 제안은 그 투자를 부정하지 않고 **교과·비교과·진로·교외활동을 학생 한 명의 실제 행동으로 연결**하는 학교 승인형 실증/연계 서비스를 제시한다.

**정책/허가:** 외부 데이터 대량 크롤링·학교 로그인/SSO 복제·성적 조회 자동화·실학생 원본 캡처 API 업로드는 **별도 권한 없이 수행하지 않는다**. 이 제품의 내부 추천 스킬/가상 학생 정보는 **공식 학교 역량 인증 결과가 아니다**.

