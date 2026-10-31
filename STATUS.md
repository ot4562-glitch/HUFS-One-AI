# HUFS One AI | 현재 작업 상태

> **2026-10-31 최신 담당/서버 계약:** API·인증·DB·SourceRevision/RAG 및 provider-neutral API 결과 검증 코드는 **심민성 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)** 전담. **이서연 [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)**은 NCP·CLOVA·OCR/Vision·Laya 클라우드 **환경 준비만** 담당. UI 이의상 #9·추천/공지 김채윤 #10·학사 박준영 #11 담당 변경 없음. NCP 설계는 **High Memory-g3 Linux 4vCPU·32GB + 별도 50GB CB**, 11/6~12/9은 최대 예산 가정이며 [공식 학교 공고](https://job.hufs.ac.kr/job/imng/icmpNsbjtPgm/findIcmpNsbjtPgmInfo.do?encSddpbSeq=1006089)상 본선 발표 11/16 및 크레딧 발급 이후에만 개통. 공용 심사 초대장은 이메일 사전등록 불필요, 합성 전체 시연, 기간 내 반복 접속; 실학생 자료/유료 호출 차단. `Proposal.md`만 제안서 정본.


## 2026-10-31 로컬 API·담당 계정 정리 (별도 PR 브랜치, 아직 main 미병합)

- **로컬 코드 작성:** Fastify route·strict Zod·공통 오류, 익명 401/초대·메일증빙 403/Origin·CSRF·SharingGrant·session-bound DemoContext·snapshot/version/철회, 4종 AI 작업의 mock packet·인용 대조·idempotency/quota, immutable time/asOf·rights 기반 **LocalTemporalEvidenceIndex**. 세부 [apps/api/README.md](apps/api/README.md).
- **자동 테스트:** 2026-10-31 로컬 결과로 기존 공통계약 87건 + 소비자 20건 + 신규 API 21건 = **128/128 PASS**. npm typecheck 및 build:api PASS. 이 수치는 실제 Google OIDC/OTP·DB·NCP·CLOVA/OCR/Vision/Laya 검증을 뜻하지 않는다. 원격 CI 결과와 PR/QA는 별도 확인한다.
- **출시 차단 유지:** 실제 verifier/메일 OTP/Google PKCE·DB·영속 revoke·인증 우회 E2E·실학생 동의·NCP 승인 없이 배포 불가. 로컬 harness는 모든 HTTP 요청 401, 합성 Fastify inject에서만 DI 테스트. 이전 본문의 과거 API 미구현 문구는 이 브랜치 이전 시점의 이력이다.
- **GitHub 역할 ID:** 심민성 ot4562-glitch, 이의상 uisang2004-maker, 김채윤 qamarrchae, 박준영 taewangim-alt — 각 담당 이슈 assignee 확인. **이서연 ID는 미확인**. [docs/WORKSTREAMS.md](docs/WORKSTREAMS.md).


**NCP 새 운영 정본:** [NCP_OPERATIONS_2026.md](docs/NCP_OPERATIONS_2026.md) — 2026-11-06~12-09(816h 예산 상한), 실제 본선 발표 11/16 및 크레딧·사용자 승인 이후 개통. 한국 VPC Linux High Memory-g3 4vCPU/32GB 326원/h + 50GB CB SSD 8원/h(선택 공인 IP 5.6원/h); 816h 서버+CB 272,544원, IP 포함 277,113.6원(VAT 등 제외).

**기준일: 2026-10-30.** TASK-00 공통 TypeScript/Zod 계약과 합성 검증 코드를 로컬에서 구현했다. **실제 학생용 웹·API·CLOVA·NCP·학교 연동은 구현/승인 전**이며, 유료 호출·서비스 배포·개인자료 외부 이전은 별도 승인 대상이다. 사용자 확보 신고 도메인 `외대.온라인.한국`은 독립 서비스의 예정 주소이며, **공식 학교 SSO 미승인을 전제로 Google OAuth + 외대 메일 현재 수신권 증명 + 베타 allowlist**를 P0 출시 설계로 채택했다. DNS/TLS·Google/OTP/배포 구현은 미확인이다.

## 현재 정본과 독자

