# PR 운영과 파일 충돌 예방

- **한 TASK = 한 브랜치 = 한 주 편집자 = 한 PR**. main 직접 푸시하지 않는다.
- 브랜치 예시: feat/ui-, feat/recommendation-, feat/academics-, feat/platform-, chore/contracts-, docs/.
- 동시 실행 에이전트는 브랜치·worktree·포트·테스트 DB를 분리. 팀원은 각자의 clone.
- API·TopicCode·DB migration·lockfile·공통 타입은 통합 담당자 사전 승인 없이 수정하지 않는다.
- PR에 소유 경로, 변경한 계약, 테스트 환경/결과, 실패/미실행을 명시한다.
- 담당 외 트랙이 독립 리뷰하고 팀장 ot4562-glitch가 최종 병합한다.
- CODEOWNERS는 소유자 안내이고 GitHub 플랜의 보호 정책 강제를 보장하지 않는다.
- CI·합성 fixture에 실제 학생 CSV를 포함하지 않는다. NCP 결제/서버 생성/공개 릴리스는 별도 사용자 승인.
- **이번 PR은 코드 대신 폴더·계약·협업 문서·두 학생 과목 CSV만 제안한다.**
