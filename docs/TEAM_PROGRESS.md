# HUFS One AI — 현재 팀 수락 게이트

이 표는 **복합 인수 조건의 충족률**이지 개인 능력·실제 서비스 가동률·코드 완성률이 아닙니다. PR 증가/합성 검사 성공·이슈 통합으로 숫자를 임의 상향하지 않습니다. 운영·학생 원본 검증은 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276), 코드 현재 상태는 [STATUS](../STATUS.md)를 기준으로 판단합니다. 이전 #252/#253/#257은 잔여 운영 항목을 #276에 이관하고 종료했습니다.

| 담당 | 현재 수락 / 고정 조건 | 아직 충족하지 못한 핵심 |
| --- | --- | --- |
| 심민성 `ot4562-glitch` | **7/12 (58.3%)** | 실 OIDC/학교 메일·운영 PG/NCP/TLS·원본 Git/목적별 권리·실 UI/API 소비/독립 사람 Gold |
| 이의상 `uisang2004-maker` | **9/12 (75.0%)** | 실제 스크린리더·모바일/데스크톱·학업/지원 UI·운영 권한/실기기 E2E |
| 김채윤 `qamarrchae` | **7/12 (58.3%)** | 비작성자 추천 Gold·공식 출처 이용권/정정·실 정확도·운영 피드 통합 |
| 박준영 `taewangim-alt` | **8/12 (66.7%)** | 학교 공식 RulePack·4인 학사 결과 독립 대조·owner/React 종단 |
| 이서연 `lhh42001` | **1/5 (20.0%)** | 승인된 NCP 계정/리전/SKU/실비용·실서버/서비스 이용권·CPU/RSS/백업·중단/반납 운영 영수증 |

## 2026-11-06 병합·교차 검토(위 수락 비율과 분리)

- [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278): 박준영 `forecast-offering-v2` 과거 8학기·`NOTICE_ONLY` 합성 코어 리뷰/병합 완료. 학사 공식 근거·4인 원장/UI 수락은 #11/#260에 남음.
- [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279): 김채윤 40+10 합성 코퍼스 분포·경험 승인 추천 코어 리뷰/병합 완료. [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259) 순수 코어 완료, UI #258/실사용자·실 모델/추천 독립 Gold는 남음.
- 코드 통합 기준 `48134da` GitHub Actions 4/4 SUCCESS. **위 7/12·9/12·7/12·8/12·1/5 수락 비율은 새로운 독립 수락 증거가 없으므로 올리지 않음**.
- `csv/` 5개 원본(Forms 1·이수 CSV 4) 복구 보존은 완료, 학생별 현재 actor/rights/동의·실 NCP/PG 연결은 #276에서 미완료.

## 2026-11-06 후속 코드 PR #285–#289(인적 수락 비율과 분리)

