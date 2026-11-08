# HUFS One AI — 코드·원본·운영 실행 증거 원장 (2026-11-06)

> **현재 업무 배정 주의(2026-11-08):** 이 문서의 이전 시점 담당 이슈 #317·#321–#325 및 당시 인수/운영 분장은 **역사적 기록**이다. 현행 정본은 [루트 AGENTS](../AGENTS.md) · [업무 자동 배정 플레이북](ISSUE_ASSIGNMENT_PLAYBOOK.md) · [팀 역할](WORKSTREAMS.md)이다. 고정 역할 #355–#359는 **완전 읽기 전용**으로 수정·댓글/담당 변경을 하지 않는다. 신규 추가기능은 **심민성 최초 배정·가능한 비AI 코드 직접 구현 → 코드 기반 AI까지 포함해 박준영/이의상에게 AI 구현 인계**한다. 공식 문서·포스터·Gold 자료가 필요하면 **별도 `[데이터 요청]` 이슈**를 김채윤에게 만들고 원 기능에도 김채윤을 공동 assignee로 추가한다. 현재 13개 기능의 요청은 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)이다. 김채윤은 사용자 관점 경량 시연, 박준영은 AI 제품 기술 QA, 이서연은 실제 웹 디자인/배치, 심민성은 전 과정 검수를 맡는다.


