# HUFS One AI — 현재 팀 역할과 협업 경계

**기준:** 독립 학생 프로젝트. 코드 병합과 사람·기관·실환경 승인 권한은 별개다. 진행 상태 [STATUS](../STATUS.md) · 개발 작업 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253) · 사람/운영 수락 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).

| 담당자 | 현재 코드/업무 소유 | 공동 인수·한계 |
| --- | --- | --- |
| **심민성** `ot4562-glitch` | TypeScript/Zod 공통 계약, API·OIDC/메일·PostgreSQL·SourceRevision/RAG·OCR/HCX/Laya/예산·NCP 모든 **SDK/시스템/worker/IaC/CI/배포 코드**·보안 통합 | #253 전체 구현/CI, #252 인수 조율. 기관/개인/운영 승인 대행 금지 |
| **이의상** `uisang2004-maker` | React/Vite UI·메뉴/디자인·모바일·시연·접근성, [#9](https://github.com/minseong-hufs/HUFS-One-AI/issues/9)/[#119](https://github.com/minseong-hufs/HUFS-One-AI/issues/119) | 실제 스크린리더/학생·REVIEWER 권한 종단, 학업/추천 소비자 연동 |
| **김채윤** `qamarrchae` | 추천·공지/기회 조건·시점/정정 코어, [#10](https://github.com/minseong-hufs/HUFS-One-AI/issues/10) | 200 추천 Gold/실출처 정답·조건 품질은 자기 초안과 분리된 독립 인수 |
| **박준영** `taewangim-alt` | 학점·졸업/RulePack·What-if/개설 전망, [#11](https://github.com/minseong-hufs/HUFS-One-AI/issues/11) | 공식 규정 판본·실 4인 수기 대조, 현재 owner/API/UI와 교차 인수 |
| **이서연** `lhh42001` | [#12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12) **NCP 비코드 운영**: 계정·IAM/크레딧/요금·리전/SKU·실서버/네트워크/보관·모델 사용권/비용·영수증/중단·반납 | 코드/SDK/IaC/CI/OS 스크립트 개발 업무를 배정하지 않음. 실제 적용은 사용자 승인 후 |

## 최신 협업 인터페이스

| 입력 | 소유자 → 소비자 | 확인할 계약 |
| --- | --- | --- |
| Actor/SharingGrant·SourceRights·Zod | 심민성 → 모든 트랙 | 현재 세션·개별 목적/권한/asOf·예외/NO_DATA·비공개 실패 |
| 공고·공지/추천 코어 | 김채윤 → API/웹 | 자격/정정·실출처 권리·추정 금지, 독립 Gold |
| 졸업/개설 What-if·RulePack | 박준영 → API/웹 | 취득/수강/계획 학점 분리·공식 조항/보류·동일 과목 |
| 화면·모바일/접근성 | 이의상 ← 공통/추천/학업 | 8개 상단 주요 메뉴, 모바일 5탭·원 HUFSAbility 메뉴 미지원·사용자 안내, 권한 전환/철회 |
| NCP·AI | 심민성 개발 ↔ 이서연 운영 | 비용·실권리 사전 승인, CPU/RSS/예산·재시작/키·유료 호출 fail-closed |
| 독립 인수 | 실제 비작성자/권한자 → #252 | 서명/검증 환경/정확한 SHA, PASS·FAIL·HOLD·NOT_RUN |

## 공동 규칙

- 실제 참가 동의 5명과 실제 CSV/Forms 제공자 4명을 구별. 합성 5슬롯/REVIEWER/EMPTY는 별도.
- 공통 SQL migration·lockfile/계약·인증·CI 변경은 담당자 및 소비자 교차 리뷰를 받는다.
- 원본·개인정보/비밀·운영 credentials를 코드/로그/CI/AI 프롬프트에 넣지 않는다. 다른 사람의 dirty worktree를 초기화/강제 push하지 않는다.
- 실제 URL/배포/유료 호출·학교 기관 협약·원본 열람은 별도 승인. AI 또는 사용자 계정으로 남긴 코멘트가 자동으로 기관/인간 승인이 되지 않는다.

**연계:** [개발 규칙](../AGENTS.md) · [검토/병합 절차](PR_WORKFLOW.md) · [고정 인수 조건](TEAM_PROGRESS.md).
