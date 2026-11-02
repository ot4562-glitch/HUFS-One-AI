# HUFS One AI | 제품·화면 기준 안내

**2026-11-02 서비스 목표 재정의:** **HUFS One AI는 HUFSAbility를 대체한다고 주장하는 별도 대학 포털이 아니라 기존 HUFSAbility를 존중·개인화하는 제품명**이다. 기존 메뉴·하위 기능은 [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)의 정보구조에 나타내고 동작하지 않는 기능에는 **🚫 미지원/검증 전** 표시를 유지한다. 모든 기능 이식·공식 학교 운영/SSO를 주장하지 않는다. 추가 [#123](https://github.com/ot4562-glitch/HUFS-One-AI/issues/123) 동아리 모집은 **가상 동아리/포스터/추천만 합성 데모**로 제안한다.

**2026-11-02 실제 진척:** #122 정정 회귀 main **bb5b76d**, #72 캘린더 UI/API 연결 main **717ce979**. #73 REVIEWER 초대·#125 동아리 코어 CHANGES_REQUESTED, #74 졸업·#75 합성 sandbox·#117 추천 제외 코어 APPROVED(선행 차단 후 병합 가능), #76 E2E COMMENT, #120 계약 enum 불일치·#121 API 미병합. 열린 PR **8/Issue 30**. 개인정보 #46 검사 2 FAIL·출시 #89 RELEASE_BLOCKED 유지. [STATUS](STATUS.md)·[역할](docs/WORKSTREAMS.md).

**2026-11-01 후속 코드·검수 상태:** 권한 정책 버전 캐시 무효화 [#118](https://github.com/ot4562-glitch/HUFS-One-AI/pull/118)은 독립 승인·Actions 성공 후 main **`fdf0b09b`** 병합. 추천 제외 사유 [#117](https://github.com/ot4562-glitch/HUFS-One-AI/pull/117)은 CHANGES_REQUESTED; 정정 비교/설명 계약 [#120](https://github.com/ot4562-glitch/HUFS-One-AI/pull/120)→권한 있는 API·owner 클라이언트 [#121](https://github.com/ot4562-glitch/HUFS-One-AI/pull/121)은 작성자 COMMENT+비작성자 승인 요청 단계로 미병합. UI #72~#76 차단 유지. **열린 PR 8·Issue 28**, #46 Privacy 2 FAIL·#89 `RELEASE_BLOCKED`. 합성 코드 수락/운영 서비스 수락을 구분한다. [STATUS](STATUS.md).

**2026-11-01 구현/리뷰 상태:** #83 플랫폼과 #116 학업 응답 계약 등은 main의 **합성/일회용 DB 검증된 코드 단계**이고, #72→#76 UI 스택은 최신 HEAD 리뷰 5건 후에도 미병합(0건), #72/#75 변경 요청 차단 상태다. 실제 기관/학생 자료·외대 메일/OIDC·NCP/HTTPS 검증은 미완료이며 공개 웹은 `RELEASE_BLOCKED`. [STATUS](STATUS.md)와 [PR_WORKFLOW](docs/PR_WORKFLOW.md) 우선.

> **2026-10-31 최종 운영·역할 정본:** [NCP 단가·816h/576h 계산](docs/NCP_OPERATIONS_2026.md) · High Memory-g3 Linux VPC 4vCPU/32GB 326원/h, CB 50GB 8원/h; 11/6~12/9 전체 816h 비용 상한이고 실제 VM 개통은 공식 11/16 본선 진출·크레딧·사용자 승인 이후. 심민성은 웹/API·인증·일반 DB·RAG, 이서연은 NCP·CLOVA/OCR/HCX/Laya/provider SDK/모델·클라우드 운용 전담. 독립 UI·추천·학업 소유 불변.


**팀/심사자용 제안은 [Proposal.md](Proposal.md), 구현 상세 기준은 [Architecture.md](Architecture.md)다.** **첫 목표는 기존 HUFSAbility의 취업·역량·비교과·채용 정보에서 학생별로 관련성 높은 내용을 더 크게·먼저 보이게 하는 AI 개인화**이며, **졸업요건 점검·수강계획은 그 위에 더하는 기능**이다.

## 현재 확정 방향

공식 HUFS UI 색상·심벌 안내가 디자인의 우선 근거다(Architecture.md §3.4). 사용자 제공 인덱스의 개인현황·역량·배지·분야별 공고·공식 바로가기는 기존 자산으로 인정한다(§2.6). **동일 화면에서 유사하게 배치된 취업·비교과 영역을 학생별 중요도에 따라 상위 큰 카드와 작은 일반 목록으로 재구성**한다. 졸업지원은 독립된 주요 탭으로 추가하며, 한 화면만으로 기존 전체 기능의 부재를 단정하지 않는다.

주시연은 **구성 완료된 Google Forms 양식의 승인된 응답**과 본인이 검수한 **6열 이수과목 CSV** 및 공식 한국외대 규칙팩을 결합한다(Architecture.md A03·A08). 2026-10-31 Private main에서 수강 CSV 4개(6열)와 Forms 통합본 1개(26열/4응답) 형식을 확인했다. 이는 **원본 게시·팀 공유·외부 처리 동의/학생 대응 검증을 의미하지 않으며**, 해당 동의와 공식 RulePack 검수는 미완료다. 합성팩은 공개 개발·정상/예외 회귀시험용으로 별도 유지한다. 학점·현재수강·계획을 분리하고, 미충족·미확인을 올바르게 보여주는 것도 정상 결과다.

**접속 경계:** 사용자 확보 신고 도메인 `외대.온라인.한국`은 독립 팀 웹의 예정 주소다. **Google OAuth + 외대 메일 현재 수신권 확인(검증된 Workspace `hd` 또는 이메일 OTP) + 베타 초대 승인**이 있어야 UI/API에 진입한다. 공식 학교 SSO 허가는 기대하지 않으며 로그인에 학교 비밀번호를 받지 않는다. Google 로그인/Gmail만으로는 열리지 않는다. DNS·Google/OTP·배포는 미구현이고 학교 공식 서비스로 표시하지 않는다. [Architecture.md](Architecture.md) A14.1a · [CLOUD.md](CLOUD.md).

## 신규 홈 기능: 개인별 '내 주요 일정' 미니 캘린더

**2026-10-31 계획 추가:** 오늘 화면 하단에 시험·학사 서류 제출일, 모집 지원마감 및 행사일을 **학생별로** 표시하는 작은 달력을 추가한다. 실제 학생 마감과 학과 내부 행정 보고일을 혼동하지 않는다. 상시/마감 미정은 달력 밖 별도 목록, 학사정보 미공유·적용 여부 UNKNOWN은 '적용 확인 필요'로 안내한다. 360px 모바일·키보드/스크린리더, 색 외 텍스트/아이콘, 시연 5개 대상 변경·철회 시 화면 초기화가 필요하다. **계산 #50·계약 #53·인증 calendar GET #58·브라우저 API #77·snapshot race 방어 #95는 main 병합**됐다. 하지만 [#72 UI 위젯 PR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72)은 비합성 서비스 포트 연결·snapshot 버전 갱신 잔상 문제로 CHANGES_REQUESTED, HEAD CI/선행 스택 병합 전이며, [#51 UI 이슈](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51)는 OPEN이다. [Architecture.md A07.3](Architecture.md), [Proposal.md §08](Proposal.md), [진행 상태](STATUS.md) 참조. ICS export/푸시는 범위 밖이다.

## 읽을 절

**Architecture.md** A0~A3의 P0/P1 우선순위·공고/관심 공통 분류코드·실제 Forms 헤더부터 읽고, §6~7 경험·추천, §9 화면, §10~11 코어/API/DB, §12 AI/운영, §14 TASK 실행·체크, §15 공동 결정, §16 검증을 따른다.

React/TypeScript/Vite·Node/Fastify·PostgreSQL은 기존 설계를 유지한다. 실제 제품 코드·연동·디자인 렌더링은 채택 후 실행 승인 범위에서 진행한다. 실제 서비스 연결과 디자인 렌더링은 후속 개발·검증 단계에서 진행한다.

## 신규 차별화: 포스터도 읽고 바뀐 공고를 확인하는 HUFS One AI

기존 학생별 맞춤 피드·중요공지·졸업지원 우선순위를 유지하면서 **사진형 포스터·첨부 PDF까지 인식하는 OCR → 조건부 HCX-005 Vision → 공식 출처의 시간 기반 RAG → HCX-007 인용 추출 → 독립 코드 검증**을 설계했다. **Laya multilingual 322M**은 NCP High Memory-g3 CPU의 비동기 분류/검수 후보(사용자 자격판정 아님)로만 사용한다. 취소·연장·정정에 따라 인덱스와 캐시가 변하며, 조회 화면에서 출처·확인 시각·근거 이미지를 보여주는 것을 목표로 한다. 모두 **구현 전 설계**, 예산 승인은 별도다. 정본: `Architecture.md` 및 `docs/TRUSTED_RAG_MEDIA_VERSIONING.md`.