- **이의상 UI [#285](https://github.com/ot4562-glitch/HUFS-One-AI/pull/285):** 경험→AI 후보→학생 승인 3단계 **합성 미연결 컴포넌트**를 통합. 실제 라우트/API는 [#284](https://github.com/ot4562-glitch/HUFS-One-AI/issues/284)/[#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258)/[#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280)에 남음.
- **김채윤 추천 [#286](https://github.com/ot4562-glitch/HUFS-One-AI/pull/286):** 별도 5-chain 정정 overlay와 격리 결정성, 합성 1k/5k/15k 벤치 보고. clean HEAD/실서비스 성능과 독립 Gold는 여전히 미인수([#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10), [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281)).
- **박준영 학업 [#287](https://github.com/ot4562-glitch/HUFS-One-AI/pull/287)·[#288](https://github.com/ot4562-glitch/HUFS-One-AI/pull/288)·[#289](https://github.com/ot4562-glitch/HUFS-One-AI/pull/289):** 영역 이동 RulePack 비교 안전화, rolling-origin 반례, 학점 원장 속성 범위 문서화. 공식 학칙·실원장·수기 결과·교차 UI 리뷰는 #11/#260/#282 OPEN.
- 5개 PR의 AI 보조 `COMMENT` 리뷰는 **독립 사람 APPROVE/Gold가 아님**. **기존 인적 수락 비율 7/12·9/12·7/12·8/12·1/5는 변동 없음**. 실서비스는 `RELEASE_BLOCKED`.

### 이의상 UI 후속 [#290](https://github.com/ot4562-glitch/HUFS-One-AI/pull/290)

11대분류 GNB/분류 배너·LNB, 홈 P001·공고 3단 행 합성 리디자인과 4종 HEAD CI SUCCESS 확인. 5개 핵심 탭 및 미지원 메뉴 경계 유지. 이 변경은 [본선 전 #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)의 코드 작업으로만 체크했으며 실제 모바일·NVDA·권한/공식자료 인수 및 고정 수락 비율 **9/12는 변경하지 않음**. 현장 수락은 #280.

## 본선 진출 전/후 업무와 운영 수락(별도)

| 담당 | 본선 진출 전 — 계속 진행 | 본선 진출 이후 — 실제 운영/실자료 수락 |
| --- | --- | --- |
| 이의상 UI/접근성 | [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실 BETA UI·모바일/스크린리더/학업·경험 종단 |
| 김채윤 추천/공지 | [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 합성 코퍼스·정정/성능(순수 코어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료) | [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) 실제 허가 출처·추천 정확성 주장 방지/운영 실측 |
| 박준영 학업 | [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 합성/교차 검토; #260 PR #262 정책/테스트 완료, 소비자 리뷰는 미완료 | [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) 공식 RulePack·4인 학업 원장·8학기 개설 실증 |
| 이서연 비코드/운영 | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 계정·비용·권리 사전검토/문서 | [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) 실 NCP 계정·청구/복구/반납·실원본 이용권 검수 |

**공통 원칙:** 본선 전 이슈의 합성 개발·사전 검토는 **OPEN**, 본선 이후 이슈는 **OPEN/NOT_RUN**이며 실제 NCP·SQL/AI/비밀키/운영자 구성과 실서비스 통합은 오너 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)이 총괄합니다. 본선 전 이슈 완료가 본선 이후 실서비스 인수 완료는 아닙니다. 원본 `csv/` 5개는 수정·삭제하지 않고 운영/배포/CI 번들에 포함하지 않습니다. 독립 사람 Gold는 현재 범위에서 제외되며 PASS 아님.

**현재 수락 비율은 변경하지 않습니다.** 이슈를 분리/배정한 사실은 실 계정/학생·자료권리·실 기기·비용·학칙/기관 인수의 PASS가 아닙니다.

## 수락 기준

- **코드/합성:** UI/코어·API/RLS/비동기·일회용 PostgreSQL·Chrome·IaC mock·NCP 비공개 합성 preview 자동화가 존재한다. 해당 SHA에서 테스트 범위 확인 후만 인정한다.
- **사람:** 원문 작성자와 구분된 실제 reviewer가 200 추천·20포스터/12시점·학사/권리·접근성을 검토하고 신뢰할 수 있는 서명/실행일·근거를 남겨야 한다. 현 독립 Gold **0/200·0/32**.
- **자료:** 5명 참여동의 및 HUFSAbility 자료 수집 허가는 사용자 확인, 실제 원본 4명 목적별 현재 허가·철회/보관/최초 Git 게시·NCP/모델 외부 전송 범위와는 별도.
- **운영:** 실 Google OIDC/외대 메일·REVIEWER/학생 간 격리, 7개 기본+실제 활성 PG 역할/TLS·복구, NCP TLS/원본 IP·비용·실 공급자, 독립 GO/NO_GO. 현재 **RELEASE_BLOCKED**.

## 증거 확인 방법

```text
담당/수락 ID:
대상 코드 SHA, 테스트/브라우저/PG/NCP 환경:
실행 결과 및 근거 URL/비공개 ID(민감값 제외):
PASS | FAIL | HOLD | NOT_RUN | SKIP:
검토자·실행일(KST) / 작성자와 분리 여부:
잔여 보안·법적·출시 제약:
```

**절대로** AI 자체 평가/기술 PR 병합을 독립 사람 정답·학교 공식 승인으로 승격하지 않습니다. 개발 역할은 [WORKSTREAMS](WORKSTREAMS.md), 릴리스 차단은 [STATUS](../STATUS.md).
