# HUFS One AI | 제품·화면 기준 안내

> **2026-10-31 최종 운영·역할 정본:** [NCP 단가·816h/576h 계산](${link}) · High Memory-g3 Linux VPC 4vCPU/32GB 326원/h, CB 50GB 8원/h; 11/6~12/9 전체 816h 비용 상한이고 실제 VM 개통은 공식 11/16 본선 진출·크레딧·사용자 승인 이후. 심민성은 웹/API·인증·일반 DB·RAG, 이서연은 NCP·CLOVA/OCR/HCX/Laya/provider SDK/모델·클라우드 운용 전담. 독립 UI·추천·학업 소유 불변.

> **2026-10-31 최신 담당/서버 계약:** API·인증·DB·SourceRevision/RAG 및 provider-neutral API 결과 검증 코드는 **심민성 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)** 전담. **이서연 [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)**은 NCP·CLOVA·OCR/Vision·Laya 클라우드 **환경 준비만** 담당. UI 이의상 #9·추천/공지 김채윤 #10·학사 박준영 #11 담당 변경 없음. NCP 설계는 **High Memory-g3 Linux 4vCPU·32GB + 별도 50GB CB**, 11/6~12/9은 최대 예산 가정이며 [공식 학교 공고](https://job.hufs.ac.kr/job/imng/icmpNsbjtPgm/findIcmpNsbjtPgmInfo.do?encSddpbSeq=1006089)상 본선 발표 11/16 및 크레딧 발급 이후에만 개통. 공용 심사 초대장은 이메일 사전등록 불필요, 합성 전체 시연, 기간 내 반복 접속; 실학생 자료/유료 호출 차단. `Proposal.md`만 제안서 정본.


**팀/심사자용 제안은 [Proposal.md](Proposal.md), 구현 상세 기준은 [Architecture.md](Architecture.md)다.** **첫 목표는 기존 HUFSAbility의 취업·역량·비교과·채용 정보에서 학생별로 관련성 높은 내용을 더 크게·먼저 보이게 하는 AI 개인화**이며, **졸업요건 점검·수강계획은 그 위에 더하는 기능**이다.

## 현재 확정 방향

공식 HUFS UI 색상·심벌 안내가 디자인의 우선 근거다(Architecture.md §3.4). 사용자 제공 인덱스의 개인현황·역량·배지·분야별 공고·공식 바로가기는 기존 자산으로 인정한다(§2.6). **동일 화면에서 유사하게 배치된 취업·비교과 영역을 학생별 중요도에 따라 상위 큰 카드와 작은 일반 목록으로 재구성**한다. 졸업지원은 독립된 주요 탭으로 추가하며, 한 화면만으로 기존 전체 기능의 부재를 단정하지 않는다.

주시연은 **구성 완료된 Google Forms 양식의 승인된 응답**과 본인이 검수한 **6열 이수과목 CSV** 및 공식 한국외대 규칙팩을 결합한다(Architecture.md A03·A08). 실제 응답 예시 1건이 확인됐고, 자료 제출 대상 4명 중 과목 CSV 3명 소유자는 확인됐다. 최종 Forms 통합본/나머지 학생 자료·동의·규칙 검수는 미완료다. 합성팩은 공개 개발·정상/예외 회귀시험용으로 별도 유지한다. 학점·현재수강·계획을 분리하고, 미충족·미확인을 올바르게 보여주는 것도 정상 결과다.

**접속 경계:** 사용자 확보 신고 도메인 `외대.온라인.한국`은 독립 팀 웹의 예정 주소다. **Google OAuth + 외대 메일 현재 수신권 확인(검증된 Workspace `hd` 또는 이메일 OTP) + 베타 초대 승인**이 있어야 UI/API에 진입한다. 공식 학교 SSO 허가는 기대하지 않으며 로그인에 학교 비밀번호를 받지 않는다. Google 로그인/Gmail만으로는 열리지 않는다. DNS·Google/OTP·배포는 미구현이고 학교 공식 서비스로 표시하지 않는다. [Architecture.md](Architecture.md) A14.1a · [CLOUD.md](CLOUD.md).

## 읽을 절

**Architecture.md** A0~A3의 P0/P1 우선순위·공고/관심 공통 분류코드·실제 Forms 헤더부터 읽고, §6~7 경험·추천, §9 화면, §10~11 코어/API/DB, §12 AI/운영, §14 TASK 실행·체크, §15 공동 결정, §16 검증을 따른다.

React/TypeScript/Vite·Node/Fastify·PostgreSQL은 기존 설계를 유지한다. 실제 제품 코드·연동·디자인 렌더링은 채택 후 실행 승인 범위에서 진행한다. 현재 변경은 문서·자료·게시 준비이며 구현 완료가 아니다.

## 신규 차별화: 포스터도 읽고 바뀐 공고를 확인하는 HUFS One AI

기존 학생별 맞춤 피드·중요공지·졸업지원 우선순위를 유지하면서 **사진형 포스터·첨부 PDF까지 인식하는 OCR → 조건부 HCX-005 Vision → 공식 출처의 시간 기반 RAG → HCX-007 인용 추출 → 독립 코드 검증**을 설계했다. **Laya multilingual 322M**은 NCP High Memory-g3 CPU의 비동기 분류/검수 후보(사용자 자격판정 아님)로만 사용한다. 취소·연장·정정에 따라 인덱스와 캐시가 변하며, 조회 화면에서 출처·확인 시각·근거 이미지를 보여주는 것을 목표로 한다. 모두 **구현 전 설계**, 예산 승인은 별도다. 정본: `Architecture.md` 및 `docs/TRUSTED_RAG_MEDIA_VERSIONING.md`.
