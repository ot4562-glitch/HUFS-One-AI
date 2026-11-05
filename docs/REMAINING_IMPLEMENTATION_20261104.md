# HUFS One AI — 현재 남은 구현과 실인수

최신 코드는 [STATUS](../STATUS.md), **실제 구현/CI 누락은 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253)**, **권리·사람·실계정/NCP/출시 검증은 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)** 에서 관리합니다. 이 문서는 진행 지도를 제공하며 완료가 아닌 작업을 다시 완료로 선언하지 않습니다.

| 구분 | 현재 준비된 것 | 잔여 검증/구현 |
| --- | --- | --- |
| 웹/UX | 독립 상단 8개 주요 메뉴·모바일 5탭, 배너·홈 요약, 미지원 학교 메뉴, 합성/REVIEWER/EMPTY/가상 동아리 | 새 화면의 실제 스크린리더·기기 인수, 역할·캐시/철회/다중탭 실인증; 공고 카드 확장형 데이터 계약은 UI 담당과 조율 |
| API/OIDC/DB | Fastify·Zod, 권한/행동·7개 SQL 기본 역할과 확장 pool, OWNER/REVIEWER·CAS/영수증·admin usage 코드 | 완전한 production 조립, 운영 Google/학교메일/OTP, trusted proxy, 실제 독립 DB role/CA TLS/GRANT·다중 인스턴스/복구 |
| Source/RAG | 권리·불변 Revision·판본/asOf, 승인 egress, 이미지/PDF 근거·시점 검색·격리 PG | 실제 허가 출처·필드/재배포/AI 전송 권리 및 실 PG→React·독립 bbox/시점 판정 |
| AI/Laya | 4개 AI task/인용·취소/영수증·예산·OCR/HCX wire, native worker/시스템 정책, Laya 기본 OFF | 허가된 provider tokenizer/usage/비용·OOM/CPU/RSS/실호스트 인수, 원본/청구 불명 재정산 |
| 학업/실원본 | 학점·전공 What-if·RulePack 보류 코어·private intake plan/preview/apply | 실제 CSV 4개/Forms 26열·공식 학칙/4인 손계산·자료별 동의/철회 |
| 보안/운영 | 현재 Git 보호 경로 차단·publication/SBOM/API inventory, NCP plan/SSH 합성 preview/rollback 코드 | full private checkout/이력·clone/backup, native/폰트/모델 이미지 LICENSE, 실 NCP/TLS/비용·D03 |
| 계약/품질 | 현재 90 route/39 설계 계약/19 TASK 정적 원장·Chrome/PG CI | 설계 직접 미매핑 9개 분류, 동적 소비/타인 트랙 확인; Gold 0/200·0/32와 실제 스크린리더 미수락 |

**실현 순서:** P0 코드의 최소 운영 보안 경계·API/role/출처/AI·회귀 PR → 별도 승인된 실계정/실원본·비공개 NCP 운영 → 독립 사람 정확도·접근성/복구 → 최종 D03 GO. 실제 개인 원본·유료 API·서버 개통을 개발 편의로 실행하지 않음.

현재 공개 상태는 **`RELEASE_BLOCKED`**, 선택 Laya OFF, `AI_ENABLED=false`입니다. 실행 방법 [제품 런북](PRODUCT_ACTIVATION_RUNBOOK_20261105.md).
