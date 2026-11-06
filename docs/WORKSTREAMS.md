# HUFS One AI — 현재 팀 역할과 협업 경계

**기준:** 독립 학생 프로젝트. 코드 병합과 사람·기관·실환경 승인 권한은 별개다. 진행 상태 [STATUS](../STATUS.md) · 본선진출 이후 운영 인수 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) · 협업 제안 [#255](https://github.com/ot4562-glitch/HUFS-One-AI/issues/255). 과거 #252/#253/#257은 후속 #276 이관 후 종료.

| 담당자 | 현재 코드/업무 소유 | 공동 인수·한계 |
| --- | --- | --- |
| **심민성** `ot4562-glitch` | TypeScript/Zod 공통 계약, API·OIDC/메일·PostgreSQL·SourceRevision/RAG·OCR/HCX/Laya/예산·NCP 모든 **SDK/시스템/worker/IaC/CI/배포 코드**·보안 통합 | 병합된 오너 코드 #267~#275의 실제 8건 및 #277, 운영 잔여 #276. 개인·기관별 실제 권리/운영 인수 대행 금지 |
| **이의상** `uisang2004-maker` | React/Vite UI·메뉴/디자인·모바일·시연·접근성, [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)/[#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) | 실제 스크린리더/학생·REVIEWER 권한 종단, 학업/추천 소비자 연동 |
| **김채윤** `qamarrchae` | 추천·공지/기회 조건·시점/정정 코어, [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) | 200 추천 Gold/실출처 정답·조건 품질은 자기 초안과 분리된 독립 인수 |
| **박준영** `taewangim-alt` | 학점·졸업/RulePack·What-if/개설 전망, [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) | 공식 규정 판본·실 4인 수기 대조, 현재 owner/API/UI와 교차 인수 |
| **이서연** `lhh42001` | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12) **NCP 비코드 운영**: 계정·IAM/크레딧/요금·리전/SKU·실서버/네트워크/보관·모델 사용권/비용·영수증/중단·반납 | 코드/SDK/IaC/CI/OS 스크립트 개발 업무를 배정하지 않음. 실제 적용은 사용자 승인 후 |

## 2026-11-06 최신 팀 PR·이슈 상태

- [#306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)로 본선 이전 이슈 11개를 종결했습니다. 10개는 합성 코드/사전 계획 완료, #260은 미완 사람 리뷰를 #280/#281/#282로 이관한 `closed/not_planned`입니다.
- [#307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307)은 홈 액션/공고 필터 등 합성 UI 8파일에 대해 정확한 PR HEAD와 병합된 main `d8e2144`의 **4/4 CI SUCCESS** 후 병합됐습니다. [#305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305)는 0-diff 중복으로 리뷰·미병합 종료했습니다. 지정 담당자 사람 검수는 별도입니다.
- 이전 합성 이슈 #9/#10/#11/#12/#119/#258/#260/#261/#284/#294/#296은 **CLOSED**. 운영 #276, 담당자 실인수 #280–#283, 신제품/실자료 #297–#303은 **OPEN**. `RELEASE_BLOCKED` 유지.

## 2026-11-06 팀 PR 병합 현황 (과거 개별 통합 기록)

- [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) **박준영**: 과거 8학기 전망·NOTICE_ONLY 합성 코어, APPROVE 리뷰+MERGED `5a36a38`; 공식 학업 RulePack/학생별 사람 수락은 #282에서 OPEN; 구 #11·#260은 본선 이전 합성 범위로 CLOSED.
- [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) **김채윤**: 40+10 합성 코퍼스 커버리지, 경험 AI 후보→학생 승인 추천 순수 코어, APPROVE 리뷰+MERGED `48134da`; #259 순수 코어 CLOSED, 실 UI 인수 #280·실추천 #281은 OPEN; 구 #258/#10은 CLOSED.
- 동일 SHA의 합성 CI는 코드 검증일 뿐 별도 독립 사람 Gold·실 NCP·실개인정보/기관 자료 승인 아님. 담당별 인적 수락 비율은 근거 없이 올리지 않음.

## 후속 코드 통합 — 각 담당의 소유 범위 보존

- **이의상 [#285](https://github.com/ot4562-glitch/HUFS-One-AI/pull/285)**: 경험 3단계 합성 UI 컴포넌트. 소유 범위 밖 HufsOwnerApiClient 변경은 하지 않았으며, 이후 [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)에서 #284 owner API/경험 합성 소비자 연결 및 회귀가 통합돼 본선 이전 범위를 종결. 실 BETA/팀원 사람 검토 #280 등은 남음.
- **김채윤 [#286](https://github.com/ot4562-glitch/HUFS-One-AI/pull/286)**: revision 5-chain overlay·격리 정렬 결정성·합성 normalization bench. 실제 r1 보고서 입력 교체/실출처 인수는 하지 않음.
- **박준영 [#287](https://github.com/ot4562-glitch/HUFS-One-AI/pull/287)/[#288](https://github.com/ot4562-glitch/HUFS-One-AI/pull/288)/[#289](https://github.com/ot4562-glitch/HUFS-One-AI/pull/289)**: RulePack 영역 이동 보수 비교, forecast 합성 반례, ledger 속성 범위. #287/#289 학업 AGENTS 양쪽 안내문 보존.
- 각 PR에는 코드를 확인한 **AI 보조 `COMMENT` 리뷰**가 남아 있습니다. 독립 사람/팀 소비자 리뷰는 별개이며 #260 등의 교차 수락을 자동 완료시키지 않습니다. 현재 협업과 실 NCP/실계정/학교 원문 검증을 혼동하지 않습니다.

### 추가 UI 담당 리디자인 [#290](https://github.com/ot4562-glitch/HUFS-One-AI/pull/290)

@uisang2004-maker의 A11 디자인/UI 소비자 범위에서 11대분류 관찰 메뉴·미지원 안내·홈·공고 레이아웃을 통합했습니다. 공통 `Architecture.md` A11 수정은 오너가 별도 리뷰했으나, 이 사실은 실제 학교 UI 공식 인증이나 NVDA 사람 인수가 아닙니다. 이후 [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)에서 [본선 전 #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)의 합성 검증 범위를 종결했으며 실 현장 인수는 #280에서 진행합니다.

## 본선 진출 전/후 팀별 이슈 분리 (2026-11-06)

| 담당 | 본선 진출 전 — 정리 종결(CLOSED) | 본선 진출 이후 — 실제 운영/실자료 수락 |
| --- | --- | --- |
| 이의상 UI/접근성 | [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실 BETA UI·모바일/스크린리더/학업·경험 종단 |
| 김채윤 추천/공지 | [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 합성 코퍼스·정정/성능(순수 코어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료) | [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) 실제 허가 출처·추천 정확성 주장 방지/운영 실측 |
| 박준영 학업 | [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 합성/교차 검토; #260 PR #262 정책/테스트 완료, 소비자 리뷰는 미완료 | [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) 공식 RulePack·4인 학업 원장·8학기 개설 실증 |
| 이서연 비코드/운영 | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 계정·비용·권리 사전검토/문서 | [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) 실 NCP 계정·청구/복구/반납·실원본 이용권 검수 |

**공통 원칙:** 본선 전 11개 이슈는 **CLOSED**(10 completed, #260 미완료 팀원 리뷰 이관 not_planned), 본선 이후 실제 인수는 **OPEN/NOT_RUN**이며 실제 NCP·SQL/AI/비밀키/운영자 구성과 실서비스 통합은 오너 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)이 총괄합니다. 본선 전 이슈 완료가 본선 이후 실서비스 인수 완료는 아닙니다. 원본 `csv/` 5개는 수정·삭제하지 않고 운영/배포/CI 번들에 포함하지 않습니다. 독립 사람 Gold는 현재 범위에서 제외되며 PASS 아님.

**담당 보존:** 새로운 4개 이슈의 assignee는 기존 각 트랙 담당자 그대로입니다. #260의 합성 PR #262 및 #306 통합을 확인했으나 @qamarrchae·@uisang2004-maker의 **실제 교차 소비자 사람 리뷰는 NOT_RUN**으로 #280/#281/#282에서 확인. 팀원에게 공통 API/DB·NCP 시스템 작업을 중복 지시하지 않습니다.

## 최신 협업 인터페이스

| 입력 | 소유자 → 소비자 | 확인할 계약 |
| --- | --- | --- |
| Actor/SharingGrant·SourceRights·Zod | 심민성 → 모든 트랙 | 현재 세션·개별 목적/권한/asOf·예외/NO_DATA·비공개 실패 |
| 공고·공지/추천 코어 | 김채윤 → API/웹 | 자격/정정·실출처 권리·추정 금지, 독립 Gold |
| 졸업/개설 What-if·RulePack | 박준영 → API/웹 | 취득/수강/계획 학점 분리·공식 조항/보류·동일 과목 |
| 화면·모바일/접근성 | 이의상 ← 공통/추천/학업 | 8개 상단 주요 메뉴, 모바일 5탭·원 HUFSAbility 메뉴 미지원·사용자 안내, 권한 전환/철회 |
| NCP·AI | 심민성 개발 ↔ 이서연 운영 | 비용·실권리 사전 승인, CPU/RSS/예산·재시작/키·유료 호출 fail-closed |
| 독립 인수 | 실제 비작성자/권한자 → #276 | 서명/검증 환경/정확한 SHA, PASS·FAIL·HOLD·NOT_RUN |

## 공동 규칙

- 실제 참가 동의 5명과 실제 CSV/Forms 제공자 4명을 구별. 합성 5슬롯/REVIEWER/EMPTY는 별도.
- 공통 SQL migration·lockfile/계약·인증·CI 변경은 담당자 및 소비자 교차 리뷰를 받는다.
- 기존 `csv/` 5개 원본은 **무단 수정·삭제·이동 금지**(CI SHA 고정). 기존 원본과 신규 개인정보·비밀·credentials를 배포/로그/CI/모델 프롬프트에 담지 않는다. 다른 사람의 dirty worktree를 초기화/강제 push하지 않는다.
- 실제 URL/배포/유료 호출·학교 기관 협약·원본 열람은 별도 승인. AI 또는 사용자 계정으로 남긴 코멘트가 자동으로 기관/인간 승인이 되지 않는다.

**연계:** [개발 규칙](../AGENTS.md) · [검토/병합 절차](PR_WORKFLOW.md) · [고정 인수 조건](TEAM_PROGRESS.md).
