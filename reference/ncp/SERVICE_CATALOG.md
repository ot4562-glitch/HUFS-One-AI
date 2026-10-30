# NAVER Cloud Platform 서비스 전수 검토표 — HUFS One AI 개인 제안 후보

**조사 기준일:** 2026-10-28. **공식 제품 카탈로그:** https://www.ncloud.com/product
**조사 범위:** 공식 제품 목록의 **19개 분류·114개 고유 상품**. Featured/솔루션·비즈니스 카테고리에서 같은 상품을 반복한 것은 중복 계수하지 않았다. 각 상품의 **HUFS One AI 적용 아이디어(추론)**와 **검토 우선도**를 나열했으며, 개별 API/요금까지 100% 검증되었다는 뜻은 아니다. 폐지 상품도 판단을 위해 포함한다.

**현 단계:** 11월 6일 아이디어 선정 전 개인 후보. 팀 채택·예선 문서 채택 이후에만 실제 개발/유료 서비스 검토. **P0** 핵심 기술안, **P1** 보완, **P2/P3** 미래 확장, **보류/대안/탐색/제외**는 당장 채택하지 않음.

**상품 요금은 '소프트웨어 실행 방식(무료·종량·월정액·계약)'과 '실제 비용'(인스턴스/요청/대역폭)이 다르다.** 여기의 모든 상품에 가격을 임의 배정하지 않으며 정확히 확보한 단가와 비공개·공개 운영 시나리오는 같은 폴더 `COST_AND_ARCHITECTURE.md`를 본다.

## AI Services (14개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| AiTEMS | 학생별 행동 로그 기반 추천을 장기적으로 학습; 5명 실험·동의/이력 부족으로 당장은 제외 | P2 |
| CLOVA AiCall | 대학 행정전화 음성상담 자동화; 본 프로젝트의 정보 피드와 관계 약함 | 제외 |
| CLOVA Chatbot | FAQ 상담 봇; 이미 CLOVA Studio API로 대체 가능하여 중복 비용 회피 | 보류 |
| CLOVA Dubbing | 다국어 학사정보 안내 영상 제작; 문서·카드 MVP에 불필요 | P3 |
| CLOVA OCR | 상품 조사기록만 유지. **팀원 5명의 이수과목은 직접 정리하여 입력하므로 수강내역 캡처 OCR 기능 미채택** | 제외 |
| CLOVA Speech | 학생이 방학 중 활동을 말로 입력하도록 음성→텍스트 변환(접근성) | P2 |
| CLOVA Studio | **VPN+5인 인증 후 서버 내부 호출만**. HCX-007 공고 본문 구조화·추가 자격/신청 단계, HCX-DASH-002 활동 SkillTag. 수강내역 이미지 입력 없음 | P0 |
| CLOVA Voice | 학사 공고 읽어주기/접근성; 텍스트 피드 이후 | P2 |
| CLOVA Speech Recognition(CSR) | 구형 음성인식 API; 신규 CLOVA Speech와 중복 비교 후 선택 | 보류 |
| Papago Translation | 외국인 학생에게 공고 설명·후속 조치를 다국어로 제공하고 한국어 원문 병기 | P2 |
| Papago Image Translation | 외국어 포스터 OCR 번역; 원문 검증·권리/비용 때문에 보류 | P3 |
| CLOVA CareCall | 취약 학생 자동 안부전화는 개인정보·안전 리스크가 커 본 프로젝트 범위 외 | 제외 |
| ML expert Platform | 자체 추천모델 학습/MLOps; 3주 MVP에 과도 | P3 |
| NCLUE | 행동 기반 추천·개인화 AI 상품의 계약/지원 범위를 확인해 장기 비교, 데이터·비용 미확정 | 보류 |

## Application Services (6개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Maps | 서울/글로벌 캠퍼스·교외 채용행사 경로/위치 표시 | P2 |
| Simple & Easy Notification Service | 동의한 학생에게 마감임박·중요 학사 알림 PUSH/SMS/Email, 실패/유료 발송 방지 | P1 |
| API Gateway | 공개 API 호출량·키·요청량 관리; 웹 서버 직통 API로 시작하고 추후 채택 | P1 |
| Ncloud Simple RabbitMQ | 규모 커질 때 공고 비동기 수집/검증 큐; 소수 자료에는 과도 | P3 |
| Cloud Outbound Mailer | 신청 마감 리마인더 메일 발송; 사전 동의/수신거부 필요 | P2 |
| NAVER API HUB | 허용 가능한 NAVER 서비스 API/인증 연계 탐색; HUFSAbility 비공식 API 대체 불가 | 탐색 |

