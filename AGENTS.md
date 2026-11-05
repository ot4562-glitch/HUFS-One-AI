# HUFS One AI — 현재 개발 규칙

## 승인과 사실

프로젝트 소유자는 문서에 기재된 개인정보·자료/기관·공유/게시·외부 전송·운영/출시 승인을 모두 완료했다고 확인했습니다. **`OWNER_CONFIRMED_APPROVED`**를 기준으로 개발하며 과거의 승인 대기 문구를 이유로 같은 승인을 다시 요구하지 않습니다. 정본은 [AUTHORIZATION](docs/AUTHORIZATION.md)입니다.

승인 완료는 실제 코드/설정/시험·학업 사실·독립 Gold·배포 성공을 대신하지 않습니다. 테스트하지 않은 결과는 `NOT_RUN`, 측정하지 않은 값은 `NOT_MEASURED`, 실제 주소/자격증명 미설정은 `CONFIGURATION_REQUIRED`입니다. 인증·소유권·RLS/CSRF·현재 철회·비밀 보호는 유지합니다.

## 담당 범위

| 담당 | 소유 |
| --- | --- |
| 심민성 `ot4562-glitch` | 공통 Zod/API·OIDC/학교메일·PG/RLS·Source/RAG·AI/비용·NCP SDK/worker/IaC/systemd/배포/CI 모든 코드·통합; #253/#257 |
| 이의상 `uisang2004-maker` | React UI·모바일/접근성·시연·UI E2E; #9/#119/#258 |
| 김채윤 `qamarrchae` | 추천·공지·경험 역량 매핑 순수 코어; #10/#259 |
| 박준영 `taewangim-alt` | 학업/RulePack·What-if·개설 전망·교과 근거; #11/#260 |
| 이서연 `lhh42001` | NCP 계정/요금/호스트·기관 자료 증거·제품 요구사항 등 비코드 운영; #12/#261 |

다른 담당자의 dirty worktree·브랜치·핵심 코드를 초기화하거나 무단 대체하지 않습니다. 공통 계약/DB/lockfile은 소비자와 교차 검토합니다.

## 구현·검증

현재 코드·관련 이슈·README/STATUS·Architecture·폴더별 규칙을 먼저 읽습니다. 승인된 운영 구성은 실제 OIDC/메일·별도 SQL role/CA TLS·공급자를 주입하며, 로컬 합성 계정 서버는 운영 인증의 대체가 아닙니다. AI 후보와 사용자 승인, 실제 입증된 학사/활동 사실을 구별합니다. 불명확한 근거는 UNKNOWN/NEEDS_REVIEW이며 잘못된 데이터를 성공으로 바꾸지 않습니다.

정확한 HEAD의 타입·합성/부정·일회용 PG·Chrome·CI 결과와 실패/미실행을 기록합니다. AI 코드 리뷰는 실제 비작성자의 사람 인수와 구별하고, 명시적인 개별 PR 병합 지시는 해당 PR에만 적용합니다. 현재 문서는 현재 상태만 설명하며 지난 진행 일지를 누적하지 않습니다.

[현재 구현](STATUS.md) · [실행 검증 #252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252) · [작업 PR #264](https://github.com/minseong-hufs/HUFS-One-AI/pull/264).