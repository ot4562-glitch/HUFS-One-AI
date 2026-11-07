# HUFS One AI — 본선 이후 확정 역할과 과거 업무 이력

**기준:** 독립 학생 프로젝트. 코드 병합과 사람·기관·실환경 승인 권한은 별개다. 진행 상태 [STATUS](../STATUS.md) · 본선진출 이후 운영 인수 [#316](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316) · 협업 제안 [#317](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317). 과거 #252/#253/#257은 후속 #316 이관 후 종료.

## 본선 진출 이후 역할 확정 (2026-11-07, 사용자 지정)

**적용 시점:** 본선에 진출해 실제 연동·시연 작업을 착수할 때의 업무 분장. 이 역할 확정 자체가 본선 진출 결과·실서비스 출시/기관·사용자 승인·작업 완료를 뜻하지 않는다. **업무 책임과 GitHub 통합 이슈 assignee는 별개**이며 #316/#317/#318은 기존 방침대로 모두 미배정으로 둔다.

| 책임자 | 본선 이후 맡을 일 | 산출물·검증 |
| --- | --- | --- |
| **이의상** `uisang2004-maker` · **박준영** `taewangim-alt` (AI/NLP **공동 담당**) | 학생 경험의 문장 이해·요약·분류/역량 태그/자연어 처리 전반, **Laya** 모델 조정·정확도 개선, **네이버 CLOVA OCR/Vision 및 HCX(LLM) AI API** 호출 흐름·품질·오류 처리, 프롬프트/전처리/평가 및 제공자가 지원하고 데이터 권리가 있을 때의 파인튜닝 검토 | 비식별 평가셋·정답 기준, 변경 전후 정확도/오탐·인용 충실성·오류 사례/지연·비용 측정. 공급자 파인튜닝 지원/모델 가용성을 확인하기 전 **실제 파인튜닝 완료라고 표현 금지**. 추천/학점/지원 적격의 최종 확정은 결정론적 규칙·학생 승인/학교 확인과 구별 |
| **박준영** (기존 유지 업무) | 학업 RulePack·졸업요건·What-if·개설 전망 코어의 기존 안정성 유지, 실제 공식 학칙/학수번호 검수에 참여. 새로운 AI/NLP 공동 업무와 별도의 결정론적 학사 검증 | 학칙 판본·과목 identity·4인 대조 근거, UNKNOWN/NEEDS_REVIEW 및 수동/공식 검수 경계 유지 |
| **이서연** `lhh42001` | **전체 웹사이트 디자인 및 React UI의 신규 주담당**(기존 이의상 UI 업무 인수), 반응형/접근성·화면 연결, **API 서버 운영·상태·배포/모니터링 및 NCP 계정·쿼터·요금·호스트·복구 관리** | 화면별 UX 이슈/다양한 화면 폭·키보드 회귀, 운영 점검표·요금/자원·장애/복구·서버 인수 기록. 민감 키·실데이터/유료 결제/실서버 변경은 별도 승인·보안 통제 준수 |
| **김채윤** `qamarrchae` | **웹사이트 전체 시연 책임**. 학생 경험 예시 입력→AI 후보/정확도·근거·승인/수정→추천 변화를 검토하고, 발표용 **60초·10분 시연 경로/스크립트·역할별 리허설**을 작성·수행 | 가상·실제 데이터를 구별한 입력/예상 결과/실제 결과·PASS/FAIL·실패 대응·화면별 촬영/증거, AI 오류를 공동 AI 담당에게 재현 가능하게 전달. 기존 추천·공지 코어 이력은 유지하되 새 모델/공급자 소유는 AI 공동 담당 |
| **심민성** `ot4562-glitch` | **나머지 시스템·제품 통합과 코드 품질 총괄**, API/DB·인증/권한·공통 계약/CI·보안·리뷰/배포 경계·추가 기능 개발. AI 팀 출력·이서연 웹/서버·김채윤 시연/QA 결과 최종 결합 | 코드 리뷰·CI/회귀·API 계약/DB 권한/예산·보안/원장·릴리스 준비도 검수, 새 기능의 채택·구현/변경 영향 관리. 실제 인간/기관 검수와 자동테스트는 분리 |

**책임 경계:** UI 디자인·React 구현의 주담당은 이제 **이서연**이며 이의상은 **박준영과 AI 정확도/NLP**로 이동한다. 이서연의 **서버 운영**과 심민성의 **서버/API 코드 통합·최종 품질 검토**는 다른 책임이며, 비밀·결제·운영 계정에 대한 임의 권한 부여를 뜻하지 않는다. AI 팀의 결과를 김채윤이 사용 시나리오에서 시험하고 심민성이 통합·릴리스 경계를 확인한다.

**공통 산출물:** 역할별 작업은 #316 운영/실모델, #318 웹 UI·실사용 검증, #317 선택적 추가 기능에서 체크리스트 항목으로 추적한다. 필요하면 별도 PR로 세부 담당을 결정하되 **현재 세 통합 이슈는 계속 assignee 0명**이다. 실제 AI 호출/학칙/자료 권리·독립 사용자 검수·NCP 운영 실적은 아직 증거 없는 상태에서 PASS로 표시하지 않는다.

## 현행 OPEN 이슈 3개 — 이슈 자체는 미배정

GitHub에서 **OPEN은 정확히 [#318 [UI/UX]](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318), [#316 [본선 진출 이후]](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316), [#317 [추가 기능 제안]](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317)** 세 개뿐이며 **전부 미배정**입니다. 협업자 UI 피드백 #310–#314와 이전 운영/실인증/학업 후속 #280–#283/#297–#303은 이 3개에 병합·출처 링크를 남기고 closed/duplicate로 정리했습니다. 이 문서 아래의 개별 이름·과거 트랙·수락률은 **본선 이전 업무의 역사적 기록**이지 새 담당 배정표가 아닙니다. 본선 이후 역할은 위와 같이 확정됐지만 실제 NCP/학생·학교 데이터/사람 인수는 NOT_RUN/CONFIGURATION_REQUIRED, 운영 출시 RELEASE_BLOCKED입니다.

## 과거 팀별 작업 소유 (이력 · 새 이슈의 assignee가 아님)

| 이전 담당자 | 당시 구현·업무 | 당시 미완 인수·한계 |
| --- | --- | --- |
| **심민성** `ot4562-glitch` | TypeScript/Zod 공통 계약, API·OIDC/메일·PostgreSQL·SourceRevision/RAG·OCR/HCX/Laya/예산·NCP 모든 **SDK/시스템/worker/IaC/CI/배포 코드**·보안 통합 | 병합된 오너 코드 #267~#275의 실제 8건 및 #277, 운영 잔여 #276. 개인·기관별 실제 권리/운영 인수 대행 금지 |
| **이의상** `uisang2004-maker` | React/Vite UI·메뉴/디자인·모바일·시연·접근성, [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)/[#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) | 실제 스크린리더/학생·REVIEWER 권한 종단, 학업/추천 소비자 연동 |
| **김채윤** `qamarrchae` | 추천·공지/기회 조건·시점/정정 코어, [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) | 200 추천 Gold/실출처 정답·조건 품질은 자기 초안과 분리된 독립 인수 |
| **박준영** `taewangim-alt` | 학점·졸업/RulePack·What-if/개설 전망, [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) | 공식 규정 판본·실 4인 수기 대조, 현재 owner/API/UI와 교차 인수 |
| **이서연** `lhh42001` | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12) **NCP 비코드 운영**: 계정·IAM/크레딧/요금·리전/SKU·실서버/네트워크/보관·모델 사용권/비용·영수증/중단·반납 | 코드/SDK/IaC/CI/OS 스크립트 개발 업무를 배정하지 않음. 실제 적용은 사용자 승인 후 |

## 2026-11-06 최신 팀 PR·이슈 상태

- [#306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)로 본선 이전 이슈 11개를 종결했습니다. 10개는 합성 코드/사전 계획 완료, #260은 미완 사람 리뷰를 #280/#281/#282로 이관한 `closed/not_planned`입니다.
- [#307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307)은 홈 액션/공고 필터 등 합성 UI 8파일에 대해 정확한 PR HEAD와 병합된 main `d8e2144`의 **4/4 CI SUCCESS** 후 병합됐습니다. [#305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305)는 0-diff 중복으로 리뷰·미병합 종료했습니다. 지정 담당자 사람 검수는 별도입니다.
- **2026-11-06 당시:** 이전 합성 이슈 #9/#10/#11/#12/#119/#258/#260/#261/#284/#294/#296은 CLOSED, 운영 #276·실인수 #280–#283·신제품/실자료 #297–#303은 당시 OPEN이었다. **현재는 모두 보관/통합 CLOSED**, 남은 실제 업무는 #316/#317/#318의 체크리스트로 이전됐다. `RELEASE_BLOCKED` 유지.

## 2026-11-06 팀 PR 병합 현황 (과거 개별 통합 기록)

- [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) **박준영**: 과거 8학기 전망·NOTICE_ONLY 합성 코어, APPROVE 리뷰+MERGED `5a36a38`; 공식 학업 RulePack/학생별 사람 수락은 #282에서 OPEN; 구 #11·#260은 본선 이전 합성 범위로 CLOSED.
- [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) **김채윤**: 40+10 합성 코퍼스 커버리지, 경험 AI 후보→학생 승인 추천 순수 코어, APPROVE 리뷰+MERGED `48134da`; #259 순수 코어 CLOSED, 실 UI 인수 #280·실추천 #281은 OPEN; 구 #258/#10은 CLOSED.
- 동일 SHA의 합성 CI는 코드 검증일 뿐 별도 독립 사람 Gold·실 NCP·실개인정보/기관 자료 승인 아님. 담당별 인적 수락 비율은 근거 없이 올리지 않음.

## 과거 코드 통합 및 PR 담당 이력 (2026-11-06)

- **이의상 [#285](https://github.com/ot4562-glitch/HUFS-One-AI/pull/285)**: 경험 3단계 합성 UI 컴포넌트. 소유 범위 밖 HufsOwnerApiClient 변경은 하지 않았으며, 이후 [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)에서 #284 owner API/경험 합성 소비자 연결 및 회귀가 통합돼 본선 이전 범위를 종결. 실 BETA/팀원 사람 검토 #280 등은 남음.
- **김채윤 [#286](https://github.com/ot4562-glitch/HUFS-One-AI/pull/286)**: revision 5-chain overlay·격리 정렬 결정성·합성 normalization bench. 실제 r1 보고서 입력 교체/실출처 인수는 하지 않음.
- **박준영 [#287](https://github.com/ot4562-glitch/HUFS-One-AI/pull/287)/[#288](https://github.com/ot4562-glitch/HUFS-One-AI/pull/288)/[#289](https://github.com/ot4562-glitch/HUFS-One-AI/pull/289)**: RulePack 영역 이동 보수 비교, forecast 합성 반례, ledger 속성 범위. #287/#289 학업 AGENTS 양쪽 안내문 보존.
- 각 PR에는 코드를 확인한 **AI 보조 `COMMENT` 리뷰**가 남아 있습니다. 독립 사람/팀 소비자 리뷰는 별개이며 #260 등의 교차 수락을 자동 완료시키지 않습니다. 현재 협업과 실 NCP/실계정/학교 원문 검증을 혼동하지 않습니다.

### 추가 UI 담당 리디자인 [#290](https://github.com/ot4562-glitch/HUFS-One-AI/pull/290)

@uisang2004-maker의 A11 디자인/UI 소비자 범위에서 11대분류 관찰 메뉴·미지원 안내·홈·공고 레이아웃을 통합했습니다. 공통 `Architecture.md` A11 수정은 오너가 별도 리뷰했으나, 이 사실은 실제 학교 UI 공식 인증이나 NVDA 사람 인수가 아닙니다. 이후 [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)에서 [본선 전 #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)의 합성 검증 범위를 종결했으며 실 현장 인수는 현재 #318에서 추적합니다.

## 과거 본선 진출 전/후 팀별 이슈 분리 (2026-11-06 당시 이력)

| 담당 | 본선 진출 전 — 정리 종결(CLOSED) | 본선 진출 이후 — 실제 운영/실자료 수락 |
| --- | --- | --- |
| 이의상 UI/접근성 | [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실 BETA UI·모바일/스크린리더/학업·경험 종단 |
| 김채윤 추천/공지 | [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 합성 코퍼스·정정/성능(순수 코어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료) | [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) 실제 허가 출처·추천 정확성 주장 방지/운영 실측 |
| 박준영 학업 | [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 합성/교차 검토; #260 PR #262 정책/테스트 완료, 소비자 리뷰는 미완료 | [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) 공식 RulePack·4인 학업 원장·8학기 개설 실증 |
| 이서연 비코드/운영 | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 계정·비용·권리 사전검토/문서 | [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) 실 NCP 계정·청구/복구/반납·실원본 이용권 검수 |

**공통 원칙:** 본선 전 11개 이슈는 **CLOSED**(10 completed, #260 미완료 팀원 리뷰 이관 not_planned), 본선 이후 실제 인수는 **OPEN/NOT_RUN**이며 실제 NCP·SQL/AI/비밀키/운영자 구성과 실서비스 통합은 현재 [#316](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316)에서 추적하며, **현 역할별 실행 책임은 문서 상단의 새 표**를 따릅니다. 본선 전 이슈 완료가 본선 이후 실서비스 인수 완료는 아닙니다. 원본 `csv/` 5개는 수정·삭제하지 않고 운영/배포/CI 번들에 포함하지 않습니다. 독립 사람 Gold는 현재 범위에서 제외되며 PASS 아님.

**현재 담당 원칙:** 사용자는 2026-11-07 본선 이후 사람별 역할을 위 표로 확정했습니다. **#316/#317/#318의 GitHub assignee는 기존 요청대로 비워 둔 채** 역할 분담을 본문/문서로 관리합니다. #260의 팀원 교차 검토는 NOT_RUN으로 #316/#318에서 확인하며 과거 개별 이슈의 assignee를 자동 복원하지 않습니다.

## 본선 이후 협업 인터페이스

| 인수·연결 지점 | 작업 소유자 → 협업/검증 | 전달물·안전 조건 |
| --- | --- | --- |
| 학생 경험 텍스트·이미지→NLP/모델 | 이의상·박준영 → 김채윤 평가 → 심민성 통합 | 입력 권리/비식별 Gold·모델/프롬프트 버전·CLOVA OCR/Vision/HCX/Laya 지원 범위, 인용·오탐·NEEDS_REVIEW·API 토큰/비용 |
| 학업 RulePack·What-if·교과 식별 | 박준영 유지 → 심민성 계약/DB → 이서연 UI·김채윤 시연 | 공식 규정/학기·불확실성·수기대조/버전·학점 구분, AI 해석을 공식 졸업 판정으로 변경 금지 |
| 화면·React UI·반응형/접근성 | 이서연 → 김채윤 시연/사용성 → 심민성 PR/회귀 | 디자인/스크린별 입력·동의/승인·데이터 경계/상태/접근성·320–1440px/실기기 결과 |
| NCP 계정·운영/서버 상태 | 이서연 서버 운영 ↔ 심민성 배포/코드 품질 | 최소권한·비밀/자료 비공개·IAM/청구/회수·TLS/보안·백업/복구·버전/실측, 실제 적용 전 권한·비용 승인 |
| API·DB·권한·제품 신규 기능 | 심민성 → 이서연 웹/서버·AI 공동담당·김채윤 시연 | Zod 계약·현재 actor/grant/asOf·비공개 원장/RLS·idempotency·철회/NO_DATA·CI/코드 리뷰 |
| 전체 시연/발표/AI 실품질 | 김채윤 → AI 공동담당 오류 재현 → 심민성 수정·이서연 화면 수정 | 학생 경험 입력·AI 후보·학생 승인·추천 근거·오답 대응, 60초/10분 루트·비식별 증거 및 PASS/FAIL/NOT_RUN |

## 공동 규칙

- 실제 참가 동의 5명과 실제 CSV/Forms 제공자 4명을 구별. 합성 5슬롯/REVIEWER/EMPTY는 별도.
- 공통 SQL migration·lockfile/계약·인증·CI 변경은 담당자 및 소비자 교차 리뷰를 받는다.
- 기존 `csv/` 5개 원본은 **무단 수정·삭제·이동 금지**(CI SHA 고정). 기존 원본과 신규 개인정보·비밀·credentials를 배포/로그/CI/모델 프롬프트에 담지 않는다. 다른 사람의 dirty worktree를 초기화/강제 push하지 않는다.
- 실제 URL/배포/유료 호출·학교 기관 협약·원본 열람은 별도 승인. AI 또는 사용자 계정으로 남긴 코멘트가 자동으로 기관/인간 승인이 되지 않는다.

**연계:** [개발 규칙](../AGENTS.md) · [검토/병합 절차](PR_WORKFLOW.md) · [고정 인수 조건](TEAM_PROGRESS.md).