## Big Data & Analytics (12개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Cloud Hadoop | 수백만 사용자 로그 분산 분석; 5명 연구에는 과도 | 제외 |
| Cloud Search | 한국어 형태소·동의어 기반 교내외 기회 검색, 검색량 커지면 시범 도입 | P1 |
| Search Engine Service | OpenSearch/Elasticsearch로 공고 전문검색·검색 분석; 서버/관리 비용 고려 | P2 |
| Cloud Data Streaming Service | 실시간 이벤트 Kafka 수집; 학교 공고는 배치이므로 미필요 | 제외 |
| Data Forest | 폐지 표시 제품. 신규 도입 금지 | 제외 |
| Cloud Data Box | 네이버 보유 데이터와 안전 결합 가능성 검토; 허가/계약·매칭 조건 미확정 | P3 |
| Data Catalog | 학교 공고·과목 원천의 출처·스키마·검증 책임을 대규모로 카탈로그화 | P2 |
| Data Flow | 허가된 공개 공고 ETL·일정 동기화 파이프라인의 시각적 설계 | P2 |
| Data Query | NCP에 축적한 비개인 이벤트 로그를 SQL 분석해 추천 근거·전환 지표 집계 | P2 |
| NIMORO | BI 대시보드로 프로그램 참여 유입·부서별 성과 집계, 운영 주체 협의 후 | P3 |
| Datafence | 개인 데이터의 보안 분석환경, 학교와 공식 공동연구 계약 시 검토 | P3 |
| Data Stream | 추천/프로필 변경 이벤트 큐; P0에는 DB만으로 충분 | P2 |

## Blockchain (1개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Blockchain Service | 오픈배지 진위 검증 아이디어는 가능하지만 공식 발급처/권한 없이 별도 체인 생성 무의미 | 제외 |

## Business Applications (2개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| NAVER WORKS | 학교가 승인한 산학협력 문의/운영부서 워크플로·담당자 알림. 외부 학교 계정 연동 권한 전제 | P3 |
| Ncloud Chat (Deprecated) | 폐지 상품, 신규 도입 불가 | 제외 |

## Compute (6개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Server | **인터넷 공개 웹 금지**. NCP VPC VM에 팀원 5명 VPN 전용 HTTPS 웹/API+TypeScript 결정론 엔진, 필요 시 자체 PostgreSQL 운영 | P0 |
| SSD Server | DB 디스크 I/O가 충분치 않을 때의 고성능 VM, P0는 일반 서버부터 | P2 |
| GPU Server | 자체 모델 학습/서빙에만 사용; CLOVA API가 있으므로 중복·고비용 | 제외 |
| Bare Metal Server | 고성능 단일 물리 서버; 소형 대학생 MVP에 불필요 | 제외 |
| Auto Scaling | 사용자가 크게 늘면 웹 서버 자동 확장, 5명 사전 실험 단계엔 불필요 | P2 |
| Cloud Functions | 공고 업데이트/삭제/상태검증·이용허락된 웹페이지 저빈도 스냅샷 변환 | P1 |

## Containers (2개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Container Registry | NCP 서버 배포용 Docker 이미지 보관, 협업·배포 자동화 필요 시 | P1 |
| Ncloud Kubernetes Service | 여러 서비스 고가용성 오케스트레이션; P0 단일 서버엔 비경제적 | P3 |

## Content Delivery (2개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Global CDN | 공개 웹 JS/CSS·공개 이미지·합성 홍보 자료 전송 최적화 | P1 |
| Global Edge | 사용자에게 가까운 글로벌 배포; 한국 단일학교 실증엔 불필요 | P3 |

## Database (8개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Cloud DB Serverless | MySQL 계열 자동 확장 관계형 DB 후보. 'Serverless'도 인스턴스/스토리지 사용요금 발생, 무료 아님 | P2 |
| Cloud DB for PostgreSQL | 학생 동의 프로필/두 전공·이수과목/공고/SkillTag/동의·판정근거 관계형 스키마의 **관리형 핵심 DB 후보** | P0 |
| Cloud DB for MySQL | PostgreSQL과 비교 가능한 관리형 RDBMS 대안; 중복 DB 운영 금지 | 대안 |
| Cloud DB for Cache | 실시간 추천 캐시·최근 공고 조회 비용 감소, 사용량 증가 후 검토 | P2 |
| Cloud DB for MSSQL | MS SQL 연계가 있는 기관 협약 시 검토, 현재 불필요한 라이선스 비용 | 제외 |
| Cloud DB for MongoDB | 유연한 공고 원문·활동 JSON 저장 후보지만 PostgreSQL JSONB로 P0 충분 | 대안 |
| Database Migration Service | 학교가 허가한 DB를 이관해야 할 때만 사용, 공식 데이터 권한 없음 | P3 |
| Tibero | 학교 특정 기존 DB와 공식 연동이 확정된 경우에만 검토 | 제외 |

