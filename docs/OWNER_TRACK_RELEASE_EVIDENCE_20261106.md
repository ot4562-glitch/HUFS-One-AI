# HUFS One AI — 코드·원본·운영 실행 증거 원장 (2026-11-06)

> **기준:** `OWNER_CONFIRMED_APPROVED`는 프로젝트 승인이다. 개인별 현재 동의·권리, 실 Google/학교메일·NCP/TLS·DB CA·모델·운영비·실학생·사람 인수 통과를 의미하지 않는다. 운영 잔여 단일 이슈 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276). 현행 구현 상태 [STATUS](../STATUS.md).

## 병합된 PR 근거

| 코드/자료 | PR 또는 commit | 확정된 사실 | 여전히 미검증 |
| --- | --- | --- | --- |
| 운영 API/계약/권한·AI budget/Source/경험 HTTP | [#267](https://github.com/ot4562-glitch/HUFS-One-AI/pull/267)~[#275](https://github.com/ot4562-glitch/HUFS-One-AI/pull/275) 중 실제 합병된 #267/268/269/270/272/273/274/275 | 단계별 코드·합성/일회용 PG·브라우저/오프라인 CI | 실제 운영자 키·Google·DB·CLOVA·학생 실동의 |
| BETA 본인 CSV 학업 화면/운영 요청 포트 | [#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277) MERGED | 5개 CSV SHA 보존, `/api/private-intake/self` 브라우저 계약, BETA 읽기 UI와 인증된 actor 요구 | 실제 operator private registry/loader와 4명 매핑·로그인/DB readback |
| 전망/rolling-origin 8학기·NOTICE_ONLY | [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) MERGED (`5a36a38`) | `forecast-offering-v2`, 합성 경계·정합성 테스트, PR HEAD 4/4 CI | 학교 8학기 정식 목록·과목 동등성·실사용자 공식 판단 |
| 추천 코퍼스·경험 승인 신호 | [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) MERGED (`48134da`) | 40+10 합성 분포, 키워드/인용·동의/버전·철회·결정론 테스트, PR HEAD 4/4 CI | 실문장 품질·revision chain 0건, UI #258·실원본 권리·독립 Gold |
| 비전공자 설치/제품 안내 | [문서 commit `a0043c5`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/a0043c569dd0518919b9f3ed243c9d8836a66403) | 새 가이드 3개와 README 하단 중요 문서 연결 | 실제 NCP/제품/에이전트 설치 **NOT_RUN** |

기존 대형 PR **#264는 분할 대체로 미병합 종료**. #252/#253/#257 완료/종료 후 잔여 운영 업무는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에 이관. 코드 통합 기준 [`48134da`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/48134dae3b16157ebcc294f744c320fdd64a115c)의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752742) · [Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752741) · [NCP offline](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752743) · [Pages synthetic](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752761)은 **4/4 SUCCESS**. 이 기록은 정확히 **해당 SHA에 한정**되며 문서 커밋 이후의 HEAD CI는 다시 확인한다.

## `csv/` 다섯 원본의 현재 상태(공개 자료 내용 재인용 금지)

- Forms **1개**, 표 구조 **26열·4개 응답**; 수강 CSV **4개·총176행·6열**, **학수번호 공란 132행**. 과거 ‘수강 CSV 3개/총128행/4번째 부재’ 기록은 **2026-11-06 복구 이전의 불완전한 검색 결과**이며 현행 상태가 아니다.
- Git의 **정확한 다섯 원본 파일 경로/blob SHA**를 `tools/verify_release_boundary.py`에서 검사한다. 무단 삭제·수정·이동·재인코딩 금지; 추가 CSV/키·SID/identity map은 공개 반입 금지. 권리자 철회·삭제는 별도 법적 의무에 따름.
- 파일은 Git에 있다고 자동으로 로그인 사용자와 연결되지 않음. **실제 Forms row↔CSV 파일↔본인 BETA actor↔동의·rights·해시**의 비공개 attest/DB source·회수 검증이 필요. 과목코드 공란 때문에 공식 course identity/RulePack·학점 사정 확정은 `UNKNOWN/NEEDS_REVIEW`.
- PR #277은 BETA UI/route 연결 **코드**이고 운영용 `OperatorPostgresInputs`·실비밀 factory·loader·4명 identity attestation은 **현장 구성/추가 조립 검증 필요**. 실 NCP/PG로 import/readback을 수행한 증거 없음.

## 실환경 인수 현황

| 항목 | 상태 | 인수에 필요한 실근거 |
| --- | --- | --- |
| 프로젝트 범위 승인 | `OWNER_CONFIRMED_APPROVED` | 사용자 기준 승인. 현재 각 원본 제공자·학교권리 별도 |
| TypeScript/합성 HTTP/Chrome·격리 PG/NCP IaC | `TESTED_SYNTHETIC`/일회용 PG | 코드 통합 SHA `48134da` Actions 4/4 성공. 실 NCP와 다름 |
| Google OIDC/학교메일/BETA·REVIEWER 세션 | `CONFIGURATION_REQUIRED` | 실제 ID/메일·만료/철회·다른 사용자 부정시험 |
| 관리형 운영 PG·CA TLS·role/RLS·실 backup | `CONFIGURATION_REQUIRED` | 실제 migration/roles/RLS·복원 영수증 |
| 실제 학생 4명 매핑·인입/조회 | `NOT_RUN` | 현재 소유권·원본 SHA·동의·actor 연결·DB 적용/읽기/정정/철회 |
| 실제 NCP host·domain/TLS/ingress·비용 | `CONFIGURATION_REQUIRED/NOT_RUN` | 계정/VM/VPC/실 IP·비용·CPU/RSS·종료/반납 |
| CLOVA OCR/HCX Vision·실결제·native worker | `CONFIGURATION_REQUIRED/NOT_RUN` | 실제 공급자 비밀·호출/청구/timeout·취소·보호 |
| UI #258/학업 #260/비코드 #261 | `OPEN` | 담당자 교차 검토·인수·사람 테스트 |
| 추천·미디어 독립 Gold | `EXCLUDED_BY_REQUEST / NOT_MEASURED` | 이번 작업에서 제외, 합성 평가를 실제 Gold로 주장 금지 |
| 프로덕션 공개 | **`RELEASE_BLOCKED`** | [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)의 실환경·권리·복구 조건 후만 |

## 팀원 실환경 인수의 전/후 이슈 분리(2026-11-06)

| 담당 | 본선 진출 전 — 계속 진행 | 본선 진출 이후 — 실제 운영/실자료 수락 |
| --- | --- | --- |
| 이의상 UI/접근성 | [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실 BETA UI·모바일/스크린리더/학업·경험 종단 |
| 김채윤 추천/공지 | [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 합성 코퍼스·정정/성능(순수 코어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료) | [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) 실제 허가 출처·추천 정확성 주장 방지/운영 실측 |
| 박준영 학업 | [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 합성/교차 검토; #260 PR #262 정책/테스트 완료, 소비자 리뷰는 미완료 | [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) 공식 RulePack·4인 학업 원장·8학기 개설 실증 |
| 이서연 비코드/운영 | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 계정·비용·권리 사전검토/문서 | [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) 실 NCP 계정·청구/복구/반납·실원본 이용권 검수 |

**공통 원칙:** 본선 전 이슈의 합성 개발·사전 검토는 **OPEN**, 본선 이후 이슈는 **OPEN/NOT_RUN**이며 실제 NCP·SQL/AI/비밀키/운영자 구성과 실서비스 통합은 오너 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)이 총괄합니다. 본선 전 이슈 완료가 본선 이후 실서비스 인수 완료는 아닙니다. 원본 `csv/` 5개는 수정·삭제하지 않고 운영/배포/CI 번들에 포함하지 않습니다. 독립 사람 Gold는 현재 범위에서 제외되며 PASS 아님.

팀원 후속 이슈 #280~#283은 **추적용 OPEN/NOT_RUN**이고, 실제 권리·계정·비용·인증·원본 서버 반입이 완료됐다는 증거가 아닙니다. 합성/비코드 현행 이슈 #9·#10·#11·#12·#119·#258·#260·#261도 OPEN 유지. 기존 자료·키의 새로운 공개 업로드는 하지 않습니다.

## 인계와 운영 원칙

1. 코드·문서 SHA와 CI는 공개 URL로 추적. 서버/IP/키/원본 대응표·학생별 동의 파일·실비용 영수증은 별도 최소권한 저장소에 기록.
2. 본선 진출 후 승인된 실제 NCP 계정/IAM·SKU·도메인/HTTPS·원본 권리·Google/메일/관리형 PG·CLOVA와 예산·원격 복구를 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에서 일괄 인수한다.
3. UI 담당 [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258), 추천 [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10), 학업 [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11)·[#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260), 비코드 [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261)과 정확한 계약 소비자 검증. [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259) 순수 코어는 완료 처리했으나 UI/실사용은 완료하지 않았음.
4. 실제 수락에는 테스트 HEAD·환경·권리/원문 판본·실행 명령·PASS/FAIL/HOLD/NOT_RUN/CONFIGURATION_REQUIRED·비용·rollback과 검증자 기록을 요구한다. 미실시 항목은 성공 처리하지 않는다.

[운영 인수 #276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) · [코드 리뷰 #278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) · [코드 리뷰 #279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) · [팀 현황](TEAM_PROGRESS.md).
