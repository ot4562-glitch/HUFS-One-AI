# HUFS One AI

**HUFSAbility의 기존 취업·진로·비교과 정보를 AI로 학생별로 재배치하고, 졸업지원까지 확장하는 한국외대 바이브코딩 공모전 제안.**

## 문서 두 개: 읽는 사람에 따라 역할을 분리

| 문서 | 독자와 역할 | 바꾸어야 할 때 |
| --- | --- | --- |
| **[Proposal.md](Proposal.md)** | **팀원·심사자용**: 1쪽 요약, 학교 문제와 실제 근거, 개인화 핵심 기능, 60초 시연, 구현계획, 공식 심사배점·예상 효과의 측정법, 학내 도입안 | 아이디어·기능 우선순위·심사 메시지가 바뀔 때 |
| **[Proposal.pdf](Proposal.pdf)** | `Proposal.md` 기반 공유·회의용 PDF. **이번 도메인·인증 변경 전 판본이므로 재출력 전에는 최신 제안서로 배포하지 않음** | Proposal.md 변경 반영 후 PDF 재출력 |
| **[Architecture.md](Architecture.md)** | **다중 AI 개발·검증 에이전트용**: 공고-관심 공통 분류코드 24개, 실제 Forms 26열 입력 계약, CSV·규칙팩, 화면·API·AI·DB·NCP·동의·시험·TASK-00~17 | 구현 계약·데이터·테스트·에이전트 실행순서가 바뀔 때 |
| **[AGENTS.md](AGENTS.md)** | 에이전트의 지속 안전·권한 규칙. 최신 지시와 자료 사용·동의 경계가 우선 | 실행·보안 정책이 바뀔 때 |
| **[STATUS.md](STATUS.md)** | 현재 확인된 사실·미완료·검증 결과 | 실제 수행/검증 직후 |

**읽는 순서:** 팀원은 `Proposal.md` → `APPLICATION.md`, 구현·검증 에이전트는 상위 `AGENTS.md` → 이 폴더 `AGENTS.md` → `Architecture.md` A0~A3 → 담당 절과 `STATUS.md` 순이다.

## 확정된 제품 방향과 우선순위

- **P0 (우선):** 같은 HUFSAbility 공고라도 학생의 관심 직무·전공·승인 경험에 따라 **관련 3건은 큰 강조 카드**로, 그 외 일반 항목은 작은 목록으로 노출. AI는 경험·공고를 해석하고 코드가 추천순위·지원자격을 검증한다. 전체 공고 접근은 유지한다.
- **P1 (추가):** **학번·전공별 졸업요건, 부족학점·미이수 필수과목·수강계획, 최대20개 관심/필수 과목의 제한적 개설 전망**을 별도 `졸업지원` 탭에서 안내. 공식 졸업사정·미래 확정 공고와 구분한다.
- **P2 (확장):** 상세 시간표 최적화·확장 전망·학과/전교생·학교 DB 및 공식 SSO 연동(기관 허가가 있을 경우만)·장기 운영. **P0 인터넷 공개 시에는 학교 공식 SSO 대신 Google OAuth + 현재 외대 이메일 확인을 필수로 한다.**
- **본선 핵심 시연:** 같은 공고 묶음의 서로 다른 두 학생 홈 → AI 숨은 조건·지원 행동 → 경험 승인 후 추천 변경 → 추가 졸업지원. 공식 발표는 2026-12-09이며 본선 개발기간은 11/16~12/06이다(공식 변경 가능).

**학업 선행 연구:** [Course Compass 준비 보고](sandbox/taewangim-alt/academics-readiness.md)는 경제학부 학사·전망 기능의 검토 후보이며 제품 코드·원자료의 이식/검증 완료를 뜻하지 않는다. AI로 만드는 RulePack 초안은 사람이 조항별로 검수하며 제품의 네 가지 CLOVA 작업과 구분한다(Architecture A06.8·A08.6·A09.5).

## 접속 예정 주소와 HUFS 계정 전용 접근

- **도메인 확보(사용자 확인):** `외대.온라인.한국` · 정규 origin `https://외대.온라인.한국`. **DNS/TLS/사이트 개통은 아직 검증되지 않았으므로 현재 접속 가능한 서비스로 안내하지 않는다.**
- **예정 운영:** 공개 HTTPS 주소에서 **Google 로그인 + `@hufs.ac.kr` 메일의 현재 소유 확인 + 베타 초대 승인**을 거친 경우에만 앱/UI/API에 진입한다. Google Workspace `hd=hufs.ac.kr`이 실제 검증되면 기관 메일 증명으로 사용하고, 그 밖의 Google 계정(개인 Gmail 포함)은 외대 메일 일회용 인증코드(OTP)를 필수로 한다. 이메일 접미사·Google `email_verified` 단독으로 허용하지 않는다. **학교 SSO 허가는 출시 조건이 아니다.** Google OAuth/OTP 설정·보안시험은 아직 미구현이다.
- **보안/승인:** 익명 요청의 HTML·API·다운로드·스토리지/CDN·직접IP/preview 우회를 차단하고, 로그인 시작/회신용 최소 화면만 사전 공개한다. 실제 서비스 배포·학생자료 클라우드 이동·유료 NCP와 GitHub 저장소 공개 전환은 각각 별도 게이트다. [운영 요약](CLOUD.md) · [구현 정본](Architecture.md) A14.1a.