| 파일 | 목적 | 상태 |
| --- | --- | --- |
| **[Proposal.md](Proposal.md)** | **팀원·심사자용**: HUFSAbility 현안, AI 개인화·졸업 확장, 60초 시연·3주 계획·공식 심사배점·평가 설계 | 개정 완료, 제품 구현 성과 아님 |
| **[Architecture.md](Architecture.md)** | **에이전트 상세 기준**: P0·P1·P2, 24개 TopicCode, 26열 Forms 계약, 타입·API·UI·AI·학사·NCP·TASK-00~17 및 독립검증 | 기존 상세 명세를 보존하고 누락 계약 보완 |
| **[AGENTS.md](AGENTS.md)** | 안전·협업·권한 가이드 | Proposal/Architecture 역할에 맞춰 안내 갱신 |
| **[README.md](README.md)** | 두 문서의 독자와 자료·공개 경계에 대한 빠른 진입점 | 개정 완료 |

**원래 46페이지 상세 Proposal.md**는 공개 추적 제외인 `local_only/backups/pre_split_20261030/Proposal.md`에 그대로 백업했다. 현재 `Proposal.md`는 상세 구현 문서가 아니라 팀원용이며 **에이전트는 Architecture.md를 우선**한다.

## 핵심 설계와 공식 공모전 기준

- **P0 최우선:** 기존 HUFSAbility의 취업·대외활동·비교과 공고에서 **학생별 관련 공고는 큰 카드(최대 3개), 일반 목록은 작은 행(최대 6개)**으로 구분한다. 관심·직무·승인 경험과 공고를 같은 24개 분류코드로 연결한다. AI는 경험 태그·공고 조건 후보를 추출하고 **코드가 관련성·지원자격을 검증**한다.
- **P1 추가:** 개인별 공식 규칙에 따른 졸업학점·미이수·수강계획과 최대20개 과목의 제한적 개설 전망. **P2 확장:** 고급 시간표/확장 전망·공식 연계 및 전교생 확장.
- **1차 배점:** 한국외대 현안 40 / 주제의 독창성·창의성 30 / 적절한 AI 활용 30. **2차:** 구현·실현 30 / 학내 적용 30 / 파급효과 25 / 발표 15. **NCP 활용 가점:** 최대 5점. 공식 출처: https://contest.hufs.ac.kr/ (2026-10-30 확인, 운영상 변경 가능).
- **일정:** 11/06 팀 내부 합의(사용자 계획) → **11/10 1차 접수** → **11/16~12/06 본선 개발** → **12/09 본선 발표**(10분+질의응답5분). 12/02까지 실학생 데이터/규칙 미확보 시 합성 대체를 명시하고 완성 실적으로 오인하지 않는다.
- **네이버클라우드 연계:** 한국외대·NCP의 2026-03-13 MOU에 관한 2026-03-16 네이버 공식 보도를 참조한다. 학생 파일럿의 학교 채택·공식 데이터 연동·비용 승인이 이미 결정된 것은 아니다.
- **평가 수치:** 공고 25건(사용조건 확인 필요)+합성 예외 15건 = **40건 목표**, 5개 프로필×40건 = 최대 **200개 라벨 목표**. P@3 개선 **+20%p**, 조건 추출 재현율 **90%** 등은 **사전 평가 목표**일 뿐 측정 결과가 아니다.

## 도메인·로그인·공개 웹 준비 상태 (설계 확정 ≠ 운영 완료)

| 항목 | 상태 | 근거·남은 게이트 |
| --- | --- | --- |
| 도메인 `외대.온라인.한국` 확보 | **USER_REPORTED** | 2026-10-30 사용자 진술. 관리자 권한·DNS 증거는 별도 확인 |
| `https://외대.온라인.한국` DNS/TLS/실서비스 | **NOT_VERIFIED / NOT_DEPLOYED** | 인증서·도메인 일치, HTTPS, origin/직접 IP 우회 차단, NCP 연결 미검증 |
| Google OAuth + 외대 메일 현재 소유 증명 (`example@hufs.ac.kr`은 예시) | **DESIGNED / NOT_IMPLEMENTED** | 실제 Workspace `hd=hufs.ac.kr` 검증 또는 Google 계정과 결속한 외대 메일 OTP; Google OAuth/메일 발송·보안 시험 미완료. 학교 SSO 허가는 출시조건에서 제외 |
| 초기 베타 계정 인가·학생별 SharingGrant | **NOT_DEPLOYED** | Google `sub` + 학교 메일 검증 후 초대 allowlist/role, owner·공유범위/철회 401·403 E2E 필요 |
| 인터넷 공개 준비 | **BLOCKED** | DNS/TLS·Google OAuth·외대 이메일 OTP/Workspace 증빙·미인증 HTML/API/CDN·directIP/preview 접근 거부 부정시험 및 개인정보/NCP 승인 전 개통 금지 |