> **기준:** `OWNER_CONFIRMED_APPROVED`는 프로젝트 승인이다. 개인별 현재 동의·권리, 실 Google/학교메일·NCP/TLS·DB CA·모델·운영비·실학생·사람 인수 통과를 의미하지 않는다. 운영 책임은 [이서연 #323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323), 전체 보안/DB·출시 게이트는 [심민성 #325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325)으로 분리 인수. 현행 구현 상태 [STATUS](../STATUS.md).

## 2026-11-07 최신 이슈 분리·담당 배정

| 현재 OPEN 7개 | 담당 |
| --- | --- |
| [#321 이의상 AI/NLP](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321) | `uisang2004-maker` |
| [#322 박준영 AI·학업](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322) | `taewangim-alt` |
| [#323 이서연 NCP 서버](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) | `lhh42001` |
| [#324 김채윤 시연/검증](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324) | `qamarrchae` |
| [#325 심민성 통합/릴리스](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) | `ot4562-glitch` |
| [#317 추가 기능](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317) | `ot4562-glitch` |
| [#318 UI/UX](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318) | `lhh42001` |

구 통합 [#316](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316)은 기존 POST-01~20을 개인별 #321~#325로 중복 없이 옮긴 뒤 **CLOSED(이관)**했습니다. 추가 기능 #317→심민성, UI/UX #318→이서연; 각 OPEN 이슈는 담당자 1명입니다. 이전 이슈 본문/댓글은 이력 보존. **코드/합성 PASS는 실제 NCP·학교 데이터·실 AI·사람 수락 완료를 뜻하지 않으며 `RELEASE_BLOCKED` 유지**.
## 이전 운영 증거 기준 (2026-11-06 원장 기록)

**이 표의 이전 PR #267~#304는 개별 SHA의 당시 검증 기록입니다.** 현재 기준은 본선 이전 11개 이슈를 종결한 [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)(merge `462f6d3`) 및 합성 홈·공고 인터랙션 [PR #307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307)(merge [`d8e2144`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/d8e2144184d06577ff76d8e5e1ed3a13be09af4c))입니다. #307 PR HEAD와 병합된 main SHA는 각각 TASK-00·Chrome·NCP·Pages 4/4 성공으로 별도 검증했으며, [#305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305)는 `main` 대비 변경 파일 0개인 중복으로 리뷰 후 미병합 종료했습니다. **본선 이전 11개는 CLOSED(10 completed, #260 이관 not_planned)**이고, 이 문단의 2026-11-06 당시 후속 #276/#280–#283·신규 제품 #297–#303은 OPEN이었으나, 2026-11-07 이후 현재 **#276·#298·#255만 OPEN**이며 나머지는 통합 CLOSED입니다. 실제 운영 `RELEASE_BLOCKED`는 같습니다. 추가 문서 SHA의 CI는 그 SHA에서 다시 확인합니다.

## 병합된 PR 근거

| 코드/자료 | PR 또는 commit | 확정된 사실 | 여전히 미검증 |
| --- | --- | --- | --- |
| 운영 API/계약/권한·AI budget/Source/경험 HTTP | [#267](https://github.com/ot4562-glitch/HUFS-One-AI/pull/267)~[#275](https://github.com/ot4562-glitch/HUFS-One-AI/pull/275) 중 실제 합병된 #267/268/269/270/272/273/274/275 | 단계별 코드·합성/일회용 PG·브라우저/오프라인 CI | 실제 운영자 키·Google·DB·CLOVA·학생 실동의 |
| BETA 본인 CSV 학업 화면/운영 요청 포트 | [#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277) MERGED | 5개 CSV SHA 보존, `/api/private-intake/self` 브라우저 계약, BETA 읽기 UI와 인증된 actor 요구 | 실제 operator private registry/loader와 4명 매핑·로그인/DB readback |
| 전망/rolling-origin 8학기·NOTICE_ONLY | [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) MERGED (`5a36a38`) | `forecast-offering-v2`, 합성 경계·정합성 테스트, PR HEAD 4/4 CI | 학교 8학기 정식 목록·과목 동등성·실사용자 공식 판단 |
| 추천 코퍼스·경험 승인 신호 | [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) MERGED (`48134da`) | 40+10 합성 분포, 키워드/인용·동의/버전·철회·결정론 테스트, PR HEAD 4/4 CI | 실출처·독립 Gold·공식 실원본 권리·사람 검수; 뒤의 PR #286/#306에서 합성 revision chain·경험 UI 연결 추가 |
| 비전공자 설치/제품 안내 | [문서 commit `a0043c5`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/a0043c569dd0518919b9f3ed243c9d8836a66403) | 새 가이드 3개와 README 하단 중요 문서 연결 | 실제 NCP/제품/에이전트 설치 **NOT_RUN** |
| 학점 독립 참조모형/예산 경계 | [PR #292](https://github.com/ot4562-glitch/HUFS-One-AI/pull/292) MERGED (`e0a5b73`) | AREA_SPREAD/GROUP_CHOICE 작은 입력 참조모형, 5만회 탐색 예산 초과 보류·1000과목 단일영역 회귀; PR HEAD CI 4/4 | 공식 학칙/학생 원장, 큰 다중영역 전수 대조 |
| 학사공지 검증 판본·clean 벤치 | [PR #293](https://github.com/ot4562-glitch/HUFS-One-AI/pull/293) MERGED (`02e7d91`) | 합성 5 revision 시나리오, VERIFIED mock claim·학생/행정 마감 분리, 2회 clean HEAD 정규화 벤치; PR HEAD CI 4/4 | 실제 권리/원본, 추천 보고서 별도 시나리오·운영 p95 |
| 미확인 과목 동등성·전망 | [PR #295](https://github.com/ot4562-glitch/HUFS-One-AI/pull/295) MERGED (`81a9f53`) | `forecast-offering-v3`, 원장/전망의 불확정 입력 보수 판정·합성 검증; PR HEAD CI 4/4 | `COURSE_IDENTITY_API_CONNECTION=NOT_CONNECTED`; 실데이터 132행·공식 RulePack/actor mapping |
| 합성 UI/Pages S04 분리 | [PR #304](https://github.com/ot4562-glitch/HUFS-One-AI/pull/304) MERGED (`5c17255`) | 공통 헤더/폼·지원보드/보관함, S04 public Pages 기본 revoke 제거, 정적 Pages 자동 재배포 보존; PR HEAD CI 4/4 | 학교 로그인/4명 독립 권한/실 UX·캐시·AI 호출 |

기존 대형 PR **#264는 분할 대체로 미병합 종료**. #252/#253/#257 완료/종료 후 잔여 운영 업무는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에 이관. 과거 코드 통합 기준 [`48134da`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/48134dae3b16157ebcc294f744c320fdd64a115c)의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752742) · [Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752741) · [NCP offline](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752743) · [Pages synthetic](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752761)은 **4/4 SUCCESS**. 이 기록은 정확히 **해당 SHA에 한정**되며 문서 커밋 이후의 HEAD CI는 다시 확인한다.

## `csv/` 다섯 원본의 현재 상태(공개 자료 내용 재인용 금지)

- Forms **1개**, 표 구조 **26열·4개 응답**; 수강 CSV **4개·총176행·6열**, **학수번호 공란 132행**. 과거 ‘수강 CSV 3개/총128행/4번째 부재’ 기록은 **2026-11-06 복구 이전의 불완전한 검색 결과**이며 현행 상태가 아니다.
- Git의 **정확한 다섯 원본 파일 경로/blob SHA**를 `tools/verify_release_boundary.py`에서 검사한다. 무단 삭제·수정·이동·재인코딩 금지; 추가 CSV/키·SID/identity map은 공개 반입 금지. 권리자 철회·삭제는 별도 법적 의무에 따름.
- 파일은 Git에 있다고 자동으로 로그인 사용자와 연결되지 않음. **실제 Forms row↔CSV 파일↔본인 BETA actor↔동의·rights·해시**의 비공개 attest/DB source·회수 검증이 필요. 과목코드 공란 때문에 공식 course identity/RulePack·학점 사정 확정은 `UNKNOWN/NEEDS_REVIEW`.
- PR #277은 BETA UI/route 연결 **코드**이고 운영용 `OperatorPostgresInputs`·실비밀 factory·loader·4명 identity attestation은 **현장 구성/추가 조립 검증 필요**. 실 NCP/PG로 import/readback을 수행한 증거 없음.

## 당시 #292/#293/#295/#304 통합의 운영 경계 (과거 SHA에 한정)

네 PR의 각 **PR HEAD** GitHub Actions 4/4 SUCCESS를 확인하고, 사용자의 일괄 병합 지시에 따라 squash merge했습니다. GitHub 리뷰는 `COMMENT` 중심이며 독립 사람의 `APPROVED`가 아닙니다. 당시 최종 코드 `main` SHA는 [`5c17255`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/5c172552a8145cec61ac8f1729b60b1514fc965d)였습니다. **이후 #306/#307이 병합됐으며 현행 기준은 문서 상단과 STATUS를 따릅니다.** **이 뒤의 문서 커밋을 포함한 최신 SHA의 CI는 별도로 확인해야 하며 이전 PR HEAD 검사 결과를 전용하지 않습니다.** 실제 학교 인증·팀원 4명 개인별 데이터/학수번호 132개 공식 매핑·NCP/PG/CLOVA 실행·포스터/모바일/스크린리더 사람 인수는 `NOT_RUN/CONFIGURATION_REQUIRED` 또는 미완료입니다. 운영 제품은 `RELEASE_BLOCKED`이며, 공개 GitHub Pages는 **실자료·외부 AI 호출 없는 합성 시연**으로 `main` push 때 자동 배포를 계속합니다. 원본 `csv/` 다섯 파일은 내용·경로/이름·인코딩·추적 상태를 그대로 유지합니다. 본선 전/후 담당자 책임과 개인 수락률은 합성 코드가 늘었다고 자동 상향하지 않습니다.

## 실환경 인수 현황

| 항목 | 상태 | 인수에 필요한 실근거 |
| --- | --- | --- |
| 프로젝트 범위 승인 | `OWNER_CONFIRMED_APPROVED` | 사용자 기준 승인. 현재 각 원본 제공자·학교권리 별도 |
| TypeScript/합성 HTTP/Chrome·격리 PG/NCP IaC | `TESTED_SYNTHETIC`/일회용 PG | 과거 통합 `48134da` Actions 4/4·새 PR #292/#293/#295/#304 각각 HEAD 4/4 성공. 이는 과거 `48134da` 기준 실험이며 이후 `462f6d3`·`d8e2144`의 main 4/4 CI는 별도 PASS 확인. 향후 문서 PR HEAD/merge SHA는 각각 별도 검증. 실 NCP와 다름 |
| Google OIDC/학교메일/BETA·REVIEWER 세션 | `CONFIGURATION_REQUIRED` | 실제 ID/메일·만료/철회·다른 사용자 부정시험 |
| 관리형 운영 PG·CA TLS·role/RLS·실 backup | `CONFIGURATION_REQUIRED` | 실제 migration/roles/RLS·복원 영수증 |
| 실제 학생 4명 매핑·인입/조회 | `NOT_RUN` | 현재 소유권·원본 SHA·동의·actor 연결·DB 적용/읽기/정정/철회 |
| 실제 NCP host·domain/TLS/ingress·비용 | `CONFIGURATION_REQUIRED/NOT_RUN` | 계정/VM/VPC/실 IP·비용·CPU/RSS·종료/반납 |
| CLOVA OCR/HCX Vision·실결제·native worker | `CONFIGURATION_REQUIRED/NOT_RUN` | 실제 공급자 비밀·호출/청구/timeout·취소·보호 |
| UI #258/학업 #260/비코드 #261 | `CLOSED` (본선 이전 이슈; #260은 `not_planned` 이관) | 남은 지정 담당자 교차 리뷰·실자료/사람 인수는 #280/#281/#282/#283 `NOT_RUN`, 원 이슈 완료와 별개 |
| 추천·미디어 독립 Gold | `EXCLUDED_BY_REQUEST / NOT_MEASURED` | 이번 작업에서 제외, 합성 평가를 실제 Gold로 주장 금지 |
| 프로덕션 공개 | **`RELEASE_BLOCKED`** | [#323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323)의 실제 운영·복구 및 [#325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325)의 권리·보안/릴리스 인수 후만 |

## 2026-11-06 당시 팀별 인수 배정표 (현재 배정 아님)

| 담당 | 본선 진출 전 — 정리 종결(CLOSED) | 본선 진출 이후 — 실제 운영/실자료 수락 |
| --- | --- | --- |
| 이의상 UI/접근성 | [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실 BETA UI·모바일/스크린리더/학업·경험 종단 |
| 김채윤 추천/공지 | [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 합성 코퍼스·정정/성능(순수 코어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료) | [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) 실제 허가 출처·추천 정확성 주장 방지/운영 실측 |
| 박준영 학업 | [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 합성/교차 검토; #260 PR #262 정책/테스트 완료, 소비자 리뷰는 미완료 | [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) 공식 RulePack·4인 학업 원장·8학기 개설 실증 |
| 이서연 비코드/운영 | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 계정·비용·권리 사전검토/문서 | [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) 실 NCP 계정·청구/복구/반납·실원본 이용권 검수 |

**공통 원칙:** 본선 전 11개 이슈는 CLOSED(10 completed, #260 사람 검수 미완료 이관), 본선 이후 실제 인수는 현재 **#321~#325 및 #317/#318의 7개 OPEN·전부 담당 지정** 상태입니다. 구 통합 #316·#276은 보관 CLOSED. 서버·운영은 이서연 #323, SQL·AI 영수증·보안/출시 통합은 심민성 #325, AI 모델/정확도는 이의상·박준영 #321/#322, 시연은 김채윤 #324가 담당합니다. 실제 NCP·실학생·법적 권리·사람 검토 결과는 증거가 없으면 NOT_RUN입니다.

과거 팀원 후속 #280~#283은 중간 통합 #276/#298로 이관된 뒤 CLOSED이며 실제 수락은 NOT_RUN이다. **현재 실인수/사람 검증은 지정된 #321~#325, #317/#318에서만 OPEN으로 추적**한다. 과거 #9/#10/#11/#12/#119/#258/#260/#261은 CLOSED이며, 기존 자료·키의 새로운 공개 업로드는 하지 않는다.

## 인계와 운영 원칙

1. 코드·문서 SHA와 CI는 공개 URL로 추적. 서버/IP/키/원본 대응표·학생별 동의 파일·실비용 영수증은 별도 최소권한 저장소에 기록.
2. 본선 이후 **NCP 계정·IAM·SKU·도메인/HTTPS·청구·복구**는 [이서연 #323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323), **Google/학교메일·관리형 PG·원본 권리·API/DB**는 [심민성 #325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325), **CLOVA/Laya/HCX 정확도**는 [이의상 #321](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321)·[박준영 #322](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322)에서 각자 증거를 기록합니다.
3. **현재 사람별 후속:** 이서연 웹·접근성 [#318](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318)·서버 [#323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323), 김채윤 시연/AI 검증 [#324](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324), 박준영 AI·학업 [#322](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322), 이의상 AI/NLP [#321](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321), 심민성 통합 [#325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325)·추가 기능 [#317](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317)에서 검증. 원래 #280~#283 및 #316은 기록용 CLOSED, 인적 실검수는 별도.
4. 실제 수락에는 테스트 HEAD·환경·권리/원문 판본·실행 명령·PASS/FAIL/HOLD/NOT_RUN/CONFIGURATION_REQUIRED·비용·rollback과 검증자 기록을 요구한다. 미실시 항목은 성공 처리하지 않는다.

[NCP 서버 운영 #323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) · [실인증·릴리스 #325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) · [코드 리뷰 #278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) · [코드 리뷰 #279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) · [팀 현황](TEAM_PROGRESS.md).
