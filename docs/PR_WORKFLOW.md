# PR 운영과 파일 충돌 예방

- **한 TASK = 한 브랜치 = 한 주 편집자 = 한 PR**. main 직접 푸시하지 않는다.
- 브랜치 예시: feat/ui-, feat/recommendation-, feat/academics-, feat/platform-, chore/contracts-, docs/.
- 동시 실행 에이전트는 브랜치·worktree·포트·테스트 DB를 분리. 팀원은 각자의 clone.
- API·TopicCode·DB migration·lockfile·공통 타입은 통합 담당자 사전 승인 없이 수정하지 않는다.
- PR에 소유 경로, 변경한 계약, 테스트 환경/결과, 실패/미실행을 명시한다.
- 담당 외 트랙이 독립 리뷰하고 팀장 ot4562-glitch가 최종 병합한다.
- CODEOWNERS는 소유자 안내이고 GitHub 플랜의 보호 정책 강제를 보장하지 않는다.
- CI·합성 fixture에 실제 학생 CSV를 포함하지 않는다. NCP 결제/서버 생성/공개 릴리스는 별도 사용자 승인.
- **현재 선행 게이트:** TASK-00 계약 소스와 synthetic fixture는 구현됐다. `npm ci --ignore-scripts --no-audit --no-fund` → `npm run check`로 검증하고 `packages/contracts/README.md`의 각 트랙 명령을 사용한다. PR 병합/CI·실제 4명의 리뷰 완료 여부를 확인한 후 네 트랙을 동일 SHA에 맞춰 개발한다. 그 전에도 별도 브랜치의 합성 mock 구조 연구는 가능하지만 **공통 타입/API를 독자 변경하면 안 된다.**
- **확정 역할:** 심민성(계약·통합), 김채윤(추천·공지), 박준영(학업·전망), 이의상(UI·모바일), 이서연(팀 결성·기획 리드 및 API·CLOVA·NCP). GitHub 계정 실명 연결이 확인되기 전에는 리뷰어를 임의 자동 지정하지 않는다.
- **실제 학생자료 주의:** 개발팀 5인과 Forms/과목 CSV 제출 4인은 다르다. 박준영은 제출하지 않는다. 사용자가 `까마르` 파일의 소유자가 **김채윤**임을 확인했지만, **매핑 확인=팀 공유/외부 AI/NCP 동의가 아니다**. 파일명 대응은 제한된 import registry에서만 주입하고 CI/mock/PR에는 합성 fixture만 사용한다.
- **계약 변경:** API·TopicCode·응답·오류·DB 스키마·lockfile 수정은 영향·마이그레이션·합성 검증과 소비자 리뷰를 첨부해 심민성에게 별도 계약 PR로 요청한다.