정본: [Architecture.md](Architecture.md) A02·A13·A14.1a·A15·A18, [CLOUD.md](CLOUD.md). GitHub Private 유지와 외부 웹 주소 사용은 별개다.

## 실제 확보한 자료와 미확정 상태

- Google Forms **구성 완료**. 실제 한국어 질문 **26열**, 응답 예시 **1건** 확인. Forms **4인 통합 내보내기 CSV**와 개별 적용 규칙 검증은 **PENDING**이며 이서연의 응답은 미제출이다. 박준영은 제출 대상이 아니다. 과목 CSV 목표는 4개이며, Private 저장소의 파일 3개는 **김채윤(사용자 확인 제출 별명 `까마르`)·심민성·이의상**의 파일로 소유자 연결이 확인됐다. **이서연 CSV는 아직 확인 전**이다. 실제 Forms 대응·학칙·팀 공유 동의는 별도 검증 대상이다. 형식 확인=학사 판정·공유 동의 완료가 아니다.
- 학생 과목은 기존 파일 이름으로 구분한 **6열 CSV**(학기·학수번호·과목명·학점·이수구분·이수상태)만 사용. 이름 포함 원본은 제한 구역에, 공개/평가/로그용 가명ID S01~S05 매핑은 별도. **이름·학번·성적이 보이는 캡처를 외부 AI로 보내지 않는다.** 과목표 영역만 분리 후 목적별 동의가 있을 때 AI 사용, 아니면 사람 전사.
- HUFSAbility 로그인 첫 화면 1장 비식별 관찰과 학교 공개 공고 연구는 존재한다. 한 화면 관찰을 전체 시스템의 기능 부재 주장으로 확대하지 않는다.
- [2026-10-29 기존 공개 조사](reference/hufsability/snapshots/2026-10-29/README.md): 원문 20건·공개 화면 5장·첫 페이지 공고 10건. [후속 수집 색인](reference/hufsability/snapshots/2026-10-29-followup/README.md): 45개 출처의 저장/재사용/실패 구분(새 공개 HTML 31, 기존 원문 11, UI 안내서 1, 형식 확인 실패 1, HTTP404 1). **자료 보관은 서비스 사용/재배포 허가를 뜻하지 않는다.**

## 확정 팀 구성과 TASK-00 준비 (2026-10-30 사용자 지시)

- **김채윤:** 추천·공지; GPT/Claude/Gemini. **박준영:** 학업·개설 전망; GPT/Claude, 실학생 CSV 제출 대상 아님. **이의상:** UI·모바일; Claude/Gemini. **이서연:** 팀 결성·기획 리드 + NCP·CLOVA/OCR/HCX/Laya Provider 전담(API는 심민성); **Gemini 사용(2026-10-30 사용자 확인)**. **심민성:** GPT, 기술 총괄·GitHub 통합·공통 계약/교차 QA 담당.
- 로컬 `C:\AIProjects\naver_competition`의 `main`은 2026-10-30 원격 커밋 `9930505`까지 fast-forward 동기화했다. TASK-00 코드는 **별도 `chore/task00-contracts-implementation` 브랜치**에서 작성했으며 main 병합 여부는 GitHub PR에서 확인한다. 사용자의 '로컬 전용 내부문서 삭제' 지시에 따라 중복·구식 인수인계 문서 **1개만** 참조 검색 후 삭제. 실제 Forms 예시·과목 CSV 로컬 백업·조사 원자료·retire는 **보호 유지**.
- **TASK-00 진행 상태:** TypeScript/Zod 공통 계약 패키지 v0.1.0, Node ESM 출력+타입선언, npm 잠금파일, 합성 Golden/Negative fixture 및 4개 자동 소비자 관점 테스트를 구현했다. **로컬 `npm run check`: 계약87/87 + 4트랙 소비 20/20 = 107/107 통과**. Private 학생 자료 미사용. GitHub Actions remote CI/4명 실제 사람 리뷰/최종 main 병합은 별도 확인 대상이다.
- 실제 학생 Forms/과목자료 통합·동의 확인·졸업 계산·NCP/CLOVA 유료 호출은 **미실행**. 다섯 데모 슬롯 중 현재 실학생 자료 대상은 최대 4명이며 남는 하나는 PENDING 또는 명시적 합성.