## Developer Tools (5개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| SourceBand | 소스 저장소·이슈 협업 플랫폼 후보; GitHub Private와 비용/협업성 비교 | 대안 |
| SourceCommit | NCP 자체 Git 코드 저장소 대안; 팀 GitHub와 중복 금지 | 대안 |
| SourceBuild | 팀 선정·예선 통과 뒤 타입스크립트 빌드·테스트 CI | P1 |
| SourceDeploy | NCP VM/컨테이너 자동 배포; 배포 사고 방지 승인 필요 | P1 |
| SourcePipeline | 소스→빌드→배포 연결 자동화, 3주 MVP에서는 GitHub Actions와 비교 | P2 |

## Digital Twin (1개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| ARC eye | 캠퍼스 위치·건물 3D/AR 길찾기엔 가능하지만 진로 추천 MVP와 무관 | 제외 |

## Gaming (1개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| GAMEPOT | 학생 캠퍼스 게임/활동 보상 아이디어엔 가능, 핵심 학사·채용에는 무관 | 제외 |

## Hybrid & Private Cloud (1개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Neurocloud | 학교 독자 인프라에서 개인정보 민감 AI 전용 운용 장기 검토; 비용/계약 제약 | P3 |

## Management & Governance (15개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Cloud Log Analytics | 허용된 API 호출/추천 오류·서버 이벤트를 개인정보 제거한 로그로 기록 | P1 |
| Sub Account | 5명 팀원 계정 권한을 분리하고 NCP 비용/비밀키 접근 제한 | P0 |
| Effective Log Search & Analytics | 추천 응답 실패·원문 판정 오류 등 애플리케이션 로그 조회 | P1 |
| Web service Monitoring System | 공개 URL 가용성·응답 오류 측정 | P1 |
| Cloud Activity Tracer | 클라우드 리소스 조작 감사로그, 삭제/배포 이력 | P1 |
| Ncloud Tools & SDK | 배포·API·Object Storage 스크립트를 소수 자동화 | P1 |
| Resource Manager | 팀 NCP 리소스 태그(owner,expiry,purpose)·수명 관리 | P1 |
| Cloud Insight | NCP 서버/DB CPU·메모리·요금 사고 조기 경보 | P0 |
| Pinpoint Cloud | API·DB 느린 구간 분산 추적, 성능 병목 발생 시 | P2 |
| Cloud Advisor | 비용/보안/성능 설정 점검 권장안 | P1 |
| Organization | 여러 프로젝트/부서 계정 통합, 5명 팀에서는 제외 | 제외 |
| API Workflow | 공개 허가 데이터 ETL/검증의 단계적 자동화, P0 단순 배치 우선 | P2 |
| Ncloud Single Sign-On | 학교가 공식 연동 승인 시 사용자 SSO; 포털 로그인 비공식 복제 금지 | P3 |
| Cost Explorer | 크레딧 사용량·리소스별 실제 청구 집계, 0원 자비 지출 목표 검증 | P0 |
| Service Quota | 모델·API·서버 이용량 상한 설정/증설 신청 관리 | P0 |

## Media (8개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Image Optimizer | 공개 공고 포스터·모바일 썸네일 크기 자동 최적화 | P2 |
| Live Station | 실시간 설명회 방송 운영, 공모전 추천 웹과 무관 | 제외 |
| VOD Station | 학생 진로교육 영상 업로드/재생; 향후 학교 연계 시 | P3 |
| Media Connect Center | 대형 미디어 워크플로에 불필요 | 제외 |
| Video Player Enhancement | 강의·행사 영상 접근성/검색 고도화, 첫 MVP 무관 | P3 |
| One Click Multi DRM | 학교 유료 강의 저작권 보호, 지금은 해당 없음 | 제외 |
| B2B PRISM Live Studio | 동아리·행사 생중계 연계 가능성만 존재, 불필요 | 제외 |
| Media Intelligence | 학교 공개 강의/진로 영상 자막 요약·내용 검색, 저작권·API 비용 필요 | P3 |

## Migration (2개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Data Teleporter | 기존 학교 데이터베이스 대량 이관 시, 사전 승인 없으므로 제외 | 제외 |
| Object Migration | 공개 허가된 원본 공고 파일을 NCP 버킷으로 이전할 때 사용 가능 | P2 |

