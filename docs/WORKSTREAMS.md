# HUFS One AI — 본선 이후 확정 역할과 과거 업무 이력

**기준:** 독립 학생 프로젝트. 코드 병합과 사람·기관·실환경 승인 권한은 별개다. 진행 상태 [STATUS](../STATUS.md) · 본선진출 이후 서버 인수 [#323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323)·통합 [#325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) · 협업 제안 [#317](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317). 과거 #252/#253/#257은 후속 #316 이관 후 종료.

## 본선 진출 이후 역할 확정 (2026-11-07, 사용자 지정)

**적용 시점:** 본선 진출 이후 사용자 지정 역할이며, **GitHub에도 담당자별 업무를 실제 배정**했습니다. #321~#325는 각 개인, #317은 심민성, 구 #318 전체 UX 업무는 이서연 #323으로 통합되었습니다. 담당 확정은 실서비스 출시·기관/학생 승인·기능 완료가 아닙니다.

| 책임자 | 본선 이후 맡을 일 | 산출물·검증 |
| --- | --- | --- |
| **이의상** `uisang2004-maker` · **박준영** `taewangim-alt` (AI/NLP **공동 담당**) | 학생 경험의 문장 이해·요약·분류/역량 태그/자연어 처리 전반, **Laya** 모델 조정·정확도 개선, **네이버 CLOVA OCR/Vision 및 HCX(LLM) AI API** 호출 흐름·품질·오류 처리, 프롬프트/전처리/평가 및 제공자가 지원하고 데이터 권리가 있을 때의 파인튜닝 검토 | 비식별 평가셋·정답 기준, 변경 전후 정확도/오탐·인용 충실성·오류 사례/지연·비용 측정. 공급자 파인튜닝 지원/모델 가용성을 확인하기 전 **실제 파인튜닝 완료라고 표현 금지**. 추천/학점/지원 적격의 최종 확정은 결정론적 규칙·학생 승인/학교 확인과 구별 |
| **박준영** (기존 유지 업무) | 학업 RulePack·졸업요건·What-if·개설 전망 코어의 기존 안정성 유지, 실제 공식 학칙/학수번호 검수에 참여. 새로운 AI/NLP 공동 업무와 별도의 결정론적 학사 검증 | 학칙 판본·과목 identity·4인 대조 근거, UNKNOWN/NEEDS_REVIEW 및 수동/공식 검수 경계 유지 |
| **이서연** `lhh42001` | **React UI/디자인·접근성 구현, NCP 실제 배포·운영·복구와 승인된 유료 AI 공급자 실호출/과금 영수증 주담당**. 진짜 신규 실행·보존 캐시·합성 모드를 별도로 대조 | 최소권한·실제 NCP/TLS/PG 접근·호스트/회복/청구/예산, 실호출 1–2건의 비공개 run ID·모델·판본·측정 지연/토큰·비용·출처/동의/캐시 HIT/MISS 증빙. #324의 권리 판정 및 #325의 서버 보안 게이트 확인 후 수행 |
| **김채윤** `qamarrchae` | **자료 이용권·출처·소유자별 목적별 허가 확인, 서로 다른 실제 학생 2명 이상 BETA A/B·실기기/NVDA·사람 사용성 검증 및 전체 웹 시연**. 가상 Data Lab/AI 결과 평가와 60초·10분 시연 유지 | Forms/학업 CSV·학교/동아리·공고/포스터/이미지·기관 사이트별 읽기/저장/공개/AI 전송/보존/철회 범위, 실제 두 계정 분리·기기/브라우저/스크린리더·철회·늦은 응답 증거. 사람 Gold와 synthetic oracle 구별, 비공개 증빙만 인계 |
| **심민성** `ot4562-glitch` | **신규 제품 기능 #317 직접 개발 + 공통 API/DB·RLS·인증/CI·보안/영수증 저장·조회 코드 #325, 코드 품질·통합/출시 게이트**. NCP 운영·실유료 실행은 #323, 자료 권리/실계정·실기기 인수는 #324 | 정확한 PR SHA·계약/자동 회귀·서버 actor/grant/consent/TTL/권한·마스킹된 기술 원장, 팀원의 실운영/자료/사용자 증거를 릴리스에서 대조. 사람/기관 검증 또는 유료 실결제 직접 대행으로 오인하지 않음 |

**책임 경계:** 이서연은 **웹/React UI와 NCP 실운영·유료 공급자 실호출/청구 영수증**, 김채윤은 **기관/개인별 자료 이용권과 실제 서로 다른 학생 A/B·실기기/스크린리더/사람 수락**, 이의상·박준영은 AI/NLP·평가/학업, 심민성은 **#317 코드·#325 API/DB/RLS/보안 원장 코드 및 최종 통합**. 실 호출/요금/권리·인수 증빙은 각각 담당자의 비공개 자료로 남기고, 비밀·결제·운영 권한을 GitHub issue 지정만으로 부여하지 않는다.

**공통 산출물:** AI·NLP는 이의상 #321 + 박준영 #322 공동, 학업 자료 #322, 웹 UI/UX·서버·NCP #323(이서연), 시연·AI 품질 #324, 통합·API/DB/릴리스 #325, 추가 기능 #317(심민성). **6개 모두 assignee 1명 지정**. 실제 모델/사람 검증은 결과와 근거가 생긴 뒤에만 PASS.

## #317 기능·현장 인수의 책임 단일화 (2026-11-07 후속 조정)

| 인수 조건 | 주담당 이슈 | 비고/협업 |
| --- | --- | --- |
| 신규 커리어·AI 설명 UI와 자동 회귀 | **심민성 #317** | 앱 기능 코드 구현; 실제 유료 호출/인적 수락을 완료 표시하지 않음 |
| 공통 API·권한/actor·RLS·영수증 메타데이터 저장·조회 코드 | **심민성 #325** | 원장/계약·교차 리뷰·최종 GO/NO-GO |
| **NCP 실 배포/복구 및 유료 모델 실호출 1~2건·실과금/캐시 영수증** | **이서연 #323** | 운영 환경/실측 증빙. 코드 #325, 권리 확인 #324 선행 |
| **학교/기관/학생 자료·포스터/기관 홈페이지/동아리 이용권** | **김채윤 #324** | 출처·소유자별 수집/저장/게시/AI 전송/보존/철회 범위·비공개 증빙 |
| **서로 다른 실제 학생 BETA 2명 이상 A/B·모바일/NVDA 실기기/사람 인수** | **김채윤 #324** | #323 UI 결함 수정, #325 서버 결함 수정. 합성 S01–S05는 실제 계정의 대체 아님 |
| Laya·CLOVA/HCX AI 후보·인용/정확도·학업 RulePack | **이의상 #321 + 박준영 #322** | 실제 영수증 #323, 독립 이용/시연 인수 #324에 의존 |

**규칙:** 담당 1명 지정은 실제 권한/기관 동의를 대신하지 않는다. 같은 실측·인수 체크박스를 #317과 #325에 중복 배치하지 않는다. 운영/사람 검증 미실시 `NOT_RUN`, 서비스 전체 `RELEASE_BLOCKED`; 과거 역할 문구는 역사적 참고만.

## 현재 열린 이슈 6개 — 개인별 GitHub 담당 확정 (2026-11-07)

| 이슈 | 담당 GitHub 계정 | 본선 이후 역할 |
| --- | --- | --- |
| [#321 이의상 AI/NLP](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321) | `uisang2004-maker` | Laya·CLOVA·NLP 정확도 공동 |
| [#322 박준영 AI·학업](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322) | `taewangim-alt` | AI 정확도 공동·학업 코어 |
| [#323 이서연 통합 웹·UI/UX·NCP](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) | `lhh42001` | 웹·React/UX·NCP 실배포/운영/복구, **유료 AI 실호출·실과금 영수증** |
| [#324 김채윤 시연/AI 검증](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324) | `qamarrchae` | **자료 이용권/출처 권리, 실제 학생 2명 A/B·실기기/스크린리더 QA**, 시연/AI 평가 |
| [#325 심민성 통합/품질](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) | `ot4562-glitch` | API/DB·RLS/비공개 영수증 **코드**·보안·CI·통합/릴리스 |
| [#317 추가 기능](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317) | `ot4562-glitch` | **신규 기능 코드 직접 구현·자동 검증만** |

[구 통합 #316](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316)은 POST-01~20을 #321~#325로 각각 한 번씩 분리한 뒤 **CLOSED/기록 보관**했습니다. #317은 심민성, 구 #318의 UI/UX 전체는 이서연 #323에 통합됐습니다. **총 6개 OPEN·각 담당자 1명**입니다. 과거 이슈와 역할은 기록일 뿐 현재 배정 근거가 아닙니다. 업무 배정은 실 NCP·유료 AI·학교/학생 데이터·사람 인수 완료를 의미하지 않으며 `NOT_RUN/CONFIGURATION_REQUIRED/RELEASE_BLOCKED`가 유지됩니다.
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
- **2026-11-06 당시:** 이전 합성 이슈 #9/#10/#11/#12/#119/#258/#260/#261/#284/#294/#296은 CLOSED, 운영 #276·실인수 #280–#283·신제품/실자료 #297–#303은 당시 OPEN이었다. **현재는 모두 보관/통합 CLOSED**, 남은 실제 업무는 구 통합 #316을 거쳐 개인별 #321~#325, #317과 구 #318(현 #323 통합)으로 이전됐다. `RELEASE_BLOCKED` 유지.

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

@uisang2004-maker의 A11 디자인/UI 소비자 범위에서 11대분류 관찰 메뉴·미지원 안내·홈·공고 레이아웃을 통합했습니다. 공통 `Architecture.md` A11 수정은 오너가 별도 리뷰했으나, 이 사실은 실제 학교 UI 공식 인증이나 NVDA 사람 인수가 아닙니다. 이후 [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)에서 [본선 전 #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)의 합성 검증 범위를 종결했으며 실 현장 UI 인수는 통합 #323의 UX-01~25에서 추적합니다.

## 과거 본선 진출 전/후 팀별 이슈 분리 (2026-11-06 당시 이력)

| 담당 | 본선 진출 전 — 정리 종결(CLOSED) | 본선 진출 이후 — 실제 운영/실자료 수락 |
| --- | --- | --- |
| 이의상 UI/접근성 | [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실 BETA UI·모바일/스크린리더/학업·경험 종단 |
| 김채윤 추천/공지 | [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 합성 코퍼스·정정/성능(순수 코어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료) | [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) 실제 허가 출처·추천 정확성 주장 방지/운영 실측 |
| 박준영 학업 | [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 합성/교차 검토; #260 PR #262 정책/테스트 완료, 소비자 리뷰는 미완료 | [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) 공식 RulePack·4인 학업 원장·8학기 개설 실증 |
| 이서연 비코드/운영 | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 계정·비용·권리 사전검토/문서 | [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) 실 NCP 계정·청구/복구/반납·실원본 이용권 검수 |

**공통 원칙:** 본선 전 11개 이슈는 CLOSED, 본선 이후 작업은 개인별 #321~#325에서 OPEN/NOT_RUN입니다. **NCP 실배포·유료 AI 실행/실과금 영수증 #323**, **자료 이용권·실학생 A/B·실기기/사람 검증 #324**, SQL·로그인·영수증 **저장/조회 코드**·최종 품질 #325, 신규 기능 **코드** #317, AI/NLP 모델/정확도 #321·#322. 각 증거는 담당자 이슈에서만 완료 판정합니다. 원본 `csv/` 5개는 수정/삭제 없이 보존하고 운영/CI/공개 페이지에 개인 자료를 담지 않습니다. 독립 사람 Gold·실서버/실모델 PASS는 아직 확인되지 않았습니다.

**현재 담당 원칙:** 2026-11-07 사용자 요청에 따라 본선 이후 통합 #316의 POST-01~20을 #321~#325로 나눠 원본을 보관/종결하고, 새 개인별 이슈에 해당 GitHub 계정을 배정했습니다. #317은 심민성이 담당하고 구 #318은 #323에 통합·종결. 과거 #260의 미실시 팀원 교차 검토는 #324/325의 실제 인수에서 검증해야 하며 사람 승인으로 둔갑시키지 않습니다.

## 본선 이후 협업 인터페이스

| 인수·연결 지점 | 작업 소유자 → 협업/검증 | 전달물·안전 조건 |
| --- | --- | --- |
| 학생 경험 텍스트·이미지→NLP/모델 | 김채윤 권리 검수 → 이의상·박준영 모델 → 김채윤 품질/시연 → 심민성 통합 | 허용된 입력·독립 Gold/모델·프롬프트 버전·인용·오탐·NEEDS_REVIEW, 실호출/과금은 이서연 #323 |
| 학업 RulePack·What-if·교과 식별 | 박준영 유지 → 심민성 계약/DB → 이서연 UI·김채윤 시연 | 공식 규정/학기·불확실성·수기대조/버전·학점 구분, AI 해석을 공식 졸업 판정으로 변경 금지 |
| 화면·React UI·반응형/접근성 | 이서연 구현 → 김채윤 실기기/NVDA·사용성 인수 → 심민성 PR/회귀 | 디자인/입력·동의/승인·데이터 경계, 320–1440px·키보드/기기별 실제 사람 결과는 #324 |
| NCP 계정·실호출/과금·운영/서버 상태 | **이서연 #323 실배포/영수증 실측** ↔ 심민성 #325 서버 계약·PR/보안 | 최소권한·IAM/청구/회수·TLS·실공급자 run ID/실측 비용/캐시·백업/복구·버전/원복, 실행 전 김채윤 #324의 목적별 권리 확인 |
| API·DB·권한·제품 신규 기능 | 심민성 → 이서연 웹/서버·AI 공동담당·김채윤 시연 | Zod 계약·현재 actor/grant/asOf·비공개 원장/RLS·idempotency·철회/NO_DATA·CI/코드 리뷰 |
| 출처/개인 권리·실학생/실기기·시연/AI 품질 | **김채윤 #324** → AI 공동담당 오류 재현·이서연 UI 수정·심민성 코드/릴리스 | 기관·개인별 허용 이용목적/철회, 실제 두 BETA actor 격리, NVDA·모바일/키보드·60초/10분, 비식별 PASS/FAIL/NOT_RUN |

## 공동 규칙

- 실제 참가 동의 5명과 실제 CSV/Forms 제공자 4명을 구별. 합성 5슬롯/REVIEWER/EMPTY는 별도.
- 공통 SQL migration·lockfile/계약·인증·CI 변경은 담당자 및 소비자 교차 리뷰를 받는다.
- 기존 `csv/` 5개 원본은 **무단 수정·삭제·이동 금지**(CI SHA 고정). 기존 원본과 신규 개인정보·비밀·credentials를 배포/로그/CI/모델 프롬프트에 담지 않는다. 다른 사람의 dirty worktree를 초기화/강제 push하지 않는다.
- 실제 URL/배포/유료 호출·학교 기관 협약·원본 열람은 별도 승인. AI 또는 사용자 계정으로 남긴 코멘트가 자동으로 기관/인간 승인이 되지 않는다.

**연계:** [개발 규칙](../AGENTS.md) · [검토/병합 절차](PR_WORKFLOW.md) · [고정 인수 조건](TEAM_PROGRESS.md).