## GitHub 반영·Course Compass 선행 보고 검수

- **PR #1 병합:** 협업 폴더/안내 문서와 지정된 2명 수강 CSV(48/39행)를 Private 저장소에 반영. 팀원 접근/공유 동의와 공식 졸업사정 검증은 별개다. 제품 코드는 없음.
- **PR #5 병합:** `csv/이수과목_이의상.csv` 28행의 BOM 없는 UTF-8이 Private `main`에 반영됐다. 업로드/병합은 다른 사람 열람·외부 AI/NCP 전송 동의나 졸업 판정 검증이 아니다.
- **PR #2 병합:** [학업 팀원 sandbox 준비 보고](sandbox/taewangim-alt/academics-readiness.md)만 추가. Course Compass HTML/JS·Python 코드와 강의시간표 CSV는 이 저장소의 검증된 제품 모듈이 아니다.
- **팀원 보고·원자료 미확인:** 경제학부 2023-1~2026-2 317분반/37과목(일부 학년·계절학기 누락), 직전 동학기 baseline TP34·FP4·FN4. `34/38=89.5%`는 해당 표본의 precision/recall, `34/42=81.0%`는 Jaccard/IoU이지 전체 accuracy가 아니다. 단일 기간·단일 학과이며 asOf 백테스트, 원본/이용조건·동등과목·분모는 독립 검증 전이다.
- **팀원 보고 CLOVA 선행 호출:** HCX-007 3회, 숫자/과목 대조 10/10 주장에도 `※` 예외 누락 3/3. 원문·응답·호출 영수증은 본 PR에서 재현하지 않았다. HUFS One AI CLOVA live 연동/RulePack 승인 실적이 아니다. A06.8/A08.6에서 예외 역방향 검사와 사람 승인 게이트를 설계했다.
- **후속 승인 게이트:** Course Compass 소유자·자료 사용권한·asOf 독립 재현/RulePack 실제 공식검수는 학업 트랙의 별도 TASK-01/02/17이다. TASK-00은 합성 계약 구현까지 진행했지만 실제 학점 계산 9개·E2E·네 팀원 사람 리뷰·본선 제품 구현은 아직 미완료다.

## 완료한 문서·자료 검증과 실행 경계

- `tools/verify_release_boundary.py`: **82/82 통과(현재 로컬 TASK-00 브랜치)**. 추적·게시 후보의 민감 경계, 문서 링크, 공식 팔레트, TASK-00~17 작업카드 등 **정적 검사**. 예전 필수 `local_only/real5/intake_status.json` 의존을 제거해 개인 원본을 읽지 않는다.
- `reference/hufsability/snapshots/2026-10-29/tools/verify_snapshot.py`: **146/146 통과**. 기존 공개 연구 원본의 해시·크기·출처·뷰포트·문서 연결 **무결성 검사**.
- **이번 TASK-00 로컬 검증:** `npm ci --ignore-scripts`, `npm run check`의 107개 synthetic tests, Node ESM import, 정적 경계 82개를 실행했다. 별도의 공개연구 스냅샷 146개 무결성 검사는 과거 이력으로 본 작업에서 재실행하지 않았다. 이 검사들은 제품 기능·실학생 접근권한·공식 학사사정·모델 정확도 검증이 아니다.
- 실학생/원본 공고/학교 UI 규정집·스크린샷·토큰·백업·`retire/`는 추적/공개 제외. 향후 GitHub 게시 전 다시 경계 검증을 수행한다.

**다음 시점:** 2026-11-06 팀 의견 수렴·제안 채택 판단 후, 실제 제품 구현 및 자료·비용·기관협조에 관해 **사람이 에이전트와 함께** 별도 결정한다.

