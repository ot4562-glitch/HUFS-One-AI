# HUFS One AI — 현재 검증 결과 보고 기준

제품을 평가할 때 **단위·통합 코드 → 합성 Chrome → 일회용 PostgreSQL → 독립 사람 검증 → 허가된 실제 운영환경**을 별도 증거로 기록합니다.

## 최신 코드 병합·검증 요약 (2026-11-06)

- [PR #292](https://github.com/ot4562-glitch/HUFS-One-AI/pull/292)(학업 독립 참조모형·탐색 예산) · [PR #293](https://github.com/ot4562-glitch/HUFS-One-AI/pull/293)(학사공지 SourceRevision/mock claim·clean HEAD 벤치) · [PR #295](https://github.com/ot4562-glitch/HUFS-One-AI/pull/295)(교과코드 미확인 원장/전망 `forecast-offering-v3`, API `NOT_CONNECTED`) · [PR #304](https://github.com/ot4562-glitch/HUFS-One-AI/pull/304)(공통 UI/발표 S04·공개 합성 Pages 자동배포 유지).
- 네 PR의 각 **PR HEAD** GitHub Actions 4/4 SUCCESS를 확인하고, 사용자의 일괄 병합 지시에 따라 squash merge했습니다. GitHub 리뷰는 `COMMENT` 중심이며 독립 사람의 `APPROVED`가 아닙니다. 병합된 마지막 코드 `main` SHA는 [`5c17255`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/5c172552a8145cec61ac8f1729b60b1514fc965d)입니다. **이 뒤의 문서 커밋을 포함한 최신 SHA의 CI는 별도로 확인해야 하며 이전 PR HEAD 검사 결과를 전용하지 않습니다.**
- 실제 학교 인증·팀원 4명 개인별 데이터/학수번호 132개 공식 매핑·NCP/PG/CLOVA 실행·포스터/모바일/스크린리더 사람 인수는 `NOT_RUN/CONFIGURATION_REQUIRED` 또는 미완료입니다. 운영 제품은 `RELEASE_BLOCKED`이며, 공개 GitHub Pages는 **실자료·외부 AI 호출 없는 합성 시연**으로 `main` push 때 자동 배포를 계속합니다. 원본 `csv/` 다섯 파일은 내용·경로/이름·인코딩·추적 상태를 그대로 유지합니다.
- #292 합성 학업 독립 모델·영역 분산 탐색 예산; #293 합성 공지 최신 revision/verified claim과 clean HEAD 벤치; #295 미확인 학수번호의 **코어만** 보수 처리, 실제 owner API 미연결; #304 상단 계정·보관함/폼/지원보드 합성 UI. 자동 CI·자체 리뷰를 독립 학칙/학생/스크린리더 검증으로 계산하지 않습니다.

## 확인 가능한 구현

React/Vite의 데스크톱 참고 11개 대분류 GNB/LNB·모바일 5탭·공통 헤더/홈 요약·배너, 5개 합성 대상·40공고/10공지·EMPTY_DEMO/ADMIN 가상 동아리, API/PG/권한·AI 안전 계약/Temporal RAG·학업/계획 UI의 **합성 테스트**가 존재합니다. [UI PR #248](https://github.com/ot4562-glitch/HUFS-One-AI/pull/248)의 동일 HEAD GitHub Actions 4개 workflow는 SUCCESS입니다. 진척 정본은 [STATUS](STATUS.md).

## 실제 아직 완료되지 않은 인수

- 독립 비작성자 Gold: 추천 **0/200**, 포스터 **0/20**, 시점 **0/12**.
- 실제 학교/학생 자료 4인·공식 RulePack/출처별 권리, 사람 스크린리더·브라우저 인수: 미완료.
- 실 Google/외대 메일/REVIEWER·운영 PostgreSQL/TLS/SQL role/복구·NCP·유료 OCR/HCX·Laya ON: 승인 범위와 별개로 **실환경 CONFIGURATION_REQUIRED/NOT_RUN**.
- 실제 서비스 품질/비용·시간 절감/정확도/회복성·수상/선정: 미측정 또는 근거 없음.

## 시험·보고 서식

```text
기능 / 사용자 여정 / 기능 소유자:
Git commit SHA / 테스트 명령 / GitHub Actions run:
환경: SYNTHETIC_LOCAL | DISPOSABLE_POSTGRES | CHROME | NCP_STAGING | PRODUCTION
자료: SYNTHETIC | APPROVED_PRIVATE | NOT_RUN
관측: PASS | FAIL | HOLD | NOT_RUN | SKIP
오류·재현/기대결과, 401/403/409/429/503/철회/캐시/동시성:
정확도·p95/CPU·RSS/비용(실측한 경우에만):
별도 승인 ID·비작성자 검토자/일시(있을 때만):
관련 코드 구현 #267~#275(병합 8건)·#277 및 #278/#279 / 실환경 수락 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276):
```

상태를 올리려면 원본/역할·환경·정확한 SHA·반례·실제 검토자의 독립 근거가 필요합니다. **CI와 AI 자기 평가를 인적 승인으로 표시하지 않습니다.** [평가 방법](docs/INDEPENDENT_EVALUATION.md) · [인수서](docs/HUMAN_ACCEPTANCE_GATE_20261104.md).


## 2026-11-06 추가 검증 메모

- [PR #278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) `forecast-offering-v2` 8학기·NOTICE_ONLY 합성 회귀 / [PR #279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) 40+10 합성 커버리지·경험 승인 신호: 두 PR 모두 `main` 병합, PR HEAD Actions 4/4 SUCCESS. 최종 코드 통합 [`48134da`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/48134dae3b16157ebcc294f744c320fdd64a115c)도 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752742)·Chrome·NCP offline·Pages **4/4 SUCCESS**. 이 결과는 합성/일회용 PG·오프라인 등 각각의 테스트 범위 한정.
- 실학교 자료·4명 현재 동의/본인 CSV 원장 연결·실 Google/PG/NCP/유료 AI/백업/요금·독립 Gold는 아직 PASS가 아니며 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) `RELEASE_BLOCKED`. 기존 수락 비율을 자동 상향하지 않음.
