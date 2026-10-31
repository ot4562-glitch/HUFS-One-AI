# PR 운영과 파일 충돌 예방


- **코드/공통 계약 변경:** 한 TASK = 한 브랜치 = 한 주 편집자 = 한 PR. 리뷰/CI와 소유 경계 준수 후 병합하며, 코드의 main 직접 푸시는 금지한다.
- **운영 문서 예외(2026-10-31 사용자 최신 지시):** 기술 총괄 `ot4562-glitch`는 문서(`Proposal.md`, `Architecture.md`, `STATUS.md`, `README.md`, `docs/*.md` 등)를 최신 `main` blob SHA 충돌 확인 후 **직접 커밋**한다. 문서 정정만을 위한 PR은 열지 않는다. 이 예외로 코드, 데이터, 공통 TS/Zod 계약, lockfile, CI, 배포 설정을 우회하지 않는다.
- 브랜치 예시: feat/ui-, feat/recommendation-, feat/academics-, feat/platform-, chore/contracts-, docs/.
- 동시 실행 에이전트는 브랜치·worktree·포트·테스트 DB를 분리. 팀원은 각자의 clone.
- API·TopicCode·DB migration·lockfile·공통 타입은 통합 담당자 사전 승인 없이 수정하지 않는다.
- PR에 소유 경로, 변경한 계약, 테스트 환경/결과, 실패/미실행을 명시한다.
- **2026-10-31 새 사용자 병합 기준:** 코드 PR은 작성자가 아닌 사람 **최소 1명의 최신 HEAD `APPROVED`**를 받으면 최종 병합할 수 있다. 필수 CI 성공, 실제 diff/스택 의존 확인, 미해소 보안·개인정보 차단 사유는 여전히 선결한다. 독립 리뷰어 전원 승인은 더 이상 기본 조건이 아니다. 총괄 `ot4562-glitch`는 독립 팀원 PR에 직접 리뷰·승인할 수 있고 본인 작성 PR에는 타인 승인이 필요하다.
- CODEOWNERS는 소유자 안내이고 GitHub 플랜의 보호 정책 강제를 보장하지 않는다.
- CI·합성 fixture에 실제 학생 CSV를 포함하지 않는다. NCP 결제/서버 생성/공개 릴리스는 별도 사용자 승인.
- **공개 접속 Google 인증 계약:** 주소 `외대.온라인.한국` 및 **Google OAuth + 실제 외대 메일 소유 검증 + 베타 allowlist**는 신규 P0 설계다. 기관 공식 SSO 허가는 전제하지 않는다. Google token (`sub`,`iss`,`aud`,`hd`), 외대 메일 OTP의 일회성/유효기간/계정 결속, 세션·401/403·로그아웃, 익명 HTML/API/CDN/storage/direct-IP/preview 우회 부정시험을 별도 계약·운영 PR로 입증한다. 메일 접미사/Google `email_verified` 단독 체크 금지. 이 설계 PR은 NCP 개통이나 실학생 자료 이전을 승인하지 않는다.
- **현재 선행 게이트:** TASK-00 계약 소스와 synthetic fixture는 구현됐다. `npm ci --ignore-scripts --no-audit --no-fund` → `npm run check`로 검증하고 `packages/contracts/README.md`의 각 트랙 명령을 사용한다. PR 병합/CI·실제 4명의 리뷰 완료 여부를 확인한 후 네 트랙을 동일 SHA에 맞춰 개발한다. 그 전에도 별도 브랜치의 합성 mock 구조 연구는 가능하지만 **공통 타입/API를 독자 변경하면 안 된다.**
- **확인된 역할·이슈 assignee (2026-10-31):** 심민성 `ot4562-glitch`(#8/#18/#27), 김채윤 `qamarrchae`(#10), 박준영 `taewangim-alt`(#11), 이의상 `uisang2004-maker`(#9), 이서연 `lhh42001`(#12/#20/#22). GitHub 할당 사실은 실제 학생 개인정보·클라우드 처리 동의나 신원 인증을 의미하지 않는다. [WORKSTREAMS.md](WORKSTREAMS.md) 기준.
- **실제 학생자료 주의:** 개발팀 5인과 Forms/과목 CSV 제출 4인은 다르다. 박준영은 제출하지 않는다. 사용자가 `까마르` 파일의 소유자가 **김채윤**임을 확인했지만, **매핑 확인=팀 공유/외부 AI/NCP 동의가 아니다**. 파일명 대응은 제한된 import registry에서만 주입하고 CI/mock/PR에는 합성 fixture만 사용한다.
- **계약 변경:** API·TopicCode·응답·오류·DB 스키마·lockfile 수정은 영향·마이그레이션·합성 검증과 소비자 리뷰를 첨부해 심민성에게 별도 계약 PR로 요청한다.

## 2026-10-31 협업 지원·재검토 필수 절차

1. **전수 조회:** 이슈·PR 전체(open/closed/merged), 최신 커밋 SHA, base/head 스택, `CHANGES_REQUESTED` 이후 신규 커밋, CI/배포 미검증을 구별한다. 과거 리뷰 상태만으로 최신 HEAD을 합격 처리하지 않는다.
2. **선행 순서:** 추천/공지 스택 `#15 → #16 → #40 → #41`, 공통 데이터 근거 `#33 → #34`. #16 `NoticeResult.overdue` 계약 후속은 [#44](https://github.com/ot4562-glitch/HUFS-One-AI/pull/44)에서 합성 검증·독립 소비자 리뷰 후 병합하고, **김채윤 담당 PR #16**에 실제 출력·UI 회귀를 연결한다. #41 `rank-v1.1`은 기본 승격 전 A15/UX 검토를 요구한다.
3. **병합 기준(최신 사용자 지시):** (a) 비작성자 **1명 이상이 현재 HEAD SHA에 `APPROVED`**, (b) 동일 HEAD 필수 GitHub Actions 성공, (c) draft 아님/mergeable, (d) 스택 안에 아직 미승인·미병합 선행 변경이 잠입하지 않음, (e) 유효한 `CHANGES_REQUESTED`/보안·권한 차단이 해결됨을 확인한다. `COMMENTED`, 과거 HEAD 승인, 본인 PR 자기 승인, 합성 CI만으로 실배포 승인을 대신하지 못한다. 선행 PR 병합 후 base 동기화로 HEAD가 달라지면 최신 변경을 검토하고 다시 승인받는다. GitHub가 리뷰 수를 기술적으로 강제하지 않는 경우도 총괄이 수동으로 지킨다.
4. **파일·권한:** 팀원 소유 모듈을 총괄자가 덮어쓰지 않는다. 문제는 재현·근거 링크를 적은 리뷰/이슈로 남기고 작성자가 수정하도록 요청한다. 공통 타입은 독립 리뷰 PR로 수정하고 문서는 총괄자가 main에 직접 커밋한다. 실제 과목 CSV·Forms 원문이 이미 Private Git에 추적된 이력은 [DATA_GOVERNANCE](DATA_GOVERNANCE.md)에 기록하고 목적별 승인 없이 코드·CI·모델·배포로 옮기지 않는다.

## 새 기능 발견 시 계획·문서 동기화 의무 (캘린더 #50~#53)

- **PR 대체/재기반:** #54 → [#55](https://github.com/ot4562-glitch/HUFS-One-AI/pull/55)처럼 main 선행 변경과 테스트 충돌이 있을 때 기존 PR을 미병합 폐쇄하고 최신 main 기반 successor에서 해결한다. CI가 실패한 PR을 예전 승인만으로 병합하지 않는다.

- 계획에 없던 사용자 기능(예: 홈 하단 **'내 주요 일정' 미니 캘린더**)이 제안되면 담당 이슈·기술 계약·UI 소비자·권한/검증 테스트를 함께 정의하고 **Proposal.md, Architecture.md, STATUS.md, README.md, docs/WORKSTREAMS.md**에 설계/구현/미구현을 구별해 반영한다. 단순 리뷰나 타입 PR 병합을 기능 출시로 기록하지 않는다.
- 캘린더: 추천/공지 계산 **#50**, UI **#51**(이의상), 공통 결과 Wire/API **#52·#53**(심민성), 부분공유/원자적 인증 **#39·#49·#55·#35**를 연결한다. `GET /api/demo/contexts/:contextId/calendar`는 계약 결정으로, 서버 라우트/DB/React 연결 전에는 실제 API가 제공된다고 쓰지 않는다. 날짜 미정·UNKNOWN·중복 공지는 별도 처리, 부서 행정 마감은 학생 마감이 아니다. `.ics` export와 푸시는 이번 mini-calendar 범위 밖.
- 문서 정정은 위의 운영 문서 예외에 따라 총괄이 최신 SHA 확인 후 `main`에 바로 기록할 수 있다. 코드/공통 계약은 항상 리뷰 PR을 거친다.

## 통합 PR 의존 및 공유 CI 경계 (#15/#16/#28/#29/#31)

[PR #31](https://github.com/ot4562-glitch/HUFS-One-AI/pull/31) 병합으로 루트 `package.json`/`tsconfig.json`/`vitest.config.ts`/`.github/workflows/task00-contracts.yml`에 API·추천/공지 core·UI 합성 테스트가 통합됐다. #15는 같은 공통 4파일의 변경을 가진다. #16은 #15 기반이므로 **#15 리뷰/수정→병합→#16 rebase/검사** 순서를 유지해야 한다. #28 UI 상태관리 코드도 `main`에 병합됐으며 공통 CI는 #29 통합 담당 심민성이 관리한다. 충돌·이력 정리는 각 작성자 PR을 승인 없이 덮어쓰거나 병합하는 조치가 아니다. 실제 CI 및 독립 리뷰 미완료 상태에서 merge 하지 않는다. 모든 CI는 실제 학생 CSV·Forms·local_only·원시자료를 checkout하지 않는다.

## 신규 OCR·RAG·Laya 설계와 기존 TASK/PR 충돌 방지

2026-10-31 설계 변경은 **문서와 합성 계약만 변경**하며 제안서 산출물은 `Proposal.md`만 유지한다. `SourceRevision`, 이미지 좌표 `SourceSpan`, `VerifiedClaim`, `RetrievalEnvelope`, CPU Laya 판단 어댑터 등 공통 타입과 DB·API 시그니처는 **후속 독립 contracts PR**에서 도입한다. 이미 열려 있는 TASK-06/14 PR과 임의 혼합/rebase·자동 병합하지 않는다. 신규 계약 PR은 추천·공지, 학업, UI, API 소비자 리뷰와 합성 이미지/정정·`asOf` 부정시험, 최신 요금·CPU/RSS 확인을 요구한다. 문서 변경 자체는 NCP 사용/실학생 데이터 외부 전송·OCR/HCX 호출 승인이 아니다. [세부 계약](TRUSTED_RAG_MEDIA_VERSIONING.md).

## 심사자 초대·기간제 접근 PR 리뷰 게이트 (#25)

- 외부 REVIEWER가 일반 팀원 API나 실학생 projection/Forms, 관리자·유료 AI API로 들어갈 수 있는 경로가 없는지 독립 **UI·API 보안 교차검토**한다. `/api/reviewer`의 인가 구현은 base API [PR #24](https://github.com/ot4562-glitch/HUFS-One-AI/pull/24)에 스택으로 작성한다.
- [REVIEWER_ACCESS.md](REVIEWER_ACCESS.md)의 이메일/Google sub 바인딩·초대 digest·기간 끝 경계·철회·다중 세션·CSRF·RATE 제한/재시작 후 DB 지속성·민감 화면 접근 거부 합성 테스트를 요구한다. 초대 링크/실제 수신 이메일을 GitHub/PR/테스트 출력에 공개하지 않는다.
- 실제 Google 로그인/메일 검증·지속 DB·배포·초대 발송은 별도 운영 승인 없이 동작했다고 표시하지 않는다. 현재 PDF는 **비활성 양식**만 공유한다. 초대장이 있다고 해서 공식 학교 SSO/학교 승인이 부여되는 것은 아니다.
