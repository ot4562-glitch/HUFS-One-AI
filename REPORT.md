# HUFS One AI — 현재 검증 결과 보고 기준

제품을 평가할 때 **단위·통합 코드 → 합성 Chrome → 일회용 PostgreSQL → 독립 사람 검증 → 허가된 실제 운영환경**을 별도 증거로 기록합니다.

## 확인 가능한 구현

React/Vite의 상단 주요 메뉴(8개)·모바일 5탭·홈 요약/배너, 5개 합성 대상·40공고/10공지·EMPTY_DEMO/ADMIN 가상 동아리, API/PG/권한·AI 안전 계약/Temporal RAG·학업/계획 UI의 **합성 테스트**가 존재합니다. [UI PR #248](https://github.com/minseong-hufs/HUFS-One-AI/pull/248)의 동일 HEAD GitHub Actions 4개 workflow는 SUCCESS입니다. 진척 정본은 [STATUS](STATUS.md).

## 실제 아직 완료되지 않은 인수

- 독립 비작성자 Gold: 추천 **0/200**, 포스터 **0/20**, 시점 **0/12**.
- 실제 학교/학생 자료 4인·공식 RulePack/출처별 권리, 사람 스크린리더·브라우저 인수: 미완료.
- 실 Google/외대 메일/REVIEWER·운영 PostgreSQL/TLS/SQL role/복구·NCP·유료 OCR/HCX·Laya ON: 승인·실행 전.
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
관련 구현 #253 / 실환경 수락 #252:
```

상태를 올리려면 원본/역할·환경·정확한 SHA·반례·실제 검토자의 독립 근거가 필요합니다. **CI와 AI 자기 평가를 인적 승인으로 표시하지 않습니다.** [평가 방법](docs/INDEPENDENT_EVALUATION.md) · [인수서](docs/HUMAN_ACCEPTANCE_GATE_20261104.md).
