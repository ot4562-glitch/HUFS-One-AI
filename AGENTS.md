# HUFS One AI | 에이전트 작업 기준

> **2026-10-31 최종 운영·역할 정본:** [NCP 단가·816h/576h 계산](docs/NCP_OPERATIONS_2026.md) · High Memory-g3 Linux VPC 4vCPU/32GB 326원/h, CB 50GB 8원/h; 11/6~12/9 전체 816h 비용 상한이고 실제 VM 개통은 공식 11/16 본선 진출·크레딧·사용자 승인 이후. 심민성은 웹/API·인증·일반 DB·RAG, 이서연은 NCP·CLOVA/OCR/HCX/Laya/provider SDK/모델·클라우드 운용 전담. 독립 UI·추천·학업 소유 불변.

> **2026-10-31 최신 담당/서버 계약 (GitHub 이슈 확인):** 심민성([API #27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27))은 `apps/api`·인증/DB/SourceRevision/RAG/OCR/provider-neutral AI 입력·결과 API 검증 **코드 전담**. 이서연([NCP #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12))은 NCP·CLOVA·OCR/Vision·Laya **클라우드 환경·provider SDK/연동·비용/worker 구현 전담** 담당. 이의상(UI #9)·김채윤(추천/공지 #10)·박준영(학업 #11)의 이슈 담당은 변경하지 않았다. 서버는 한국 리전 **High Memory-g3 VPC 4 vCPU/32GB + 별도 CB 50GB**(미개통); 11/6~12/9은 비용 상한 기간이며 [공식 공고](https://job.hufs.ac.kr/job/imng/icmpNsbjtPgm/findIcmpNsbjtPgmInfo.do?encSddpbSeq=1006089)상 본선 발표 11/16 이후 크레딧 확인 전 개통 금지. 심사자는 이메일 사전등록 없는 **공용 초대장**으로 검증된 Google 계정을 등록해 기간 내 전체 **합성 시연 기능**을 체험하며 실제 학생/외부 전송은 차단. 제안서는 `Proposal.md`만 유지.


상위 C:\AIProjects\AGENTS.md와 사용자 최신 지시를 따른다. **README.md → Architecture.md(A0~A3) → STATUS.md**를 먼저 읽는다. `Proposal.md`는 팀원·심사자용 가치·범위·평가 메시지이며, **스키마·화면·알고리즘·API·시연·검증·에이전트 작업의 단일 계약은 `Architecture.md`**다.

## 제품과 실행 단계

- **첫 목표는 HUFSAbility의 기존 취업·진로·비교과·대외활동 정보를 학생의 관심과 승인 경험에 맞춰 개인별로 다르게 노출하는 것**이다. 관련 공고는 큰 상단 카드, 일반 공고는 작은 목록으로 표시하며 AI가 경험·공고를 해석하고 코드는 관련성·자격·노출등급을 검증한다. **졸업요건·미이수 과목·수강계획은 그 위에 더하는 별도 졸업지원 영역**이다. 실제 과목·Forms 제공자 최대 4명의 서로 다른 규칙을 공통 코어로 계산하되 학생별 결과를 하드코딩하지 않는다. 다섯 번째 데모 슬롯은 PENDING/합성으로 구분한다.
- ‘나의 경험’은 방학·학기 중 교외활동을 제목·한줄설명부터 기록하고 필요할 때 역할·기간·성과·근거URL을 보완하는 취업준비 기능이다. ‘방학을 채워보세요’는 방학 기간의 보조 안내일 뿐 일기장·스티커 앱·일별 작성 의무는 만들지 않는다. 기록 저장은 AI 호출 없이 동작하고 선택한 경험에만 동의 후 태그 후보를 제안한다. 학생 승인·동의·기록버전과 파생 추천을 연결한다.
- 제품 본선 개발은 아직 승인·구현 전이지만, 사용자가 **TASK-00 공통 계약 구현·합성 테스트와 독립 개발 준비를 명시 요청**하여 이 계약 패키지는 별도 PR에서 작성한다. **사용자가 비공개 GitHub 저장소 생성과 현재 프로젝트의 안전한 첫 커밋·푸시를 명시적으로 승인했다.** 이는 유료 NCP 자원·CLOVA 호출·대외 공개 전환을 승인한 것이 아니다.
- 디자인은 `Architecture.md` §3.4의 공식 HUFS 주색 청록/회색·부색 남색/금색/은색과 심벌 규정을 우선한다. Architecture.md §9의 제품 화면/접근성 기준과 공식 브랜드 규정을 구분하고 예전 파랑·보라 임의 팔레트는 사용하지 않는다. 사용자 제공 로그인 캡처는 한 화면 관찰일 뿐 전체 서비스 실사로 과장하지 않는다.

## 개발·협업

- React/TypeScript/Vite 웹, Node/Fastify API, PostgreSQL, 순수 TypeScript 공용 코어·contracts를 계획한다. AI는 **경험 태그·공고 숨은 조건·졸업설명·개인별 학업/진로 행동 브리프** 네 작업을 맡으며, 학점·지원자격·마감·계획 계산은 코드가 수행한다. `Architecture.md` A1·§12.3~12.5를 계약으로 삼고 **학생 관심과 공고를 함께 매칭하는 24개 TopicCode**를 코어/AI/화면에서 동일하게 검증한다.
- 실제취득/현재수강/계획학점을 분리하고 고유총학점과 전공별 중복인정을 별도 검사한다. 적용하지 못한 전체 졸업요건을 충족한 것처럼 표현하지 않는다.
- Architecture.md §14 **TASK-00~TASK-17**는 **다중 에이전트가 수행·교차검토·완료 체크하는 목록**이다. 담당 구현/독립검증/통합 에이전트가 증거로 체크하고 사용자가 직접 점검할 일로 배정하지 않는다. 각 카드의 수행자·검토자·읽을 절을 따른다.
- 병렬 에이전트는 GitHub Private/브랜치/worktree/포트/시험DB/namespace를 분리한다. **docs/WORKSTREAMS.md의 5개 트랙과 docs/CONTRACT_BOUNDARIES.md의 공용 계약 경계를 먼저 확인한다.** 이슈에 경로 소유권·입출력 계약·검사를 적고 공용contracts/lockfile/migration은 통합 에이전트가 조정한다. GitHub 보호기능의 private 플랜 지원을 확인한다.
- 사람은 역할별 코딩 담당이 아니라 **Architecture.md §15에서 에이전트와 함께** 근거·대안·위험을 검토하고 결정한다. 에이전트가 조사·코드·검사·운영안·허가요청 초안을 준비할 수 있으나 당사자 동의·기관 허가·결제/자격증명·공개 승인 자체를 대신 만들지 않는다.
- 시간·클릭을 재는 별도 5인 사용성 실험을 필수 작업으로 배정하지 않는다. 기능·학점·권한·비용·접근성·시연 완주를 자동시험과 독립 에이전트 검토로 검증한다.

## 본선 시연과 신뢰성

- 본선은 **같은 HUFSAbility 공고 묶음 → 학생별 관심·경험 → 큰 맞춤 카드/작은 일반 목록 차이 → AI 공고 조건·행동 브리프 → 별도 졸업지원의 학점·수강계획 → NCP/오프라인** 순서로 시연한다. Architecture.md A3.3·§8·§12.8의 3주 병렬 계획으로 검증한다.
- main demo는 **5개 전환 슬롯을 유지**하지만 실제 Forms/과목 CSV 제출자는 **김채윤·이의상·심민성·이서연 4명**이다. **박준영은 제출 대상이 아니다.** 다섯째 슬롯은 허위 실자료를 채우지 않고 PENDING/명시적 SYNTHETIC으로 처리한다. 실제 학생별 목적 동의·규칙 독립 검증 없이 공유 승인으로 표시하지 않는다. 공개 개발·CI는 별도 합성 회귀팩을 쓴다.
- 성공 상태 강제변경·실패숨김·가짜 live 호출은 금지한다. 근거·시연합성·실시간/검증캐시/replay·현재/계획 상태를 정확하게 표시한다.

## 자료·접근·비용

- **사용자 확보 신고 도메인:** `외대.온라인.한국` (예정 origin `https://외대.온라인.한국`). 학교 공식 SSO/IdP 허가는 없을 것으로 예상하여 **독립 Google OAuth + 현재 외대 이메일 소유 확인(검증된 Google Workspace `hd=hufs.ac.kr` 또는 외대 메일 OTP) + 초기 베타 승인**을 P0 보안 게이트로 사용한다. Google `email_verified`/이메일 접미사만으로 통과시키지 않는다. 미인증 화면/API/CDN/storage/직접IP/preview는 기본 차단한다. DNS·TLS·Google OAuth·메일 발송/검증·부정시험은 아직 미구현이며, 모두 완료 전 개통 금지. GitHub Private 유지. 정본 Architecture A14.1a/CLOUD.md.
- 공식 학교 운영·자료 협조·SSO 허가는 확인되지 않았다. 이 때문에 공식 SSO는 **P0 출시 의존성에서 제외**하고 향후 기관 제휴 시에만 검토한다. Google OAuth 및 외대 메일 OTP는 기관 인증을 사칭하지 않는 독립 서비스 절차다. 개인 기록은 목적별 동의·제한된 저장이 필요하며 연구 원본/승인되지 않은 학생자료는 공개 CI·정적번들에서 제외한다.
- **Google Forms는 구성 완료.** 실제 응답 CSV 원본을 그대로 읽고, 각 팀원은 본인이 캡처한 **이수완료·현재수강 과목만 6열 CSV**로 작성·검수한다. 학생 식별은 CSV 파일명과 Forms 표시이름을 대조한다. 사용자 예시 1건만 확인됐고 최종 통합 Forms는 박준영을 제외한 실제 제출자 4명을 기준으로 검증한다(이서연 미제출). 입력 계약은 Architecture.md A3.1·§5.2.1과 `templates/real5-intake/`다. 내부 표시이름은 실명 또는 별명을 선택할 수 있으나 로컬 제한 저장한다. 과목별 성적/GPA·석차·전체 학번·원본 성적증명서·로그인정보는 수집하지 않는다. 외부 AI·Google/Drive·NCP·팀검토·발표 공개는 각각 목적별 범위를 안내한다.
- 온라인은 HTTPS + Google OAuth 검증 + 외대 메일 현재 소유 증명 + 초기 베타 allowlist/role 인가 구조다. 학교 공식 비밀번호를 직접 받지 않으며 익명 앱 HTML/JS·API/CDN/스토리지·직접IP/preview, 내부 DB 직접 공개를 차단한다. 서버만 AI키에 접근, 원자적 quota·예산예약·kill switch. 모델 사용 한도는 가격/정책 확인과 별도 승인 후 적용한다.

## 문서 관리

현재 옳은 내용과 설계만 정리하고 개정영수증을 누적하지 않는다. **Proposal.md는 팀·심사자용, Architecture.md는 에이전트 상세 계약**이며 PROJECT/CLOUD/REPORT는 중복 설명보다 정확한 파일·절 참조를 유지한다. 자료·키·retire를 임의 변경하지 않는다. 사용자 승인으로 정리한 시안은 프로포절의 디자인 계약에 통합해 관리한다. shared 파일 수정에는 SHA-256 충돌검사를 적용한다. 작업 완료는 실제 검사/파일 존재로 확인하고 구현 전 계획을 실적으로 표현하지 않는다.

## GitHub 게시 준비

- **파일별 지시의 좁은 예외:** 기존 두 과목 CSV 외에 2026-10-30 사용자가 지정한 `csv/이수과목_이의상.csv` 한 파일을 별도 Private PR에 추가한다. 다른 학생 파일·Google Forms 원본·성적은 제외하며, 외부 AI·NCP·공개 배포·타 팀원 실자료 열람은 계속 별도 당사자 동의 및 이용범위 확인 대상이다. docs/DATA_GOVERNANCE.md를 따른다.

프로젝트를 하나의 저장소로 관리하되 `.gitignore`와 `.dockerignore`를 우회하지 않는다. `local_only/`, `templates/real5-intake/*.csv`(실제 사용자 Google Forms 예시 포함), `HUFS_UI.pdf`, 승인되지 않은 실제 학생 자료, 원본/개인 화면, 수집 원문, 로그/DB/키, `retire/`는 로컬 보존 전용이다. 업로드 전 `tools/verify_release_boundary.py`로 추적 후보와 이미 추적된 파일을 검사한다. **초기 Private 저장소 생성·commit·push는 2026-10-30 사용자 최신 지시로 승인됐으며**, 추후 **GitHub 저장소 public 전환**, 실학생 데이터의 NCP 이전·외부 AI 처리, 유료 서비스 및 실제 도메인 개통은 각각 별도 자료권한·기관/운영 승인과 출시 검증 대상이다. 현재는 공개 웹 **설계 결정**만 갱신한다.

## 2026-10-31 신뢰형 RAG·멀티모달·Laya 설계 분리

**신규 정본:** `docs/TRUSTED_RAG_MEDIA_VERSIONING.md`는 NCP High Memory-g3 4vCPU·32GB, Laya multilingual 322M CPU(선택 비동기), General OCR + 조건부 HCX-005 Vision, HCX-007, 시간·권한 기반 PostgreSQL RAG/SourceRevision의 새 **설계 계약**이다. 기존 AI 네 작업과 개인정보/인증·CLOVA 정책을 유지한다. 후속 contracts Zod·DB·API 변경은 기술 총괄 심민성 전용 PR과 소비자 리뷰 후에만 병합한다. 검증/요금/권리/CPU RSS/클라우드 크레딧 확인 및 명시적 승인 전에는 모델 다운로드·NCP 생성·유료 호출·개통 금지. 설계 변경과 코드 구현 완료를 혼동하지 않는다.

## 2026-10-31 RAG·OCR/Vision·Laya 운영 이슈 추적 (개발 에이전트 필독)
- **매 세션 최신 GitHub 이슈부터 확인:** [통합 EPIC #23](https://github.com/ot4562-glitch/HUFS-One-AI/issues/23), 본인 담당 이슈 **심민성 #8/#18, 이의상 #9, 김채윤 #10, 박준영 #11, 이서연 #12 및 #19~#22**, 설계 [PR #17](https://github.com/ot4562-glitch/HUFS-One-AI/pull/17). 이 번호들은 작업 추적이며 자동 실행·구현 완료가 아니다.
- **의존 순서:** #17 설계 리뷰 → #18 공통 계약/소비자 승인 → #19 출처 버전·권한 수집 → #20 General OCR·조건부 HCX-005 → #21 asOf·권한 기반 RAG/근거검증 → #22 Laya CPU High Memory-g3 자원·비용 실측(실제 과금/모델 다운로드/배포는 추가 승인). UI/추천/학업은 각 소유 이슈를 합성 테스트와 연결한다.
- **먼저 남은 코드 차단 해결:** 추천 [PR #15](https://github.com/ot4562-glitch/HUFS-One-AI/pull/15), 중요공지 [PR #16](https://github.com/ot4562-glitch/HUFS-One-AI/pull/16)는 독립 변경요청이 남아 있으므로 해소+리뷰 전 병합 금지. #16은 #15 기반이므로 병합 순서를 지킨다.
- 이슈 체크는 **합격한 CI만이 아니라 변경 PR·재현 테스트·권한·출처 라이선스·비용·모델 RSS/latency·실제 독립 리뷰/미실행 항목**을 기록한 뒤 수행한다. 모델 confidence/JSON을 자격·학칙·마감 확정으로 사용하지 않는다. 자동 배포·main 병합 금지.

## REVIEWER 초대·심사 자동 종료 새 계약 (#25)

심사자는 팀원 5명이 아니며 별도 `REVIEWER`로 **합성 전용 시연**을 허용한다. 인증은 Google OIDC의 verified `sub`/이메일 소유 증거 + 비공개 개인 초대 코드 결속이며, `startsAt<=now<endsAt`·revoke를 **매 요청 서버/영속 DB에서 검사**한다. 최초 등록 뒤 같은 계정의 반복 로그인·열람 횟수는 제한하지 않되 코드 추측·과금 등은 제한한다. 초대 PDF 실코드·심사자 이메일·원본 학생자료를 Git/PR/CI에 게시하면 안 된다. 현재 실제 OAuth·UI·DB·도메인·NCP 미구현, `reference/reviewer` PDF는 **비활성 TEMPLATE**. 원문: `docs/REVIEWER_ACCESS.md`, 작업 이슈 [#25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25), 기본 API [#24](https://github.com/ot4562-glitch/HUFS-One-AI/pull/24).

## 2026-10-31 Laya CPU 스파이크 격리 (High Memory-g3 4vCPU/32GiB)
Laya는 **기본 OFF**이고 Fastify/PG의 동기 경로에서 실행·모델 warm-up 금지. 승인 후 별도 cgroup worker(동시 실행 1, 큐 최대16)에서 `CPUQuota=100%`=**1vCPU**(4vCPU 전체의 25% CPU 시간 상한), ORT intra/inter thread=1/spin OFF, `MemoryMax=3072M` 초기 제한을 검증한다. host CPU/pressure·API p95/RAM 악화 시 PAUSE/OFF·검증 규칙 fallback; GPU/VM 자동 증설/즉시 HCX 우회·파인튜닝 금지. 상세 게이트·측정 전 가설: [docs/LAYA_CPU_SPIKE_PROTECTION.md](docs/LAYA_CPU_SPIKE_PROTECTION.md), [Issue #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22). **NCP 실측/설치/프로세스 시작은 이 PR에 포함되지 않는다.**
