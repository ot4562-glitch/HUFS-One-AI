# PR 운영과 파일 충돌 예방

> **2026-10-31 확정 최신 배정·운영:** API/인증/DB/AI검증/수집/RAG/테스트 코드는 **심민성 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)**, NCP/CLOVA/OCR/Vision/Laya **Provider 구현·운영 환경 전체**은 **이서연 [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)**만 준비. 이의상(UI #9), 김채윤(추천 #10), 박준영(학업 #11) 책임 불변. 공용 초대장 REVIEWER는 합성 전체 시연 기능을 평가 기간 동안 사용하며 실제 학생·유료 작업은 금지. NCP Standard-g3 4vCPU·16GB + 별도 CB 50GB, 공식 본선 발표 11/16 이후 조건부 개통. 제안서 정본은 Proposal.md(제안서 PDF/출력기 폐기).


- **한 TASK = 한 브랜치 = 한 주 편집자 = 한 PR**. main 직접 푸시하지 않는다.
- 브랜치 예시: feat/ui-, feat/recommendation-, feat/academics-, feat/platform-, chore/contracts-, docs/.
- 동시 실행 에이전트는 브랜치·worktree·포트·테스트 DB를 분리. 팀원은 각자의 clone.
- API·TopicCode·DB migration·lockfile·공통 타입은 통합 담당자 사전 승인 없이 수정하지 않는다.
- PR에 소유 경로, 변경한 계약, 테스트 환경/결과, 실패/미실행을 명시한다.
- 담당 외 트랙이 독립 리뷰하고 팀장 ot4562-glitch가 최종 병합한다.
- CODEOWNERS는 소유자 안내이고 GitHub 플랜의 보호 정책 강제를 보장하지 않는다.
- CI·합성 fixture에 실제 학생 CSV를 포함하지 않는다. NCP 결제/서버 생성/공개 릴리스는 별도 사용자 승인.
- **공개 접속 Google 인증 계약:** 주소 `외대.온라인.한국` 및 **Google OAuth + 실제 외대 메일 소유 검증 + 베타 allowlist**는 신규 P0 설계다. 기관 공식 SSO 허가는 전제하지 않는다. Google token (`sub`,`iss`,`aud`,`hd`), 외대 메일 OTP의 일회성/유효기간/계정 결속, 세션·401/403·로그아웃, 익명 HTML/API/CDN/storage/direct-IP/preview 우회 부정시험을 별도 계약·운영 PR로 입증한다. 메일 접미사/Google `email_verified` 단독 체크 금지. 이 설계 PR은 NCP 개통이나 실학생 자료 이전을 승인하지 않는다.
- **현재 선행 게이트:** TASK-00 계약 소스와 synthetic fixture는 구현됐다. `npm ci --ignore-scripts --no-audit --no-fund` → `npm run check`로 검증하고 `packages/contracts/README.md`의 각 트랙 명령을 사용한다. PR 병합/CI·실제 4명의 리뷰 완료 여부를 확인한 후 네 트랙을 동일 SHA에 맞춰 개발한다. 그 전에도 별도 브랜치의 합성 mock 구조 연구는 가능하지만 **공통 타입/API를 독자 변경하면 안 된다.**
- **확정 역할과 이슈 assignee 매핑:** 심민성 `ot4562-glitch`(#8/#18), 김채윤 `qamarrchae`(#10), 박준영 `taewangim-alt`(#11), 이의상 `uisang2004-maker`(#9), 이서연은 **GitHub ID 미확인·#12/#20/#22 미배정**(NCP·CLOVA·OCR/Vision·Laya Provider 전체). 기준과 링크는 [WORKSTREAMS.md](WORKSTREAMS.md). 미확인 ID를 추정해 리뷰어를 지정하거나 동의/권한을 부여하지 않는다.
- **실제 학생자료 주의:** 개발팀 5인과 Forms/과목 CSV 제출 4인은 다르다. 박준영은 제출하지 않는다. 사용자가 `까마르` 파일의 소유자가 **김채윤**임을 확인했지만, **매핑 확인=팀 공유/외부 AI/NCP 동의가 아니다**. 파일명 대응은 제한된 import registry에서만 주입하고 CI/mock/PR에는 합성 fixture만 사용한다.
- **계약 변경:** API·TopicCode·응답·오류·DB 스키마·lockfile 수정은 영향·마이그레이션·합성 검증과 소비자 리뷰를 첨부해 심민성에게 별도 계약 PR로 요청한다.

## 신규 OCR·RAG·Laya 설계와 기존 TASK/PR 충돌 방지

2026-10-31 설계 PR은 **문서/제안서 PDF만 변경**한다. `SourceRevision`, 이미지 좌표 `SourceSpan`, `VerifiedClaim`, `RetrievalEnvelope`, CPU Laya 판단 어댑터 등 공통 타입과 DB·API 시그니처는 **후속 독립 contracts PR**에서 도입한다. 이미 열려 있는 TASK-06/14 PR과 임의 혼합/rebase·자동 병합하지 않는다. 신규 계약 PR은 추천·공지, 학업, UI, API 소비자 리뷰와 합성 이미지/정정·`asOf` 부정시험, 최신 요금·CPU/RSS 확인을 요구한다. 문서 변경 자체는 NCP 사용/실학생 데이터 외부 전송·OCR/HCX 호출 승인이 아니다. [세부 계약](TRUSTED_RAG_MEDIA_VERSIONING.md).

## 심사자 초대·기간제 접근 PR 리뷰 게이트 (#25)

- 외부 REVIEWER가 일반 팀원 API나 실학생 projection/Forms, 관리자·유료 AI API로 들어갈 수 있는 경로가 없는지 독립 **UI·API 보안 교차검토**한다. `/api/reviewer`의 인가 구현은 base API [PR #24](https://github.com/ot4562-glitch/HUFS-One-AI/pull/24)에 스택으로 작성한다.
- [REVIEWER_ACCESS.md](REVIEWER_ACCESS.md)의 이메일/Google sub 바인딩·초대 digest·기간 끝 경계·철회·다중 세션·CSRF·RATE 제한/재시작 후 DB 지속성·민감 화면 접근 거부 합성 테스트를 요구한다. 초대 링크/실제 수신 이메일을 GitHub/PR/테스트 출력에 공개하지 않는다.
- 실제 Google 로그인/메일 검증·지속 DB·배포·초대 발송은 별도 운영 승인 없이 동작했다고 표시하지 않는다. 현재 PDF는 **비활성 양식**만 공유한다. 초대장이 있다고 해서 공식 학교 SSO/학교 승인이 부여되는 것은 아니다.
