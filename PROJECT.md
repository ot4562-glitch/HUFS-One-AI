# HUFS One AI | 제품·화면 기준 안내

> **현재 구현·검증 상태:** [STATUS](STATUS.md)에서 최신 main, PR별 HEAD·CI, 이슈 완료 조건을 확인합니다. 합성 코드·일회용 PostgreSQL·브라우저 검사와 실제 Google/학교메일·NCP·자료 권리·독립 사람 검수는 별도 증거입니다. **RELEASE_BLOCKED**.

팀/심사자용 제안은 [Proposal](Proposal.md), 기술 계약은 [Architecture](Architecture.md)입니다. 첫 목표는 취업·진로·비교과 정보를 관심·승인 경험에 맞게 개인화하는 것이고, 졸업요건·수강계획은 별도 지원 영역입니다. 역할은 [WORKSTREAMS](docs/WORKSTREAMS.md)를 따릅니다.

## 현재 확정 방향

공식 HUFS UI 색상·심벌 안내가 디자인의 우선 근거다(Architecture.md §3.4). 사용자 제공 인덱스의 개인현황·역량·배지·분야별 공고·공식 바로가기는 기존 자산으로 인정한다(§2.6). **동일 화면에서 유사하게 배치된 취업·비교과 영역을 학생별 중요도에 따라 상위 큰 카드와 작은 일반 목록으로 재구성**한다. 졸업지원은 독립된 주요 탭으로 추가하며, 한 화면만으로 기존 전체 기능의 부재를 단정하지 않는다.

주시연은 **구성 완료된 Google Forms 양식의 승인된 응답**과 본인이 검수한 **6열 이수과목 CSV** 및 공식 한국외대 규칙팩을 결합한다(Architecture.md A03·A08). 2026-10-31 Private main에서 수강 CSV 4개(6열)와 Forms 통합본 1개(26열/4응답) 형식을 확인했다. 이는 **원본 게시·팀 공유·외부 처리 동의/학생 대응 검증을 의미하지 않으며**, 사용자 확인으로 참여 5명 동의/HUFSAbility 수집 허가는 확보되어 있다. #212 이후 현재 Git 보호 경로는 제거되었고, 파일별 목적·전송/보관·과거 Git 권리와 공식 RulePack 검수는 별도로 남는다. 합성팩은 공개 개발·정상/예외 회귀시험용으로 별도 유지한다. 학점·현재수강·계획을 분리하고, 미충족·미확인을 올바르게 보여주는 것도 정상 결과다.

**접속 경계:** 사용자 확보 신고 도메인 `외대.온라인.한국`은 독립 팀 웹의 예정 주소다. **Google OAuth + 외대 메일 현재 수신권 확인(검증된 Workspace `hd` 또는 이메일 OTP) + 베타 초대 승인**이 있어야 UI/API에 진입한다. 공식 학교 SSO 허가는 기대하지 않으며 로그인에 학교 비밀번호를 받지 않는다. Google 로그인/Gmail만으로는 열리지 않는다. DNS/TLS·실 Google/OTP·배포의 운영 검증은 미완료이고 학교 공식 서비스로 표시하지 않는다. [Architecture.md](Architecture.md) A14.1a · [CLOUD.md](CLOUD.md).

## 신규 홈 기능: 개인별 '내 주요 일정' 미니 캘린더

**2026-10-31 계획 추가:** 오늘 화면 하단에 시험·학사 서류 제출일, 모집 지원마감 및 행사일을 **학생별로** 표시하는 작은 달력을 추가한다. 실제 학생 마감과 학과 내부 행정 보고일을 혼동하지 않는다. 상시/마감 미정은 달력 밖 별도 목록, 학사정보 미공유·적용 여부 UNKNOWN은 '적용 확인 필요'로 안내한다. 360px 모바일·키보드/스크린리더, 색 외 텍스트/아이콘, 시연 5개 대상 변경·철회 시 화면 초기화가 필요하다. **계산 #50·계약 #53·인증 calendar GET #58·브라우저 API #77·snapshot race 방어 #95는 main 병합**됐다. [#72 UI 위젯 PR](https://github.com/minseong-hufs/HUFS-One-AI/pull/72)은 이후 비합성 calendar port·snapshot 잔상 회귀 수정과 독립 승인·CI 뒤 **main `717ce979`에 병합**되었습니다. 단, [#51 UI 이슈](https://github.com/minseong-hufs/HUFS-One-AI/issues/51)의 실학교 원본 권리·운영 계정·실스크린리더 종단은 #9 정본으로 이관해 추적합니다. [Architecture.md A07.3](Architecture.md), [Proposal.md §08](Proposal.md), [진행 상태](STATUS.md) 참조. ICS export/푸시는 범위 밖이다.

## 읽을 절

**Architecture.md** A0~A3의 P0/P1 우선순위·공고/관심 공통 분류코드·실제 Forms 헤더부터 읽고, §6~7 경험·추천, §9 화면, §10~11 코어/API/DB, §12 AI/운영, §14 TASK 실행·체크, §15 공동 결정, §16 검증을 따른다.

React/TypeScript/Vite·Node/Fastify·PostgreSQL은 기존 설계를 유지한다. 제품 코드·합성 화면과 API/DB 연결은 구현되어 있으며, 최신 수락 범위는 STATUS를 따른다. 실제 계정·자료·운영 서비스 인수는 별도 단계다.

## 신규 차별화: 포스터도 읽고 바뀐 공고를 확인하는 HUFS One AI

기존 학생별 맞춤 피드·중요공지·졸업지원 우선순위를 유지하면서 **사진형 포스터·첨부 PDF까지 인식하는 OCR → 조건부 HCX-005 Vision → 공식 출처의 시간 기반 RAG → HCX-007 인용 추출 → 독립 코드 검증**을 설계했다. **Laya multilingual 322M**은 NCP High Memory-g3 CPU의 비동기 분류/검수 후보(사용자 자격판정 아님)로만 사용한다. 취소·연장·정정에 따라 인덱스와 캐시가 변하며, 조회 화면에서 출처·확인 시각·근거 이미지를 보여주는 것을 목표로 한다. 관련 코드·합성 시험과 후속 이미지/PDF 연결이 존재한다. 실제 출처별 권리·외부 Provider·Laya 호스트/품질·비용 인수는 별도이며, 최신 구현/CI는 STATUS를 따른다. 정본: `Architecture.md` 및 `docs/TRUSTED_RAG_MEDIA_VERSIONING.md`.