## 2026-10-31 새 설계 PR: 신뢰형 포스터·Temporal RAG·Laya (구현/배포 전)

- **아키텍처 제안:** `High Memory-g3` Linux 4vCPU·32GB + 별도 CB 50GB에서 API+PostgreSQL 검색+제한 OCR 수집 워커+**Laya multilingual 322M CPU** 비동기 판단기를 검토. CPU RSS/한국어 분류/latency 실측 실패 시 Laya off, GPU/추가 서버 자동 증설 없음.
- **멀티모달:** 권리 확인 공식 이미지·PDF의 General OCR 좌표/원본 hash 기본, 복잡한 경우 **HCX-005 Vision** 후보 보완, HCX-007 구조화 추출+독립 검증. 실제 live 호출/성과 **0건**, 아직 사용 승인 없음.
- **시의성 RAG:** 게시·수집·마지막 검수·적용기간, 정정/취소/연장 sourceRevision을 불변 보관하고 `asOf`/권한 선필터 검색. 변경 시 인덱스·후속 캐시 무효화. 실제 코어/DB 구축은 미완료.
- **신규 계약 대상:** `SourceSpan IMAGE`·`SourceRevision`·`VerifiedClaim`·`RetrievalEnvelope`·`DecisionAdvice`는 별도 Zod contracts PR/4트랙 리뷰 후 구현. 기존 #17은 문서 설계였으며 #26은 REVIEWER API 코드를 별도 수정한다. #15/#16의 추천·공지 코드는 수정하지 않는다.
- **공모전 예산:** 본선팀 **별도 개발비 50만원 + NCP 크레딧 50만원 상당**; 지급·클라우드 적용·VAT/실청구 미확인, **유료 리소스 배포 없음**. 상세 기준: `docs/TRUSTED_RAG_MEDIA_VERSIONING.md`.

## 2026-10-31 심사자 기간제 초대·합성 시연 로컬 구현 (#25)

- **구현·실행 경계:** 기존 API PR #24를 기반으로 `REVIEWER` 분리 인증/기간제 초대 등록·반복 로그인, 독립 합성 시연 GET, 매 요청 DB grant·revoke 확인을 로컬 코드/테스트로 추가했다. 등록 코드는 32바이트 보안 난수, 실제 Git에는 digest만 저장하는 설계. PostgreSQL SQL migration과 adapter는 **작성**했지만 **실제 Google OIDC·학교 담당자 인증·실 DB 연결/개통/발송은 미실행**이다.
- **초대장 PDF:** `reference/reviewer/ReviewerInvitation.TEMPLATE.pdf`는 비활성 제출용 양식이다. 공용 심사 접속 기간·활성 코드가 담긴 초대는 아직 만들지 않았고, GitHub 저장소에도 올리지 않는다.
- **접근 정책:** 공용 초대 등록 후 각 Google 계정에 귀속·신규 등록 인원 상한/기간 내 재로그인 횟수 무제한(코드 추측 제한), `endsAt` UTC 서버 자동 종료·철회. S01~S05의 **기존 시연 API와 합성 체험 액션·MOCK AI**는 허용하지만 실학생 원장/외부 실제 신청·NCP 유료 호출 차단. 실제 전체 UI 및 OIDC/DB 연결은 미완료.
- **남은 작업:** 실제 OIDC+메일 증빙·영속 세션/DB·UI 등록·프런트 만료·브라우저 캐시/CDN/직접IP 보안 E2E·심사기간 확인·공용 초대 링크 제출. 정본 `docs/REVIEWER_ACCESS.md`, 담당 Issue #25. **이 설계가 병합되어도 사이트 접속 가능이라고 표기하지 않는다.**

## 2026-10-31 Laya CPU spike 대응 문서 개정 (실행 전)