## 현재 자료와 개인정보 경계

Google Forms는 **구성 완료**됐고 **26열 응답 예시 1건**이 확인됐다. 실제 제출 대상은 **김채윤·이의상·심민성·이서연 4명**이다(박준영은 CSV/Forms 제출 제외). Forms **26열짜리 통합 CSV 1개**는 아직 완성되지 않았고 이서연은 미제출이다. 수강 CSV 목표는 4개(6열)이며, 현재 Private 파일 **3개는 김채윤(제출 별명 `까마르`)·심민성·이의상**의 제출물이다(사용자 확인). 이서연 파일과 Forms 통합본은 미확인이고, **제출은 팀 공유 동의/공식 학사 검증 완료가 아니다**. 학번·전공별 공식 학사 규칙과 공유 동의 검수는 미완료다. **Private PR #1의 두 학생 CSV(48/39행)와 PR #5의 추가 학생 CSV(28행)가 병합됐다. 공유 동의와 공식 학사 검증은 별도다.** 별도 학생 프로필 CSV 템플릿을 만들지 않는다. 수강과목은 학생별 **`학기,학수번호,과목명,학점,이수구분,이수상태` 6열 CSV**를 한 번 검수하며, 사용자는 파일명으로 팀원을 식별한다. 내부/공개 결과는 **S01~S05 가명 코드**로 별도 매핑한다.

**외부 AI 전사 전에는 과목표 외 이름·학번·성적 등이 보이지 않도록 분리하고 별도 동의를 확인**한다. 동의가 없으면 사람이 전사한다. 성적/GPA·전체 학번·사진·원본 성적증명서를 시연 데이터에 수집하지 않는다.

프로젝트가 GitHub에 올라가더라도 `local_only/`, `templates/real5-intake/*.csv`, `HUFS_UI.pdf`, `reference/**/raw/`·`screenshots/`·원문 파생물, `retire/`는 **보존만 하고 공개·배포에서 제외**한다. 자체 작성한 근거 요약과 합성 시험은 별도 이용조건·개인정보 검사 후 협업 가능하다.

## 독립 개발 준비 (공통 계약 코드는 구현, 웹·API는 미구현)

- **확정 5인 분담:** 심민성(GPT, 기술 총괄·TASK-00/통합), 이의상(Claude·Gemini, UI/모바일), 김채윤(GPT·Claude·Gemini, 추천/공지), 박준영(GPT·Claude, 졸업·전망), **이서연(Gemini 사용 확인, 팀 결성·기획 리드 + API/CLOVA/NCP)**. [작업/구독/경계](docs/WORKSTREAMS.md) · [팀원 구조지도](docs/TEAM_GUIDE.md).
- **TASK-00 공통 계약:** [TypeScript/Zod 패키지 사용법](packages/contracts/README.md)과 [계약 경계](docs/CONTRACT_BOUNDARIES.md). 24 TopicCode·DemoSnapshot/SharingGrant·4인 CSV/Forms 입력·오류/AI 스키마와 **합성 자동 소비자 검증**을 구현했다. `npm ci --ignore-scripts` → `npm run check`로 재현하고 네 트랙이 같은 계약을 사용한다. **실제 팀원 리뷰와 전용 PR/CI 병합 여부는 별도 게이트**다. 심민성이 공유 계약·lockfile을 조정한다.
- **독립 브랜치/PR:** [docs/PR_WORKFLOW.md](docs/PR_WORKFLOW.md)와 각 폴더의 AGENTS.md. main은 통합 담당자가 검토 후 병합.
- **실제 CSV 예외:** 기존 Private PR #1 두 파일과 2026-10-30 사용자 지정 추가 파일 한 개만 한정 포함. [자료 취급·동의 규칙](docs/DATA_GOVERNANCE.md). Google Forms 원본·비밀키·성적·기타 학생자료는 제외하며 컨테이너/AI/CI에서 사용하지 않는다.

## 일정·도구와 근거

- 1차 공식 배점: **한국외대 현안 관련성 40 / 독창성 30 / AI 활용 30**. 2차: **구현 30 / 학내 적용 30 / 파급효과 25 / 발표 15**, NCP 실제 활용 최대 +5점. 공식 페이지: https://contest.hufs.ac.kr/
- 기존 HUFSAbility 근거: [2026-10-29 스냅샷](reference/hufsability/snapshots/2026-10-29/README.md) · [후속 공개자료 색인](reference/hufsability/snapshots/2026-10-29-followup/README.md). 자료 권한: [DATA_PERMISSION_GATE.md](reference/hufsability/DATA_PERMISSION_GATE.md).
- PDF 재출력: WSL `python3 reference/export_proposal_pdf.py --replace`. [Architecture.md](Architecture.md)의 구현은 채택 후 별도 실행 승인 전까지 계획 단계다.
- **검증:** `python.exe tools/verify_release_boundary.py`와 기존 출처 검증 도구를 사용한다. Private GitHub 저장소 생성과 안전한 초기 커밋·푸시는 사용자 최신 지시로 승인됐다. 현재 Private 저장소의 기존 3개 과목 CSV 예외는 **추가 학생 파일/통합 Forms의 GitHub 게시 또는 외부 AI/NCP 전송 허가가 아니다**. 학생별 접근·GitHub 저장소 public 전환·실학생 데이터 외부 전송·서비스 개통은 서로 별도 동의·승인 및 검증이 필요하다.
