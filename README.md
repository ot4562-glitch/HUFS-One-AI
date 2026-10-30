# HUFS One AI

**HUFSAbility의 기존 취업·진로·비교과 정보를 AI로 학생별로 재배치하고, 졸업지원까지 확장하는 한국외대 바이브코딩 공모전 제안.**

## 문서 두 개: 읽는 사람에 따라 역할을 분리

| 문서 | 독자와 역할 | 바꾸어야 할 때 |
| --- | --- | --- |
| **[Proposal.md](Proposal.md)** | **팀원·심사자용**: 1쪽 요약, 학교 문제와 실제 근거, 개인화 핵심 기능, 60초 시연, 구현계획, 공식 심사배점·예상 효과의 측정법, 학내 도입안 | 아이디어·기능 우선순위·심사 메시지가 바뀔 때 |
| **[Proposal.pdf](Proposal.pdf)** | 위 `Proposal.md`에서 생성한 **공유·회의용 PDF**. 학교 및 팀의 공식 승인·제품 구현을 뜻하지 않음 | Proposal.md가 수정되면 재출력 |
| **[Architecture.md](Architecture.md)** | **다중 AI 개발·검증 에이전트용**: 공고-관심 공통 분류코드 24개, 실제 Forms 26열 입력 계약, CSV·규칙팩, 화면·API·AI·DB·NCP·동의·시험·TASK-00~17 | 구현 계약·데이터·테스트·에이전트 실행순서가 바뀔 때 |
| **[AGENTS.md](AGENTS.md)** | 에이전트의 지속 안전·권한 규칙. 최신 지시와 자료 사용·동의 경계가 우선 | 실행·보안 정책이 바뀔 때 |
| **[STATUS.md](STATUS.md)** | 현재 확인된 사실·미완료·검증 결과 | 실제 수행/검증 직후 |

**읽는 순서:** 팀원은 `Proposal.md` → `APPLICATION.md`, 구현·검증 에이전트는 상위 `AGENTS.md` → 이 폴더 `AGENTS.md` → `Architecture.md` A0~A3 → 담당 절과 `STATUS.md` 순이다.

## 확정된 제품 방향과 우선순위

- **P0 (우선):** 같은 HUFSAbility 공고라도 학생의 관심 직무·전공·승인 경험에 따라 **관련 3건은 큰 강조 카드**로, 그 외 일반 항목은 작은 목록으로 노출. AI는 경험·공고를 해석하고 코드가 추천순위·지원자격을 검증한다. 전체 공고 접근은 유지한다.
- **P1 (추가):** 현재 학생이 알아서 확인하던 **학번·전공별 졸업요건, 부족학점·미이수 필수과목·수강계획**을 별도 `졸업지원` 탭에서 안내. 공식 졸업사정과 구분한다.
- **P2 (확장):** 상세 시간표 최적화·개설 전망·전교생/학교 공식 계정 연동·장기 운영.
- **본선 핵심 시연:** 같은 공고 묶음의 서로 다른 두 학생 홈 → AI 숨은 조건·지원 행동 → 경험 승인 후 추천 변경 → 추가 졸업지원. 공식 발표는 2026-12-09이며 본선 개발기간은 11/16~12/06이다(공식 변경 가능).

## 현재 자료와 개인정보 경계

Google Forms는 **구성 완료**됐고 **26열 응답 예시 1건**이 확인됐다. 나머지 네 명의 응답과 다른 세 명의 과목표, 학번·전공별 공식 규칙 검수는 아직 완료되지 않았다. **이번 골자 PR에는 두 명의 수강과목 CSV(48/39행)만 별도 검증·제안한다.** 별도 학생 프로필 CSV 템플릿을 만들지 않는다. 수강과목은 학생별 **`학기,학수번호,과목명,학점,이수구분,이수상태` 6열 CSV**를 한 번 검수하며, 사용자는 파일명으로 팀원을 식별한다. 내부/공개 결과는 **S01~S05 가명 코드**로 별도 매핑한다.

**외부 AI 전사 전에는 과목표 외 이름·학번·성적 등이 보이지 않도록 분리하고 별도 동의를 확인**한다. 동의가 없으면 사람이 전사한다. 성적/GPA·전체 학번·사진·원본 성적증명서를 시연 데이터에 수집하지 않는다.

프로젝트가 GitHub에 올라가더라도 `local_only/`, `templates/real5-intake/*.csv`, `HUFS_UI.pdf`, `reference/**/raw/`·`screenshots/`·원문 파생물, `retire/`는 **보존만 하고 공개·배포에서 제외**한다. 자체 작성한 근거 요약과 합성 시험은 별도 이용조건·개인정보 검사 후 협업 가능하다.

## 병렬 에이전트 폴더 골자 (애플리케이션 코드 미작성)

- **5개 책임 트랙:** 통합 ot4562-glitch, UI·모바일(Claude 우선), 추천·공지(GPT 우선), 학업·전망(GPT 우선), API·CLOVA·NCP(GPT 우선). [소유권 표](docs/WORKSTREAMS.md) · [팀원 구조지도](docs/TEAM_GUIDE.md).
- **공통 계약:** [docs/CONTRACT_BOUNDARIES.md](docs/CONTRACT_BOUNDARIES.md). packages/contracts와 루트 설정·DB migration·lockfile은 팀장이 변경을 조정한다.
- **독립 브랜치/PR:** [docs/PR_WORKFLOW.md](docs/PR_WORKFLOW.md)와 각 폴더의 AGENTS.md. main은 통합 담당자가 검토 후 병합.
- **실제 CSV 예외:** 이번 Private PR에 한해 csv/ 두 과목 파일만 제출. [자료 취급·동의 규칙](docs/DATA_GOVERNANCE.md). Google Forms 원본·비밀키·성적·기타 학생자료는 제외하며 컨테이너/AI/CI에서 사용하지 않는다.

## 일정·도구와 근거

- 1차 공식 배점: **한국외대 현안 관련성 40 / 독창성 30 / AI 활용 30**. 2차: **구현 30 / 학내 적용 30 / 파급효과 25 / 발표 15**, NCP 실제 활용 최대 +5점. 공식 페이지: https://contest.hufs.ac.kr/
- 기존 HUFSAbility 근거: [2026-10-29 스냅샷](reference/hufsability/snapshots/2026-10-29/README.md) · [후속 공개자료 색인](reference/hufsability/snapshots/2026-10-29-followup/README.md). 자료 권한: [DATA_PERMISSION_GATE.md](reference/hufsability/DATA_PERMISSION_GATE.md).
- PDF 재출력: WSL `python3 reference/export_proposal_pdf.py --replace`. [Architecture.md](Architecture.md)의 구현은 채택 후 별도 실행 승인 전까지 계획 단계다.
- **검증:** `python.exe tools/verify_release_boundary.py`와 기존 출처 검증 도구를 사용한다. Private GitHub 저장소 생성과 안전한 초기 커밋·푸시는 사용자 최신 지시로 승인됐다. Public 전환·두 학생 과목 CSV의 Private PR 포함은 이번 명시 요청으로 제한 허용했고, 기타 실학생 자료·public 전환·서비스 배포는 별도 승인이 필요하다.