- 단일 High Memory-g3 4vCPU·32GB의 API 보호를 위해 [Laya CPU 방어 설계](docs/LAYA_CPU_SPIKE_PROTECTION.md)를 추가. **CPUQuota=100%→1vCPU**, ORT single-thread/no-spin, 별도 worker+cgroup, `MemoryMax=3072M`, 큐 16개, 검증캐시 우선, 20초 추론 timeout, host CPU/pressure·API p95·RAM 기준 PAUSE/OFF 및 확정 규칙 fallback을 정의했다.
- 작은 시연 데이터에서 **파인튜닝은 제외**, Laya ON/OFF 품질/시스템 부하 비교 후 의미 없으면 꺼둔다. 심사자 반복 열람은 worker를 유발하지 않는다.
- **NCP 실서버/모델 실행·cpu.max/실측·예산 적용은 0건**: 수치는 운영 시작값과 통과 목표이며 검증된 성능이 아니다. 이슈 [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22) 후속 실측/별도 승인 필요.

## 2026-10-31 최신 역할·공용 REVIEWER 검증 (PR #26 갱신 작업)

- **정식 소유:** 심민성([API #27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27))은 웹·외부 HTTP API/인증/일반 DB·SourceRevision/Temporal RAG의 provider-neutral DTO/권한/검증만. 이서연([NCP #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [OCR/Vision #20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [Laya #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22))은 **NCP/CLOVA/OCR/HCX/Laya SDK·실제 호출·worker·서버·비용 원장/계정·운영 전부**. 이서연의 GitHub ID 미확인으로 assignee 없음. UI 이슈 #9의 현 assignee는 `uisang2004-maker`로 확인하고 PR #24/#26 리뷰 요청을 교체함; 다른 팀원 #10/#11 배정 유지.
- **심사자 기능 변경:** 이메일 사전등록 없는 공용 초대, 개인 Google 계정별 원자적 등록(최대 기본 20명), 기간 중 무제한 재접속, 종료·철회 즉시 403. UI 시연 API/5개 합성 슬롯·모의 북마크/경험/지원 및 4개 MOCK AI 호출은 허용; 실제 학생 자료·외부 제출·유료 NCP 호출은 불허. **Google OIDC 실 구현/DB 연결/프런트 UI 실제 동작은 미완료**.
- **로컬 검증:** npm run check는 **141/141 PASS**(contracts 87, consumers 20, API 34), npm run build:api PASS, npm run check:privacy **109/109 PASS**(제안서 PDF 제거 이후 테스트). 원격 GitHub Actions/실서비스 인증·PG·NCP 부하 검증은 별도 게이트.
- **문서 산출물:** `Proposal.md`만 제안서 정본으로 유지하며 더 이상 제안서 PDF 자동 출력을 수행하지 않음. 공용 심사 초대장 `reference/reviewer/ReviewerInvitation.TEMPLATE.pdf`(A4 1쪽·비활성)만 유지. 10/29의 공식자료 무결성 검증 스냅샷은 과거 시점의 역사 자료로 변경하지 않음.
- **NCP 가격/기간(공식 확인):** KR VPC Linux High Memory-g3 **4vCPU/32GB 326원/h** + CB 50GB **0.16원/GB·h**. 11/6~12/9 816h 최대 서버+CB 272,544원, 공인 IP 포함 277,113.6원(VAT/egress/CLOVA/OCR 제외). 공식 본선 진출팀 발표 **11/16**, 실제 개통/비용은 선정·크레딧·사용자 승인 후. 세부 [예산 정본](docs/NCP_OPERATIONS_2026.md).

## 2026-10-31 신규 PR #31 — 실사용 게이트 명시

- 기존 [PR #24](https://github.com/ot4562-glitch/HUFS-One-AI/pull/24)가 먼저 main에 병합, 원본 #26의 코드는 [복구 PR #30](https://github.com/ot4562-glitch/HUFS-One-AI/pull/30)으로 이후 반영됨. 이전의 'stacked PR 대기' 문구는 과거 기록.
- REVIEWER는 합성 전용 모든 학생 탭 및 관심·직무·검색·수강계획·알림 설정·기존 북마크/경험/가상 지원의 API 액션을 제공하나 실제 React 화면/Google 로그인/영속 DB E2E는 **미완료**. '실제 홈페이지 전체 기능 접속 완료'로 보고 금지.
- [PR #31](https://github.com/ot4562-glitch/HUFS-One-AI/pull/31)에서 CI에 core·web 새 테스트를 포함하고 root 설정 union을 선반영함. 기존 #15 추천→#16 공지 순서는 유지, 각 PR 코드/리뷰/테스트 결과는 별도 승인 전 병합하지 않음.
