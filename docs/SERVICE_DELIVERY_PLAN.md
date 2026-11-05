# HUFS One AI — 서비스 완성·승인된 운영·유지보수

## 현재 단계

**실행 가능한 합성 제품과 오프라인 통합검증 코드가 존재하지만 운영 인수 전**입니다. React/Vite·Fastify/SQL·Source/AI/NCP 자동화는 합성/일회용 PostgreSQL과 정확한 SHA의 CI 범위 내에서만 준비된 것으로 판정합니다. **실제 학교 계정·자료별 권리·NCP/유료 공급자·공개 서비스 승인 미완료 — RELEASE_BLOCKED/NO_GO.**

## 네 개의 완료 축

| 축 | 담당 | 증거와 완료 조건 |
| --- | --- | --- |
| 1. 제품·코드 | 심민성/이의상/김채윤/박준영 | 최신 HEAD 코드/설계 계약·정상/거부/철회/late-response, Chrome/DB/CI, 실제 사용 중 미지원 표시 |
| 2. 독립 사람·자료 | 비작성자 검토자/원본 제공자/공식 자료 책임자 | Gold 추천 200+미디어/시점32·4인 공식 원장/RulePack·스크린리더·목적별 권리/현재 철회 증거 |
| 3. NCP·실 운영 | 이서연 비코드 운영, 심민성 개발, 사용자 최종 비용 승인 | 실제 계정/SKU/요금·LB/TLS/Google/메일/PG·CPU/RSS/p95·backup/restore/반납·secret/위협 부정시험 |
| 4. 출시·유지보수 | 최종 승인권자 및 담당자 | D03 서면 GO와 보안·출처/저작권·운영 대응, 배포/롤백·패치·키회전·개인정보 삭제·비용 hard stop |

## 구현·인수의 선행 순서

1. [#253 잔여 구현](https://github.com/minseong-hufs/HUFS-One-AI/issues/253)에서 prod composition/OIDC/SQL role/프록시·권리/AI·9개 설계 경로/CI·산출물 증거를 정리.
2. 실제 비용과 원본 처리 범위를 사용자/운영자가 명시 승인한 뒤 [#252 현장 수락](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)의 실계정·비공개 NCP·PG/복구·사람/데이터 검증 실행.
3. 적용 필수 보안/권리·독립 Gold·기기/성능·유지보수·GO 서명이 모두 충족될 때만 공개. 미충족이면 fail-closed/NO_GO 유지.

## 유지보수 책임

승인된 서비스에서는 OS·Node·네이티브/의존성 보안 패치, 인증 토큰·키 회전, RLS·세션 철회/접근권 변화, 백업/복원과 개인정보 삭제·SourceRevision 정정 반영, 장애 알림·NCP 비용/CPU·API p95, 중단·반납/최종 비용 청구 종료를 정기 검수합니다.

**현재 실제 운영 유지보수를 수행했다고 표시하지 않습니다.** [STATUS](../STATUS.md) · [NCP 운영](NCP_OPERATIONS_2026.md) · [인수서](HUMAN_ACCEPTANCE_GATE_20261104.md).