## Networking (8개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| VPC (Virtual Private Cloud) | 외부 웹 서버와 외부 비노출 관리형 DB·Storage 접근망 분리 | P0 |
| Load Balancer | 트래픽 늘면 HTTPS 로드분산, 소형 P0는 단일 서버 우선 | P2 |
| Cloud Connect | 학교 사설망과 정식 사설회선 연계 계약 시에만 | P3 |
| Global DNS | 공개 웹 도메인 레코드 운영, 학교 도메인은 별도 허가 | P1 |
| IPsec VPN | 학교 공식 학사 DB와 승인된 사설 접속이 필요할 때 | P3 |
| NAT Gateway | 사설 DB/백엔드가 인터넷 접근 필요할 때만. 시간/전송 비용 주의 | 보류 |
| Global Traffic Manager | 멀티 리전 장애조치, 국내 단일 MVP엔 과도 | P3 |
| Classic Path | 기존 Classic 환경 연결 지원, 신규 VPC 우선 | 제외 |

## Security (14개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Basic Security | 기본 NCP 보안 설정/기본 보호 수단 | P0 |
| ACG | 웹 443만 공용 허용, DB 포트 사설/지정 앱 서버에서만 접근 | P0 |
| App Safer | 모바일 네이티브 앱 위변조 탐지; PWA 중심 MVP엔 불필요 | P3 |
| File Safer | 업로드 파일 위험/악성 검사, 이미지 업로드 확대 시 확인 | P2 |
| Security Monitoring | 서버 이상·공격 감시, 퍼블릭 서비스의 개인정보 범위 확장 시 | P2 |
| SSL VPN | 관리자 원격 사설망 접근 필요 시 | P2 |
| Web Security Checker | 공개 PWA/API 취약점 정기검사, 비개인 자료로만 수행 | P1 |
| System Security Checker | NCP 서버 운영체제 설정 점검, 인가된 범위만 | P1 |
| Key Management Service | 저장 데이터 암호화 키 관리, 관리형 DB/Storage 암호화 연계 | P1 |
| Certificate Manager | HTTPS 인증서 설치·갱신 관리, 무료 TLS/요금 비교 | P1 |
| Private CA | 학교 조직 내부 인증서·MTLS와 연계할 때만 | P3 |
| Webshell Behavior Detector | 업로드·실행 서버 침해 탐지, 추후 운영 | P2 |
| Cloud Security Watcher | 보안 자산/설정 지속 모니터링, 학교 승인 이후 | P2 |
| Secret Manager | CLOVA API 키·DB 접속 비밀을 서버 측에서 관리, 브라우저/리포에 저장 금지 | P1 |

## Storage (6개)

| 서비스 | HUFS One AI에서 사용한다면 어디에/어떻게 | 판단 |
| --- | --- | --- |
| Object Storage | 허가받은 공고 원문/스냅샷·출처해시·합성 demo fixture 비공개 버킷 | P0 |
| Archive Storage | 장기 보관한 비개인 공고 백업을 낮은 비용으로 보관할 때 | P3 |
| Block Storage | VM/관리형 DB 추가 데이터 디스크·요금 주의 | P1 |
| NAS | 서버 여러 대가 공유하는 대용량 파일, 소형 P0 불필요 | P3 |
| Backup | DB/공고/동의 설정 복원 가능성 확보, 비용 견적 후 | P1 |
| Ncloud Storage | 초대형 저장·파일 서비스 대안으로 추후 검토; Object Storage 우선 | 보류 |

## 전수조사의 한계와 적용 판단

- 공식 목록에서 **존재**를 확인했으나 요금표/서비스 신청 화면이 개별적으로 공개되어 있지 않은 상품은 숫자를 기재하지 않았다. 정식 리전·VPC/Classic 지원·결제/쿼터·무료 혜택은 실제 콘솔에서 확인해야 한다.
- **2026-10-28 사용자 결정:** 수강과목 캡처→CLOVA OCR/HCX-005 자동입력은 **미채택/제외**. 팀원 5명 자료는 본인이 성적·GPA·실명·학번을 제거한 뒤 ChatGPT/CodexPro로 직접 정리·확인하는 방식. **웹·API는 공개하지 않고 5명만 VPN+앱 인증으로 접근**. 기존 SSL VPN은 11/24 신규가입 종료·2027-01-21 서비스 종료 공지가 있어 기본안이 아님. 공식 https://www.ncloud.com/support/notice/all/2280
- **학교 SSO/HUFSAbility 직접 연결**, 개인 성적 크롤링, 학교 로고·CSS 복제, 타인의 학사 DB 접근, 크레딧 지급은 이미 승인된 사실이 아니다.
