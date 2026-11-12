# HUFS One AI — 현재 NCP 배치·운영 비용 확인 기준

**현재:** NCP 인프라 계획/SSH 비공개 합성 preview·Terraform IaC/worker 통합 코드가 존재한다. 프로젝트 승인은 `OWNER_CONFIRMED_APPROVED`이며 실제 서버·크레딧/과금·OCR/HCX·HTTPS/TLS/Google/PG 구성과 실행은 `CONFIGURATION_REQUIRED/NOT_RUN`이다. **RELEASE_BLOCKED/NO_GO**. [본선 전 사전 계획·공식 가격 출처·견적과 검수표](../../docs/OPERATIONS.md#prefinal-operations-plan)를 기준으로 계정별 견적을 확정한다.

**개발 책임:** 심민성 모든 API/SDK/AI/OCR/HCX/Laya·IAC/OS/배포 코드, **운영 책임:** 이서연 계정/IAM·리전/SKU/할당량·크레딧/요금·실호스트/비코드 증거, **최종 승인:** 사용자/자료·학교 권리자.

## 현재 후보 구성(실제 개통 사양 아님)

```text
승인된 사용자(인증/목적별 권리 확인)
    ↓ Nginx/LB/Edge/HTTPS·직접 IP/IPv6/Cache 거부(운영 구성·검증 후)
React / Fastify API (권한·SourceRevision·rule/AI)
    ├─ 최소 권한 PostgreSQL TLS/FORCE RLS·백업
    ├─ 허가 원문/미디어 비공개 저장 및 독립 검수
    └─ 필요시 CLOVA OCR/HCX + 예산·취소·rights guard
        └─ Laya 보조 격리 worker(기본 OFF)
```

**지금 가능한 단계:** `--plan`/offline mock과 로컬 합성 UI. 실제 서버의 SSH-only `127.0.0.1:5173` preview에는 대상 호스트·키·현재 계정 견적/예산·복구 구성이 필요하다. 승인 완료를 재요구하지 않으며, 합성 preview의 `APP_ENV=production` 거부·`AI_ENABLED=false` 및 Laya OFF 경계는 유지한다.

## 비용·요금 계산에 포함할 실값

| 항목 | 현재 확인해야 할 운영 증거 |
| --- | --- |
| 기본 서버 | 실제 한국 리전/zone의 지원 Ubuntu amd64 SKU·vCPU/RAM, 할인·시간 단가/최소 청구 |
| 저장·네트워크 | CB/스토리지·snapshot/backup, 공인 IP·트래픽/egress, VPC/ACG/NACL/Edge/WAF/TLS |
| CLOVA | OCR 건당/유지 비용, HCX-007 tokenizer·입/출력 토큰/요청·할당량/모델 버전, 과금 내역 |
| 선택 Laya | 모델 weight 이용권·CPU/RSS/OOM/배포 이미지/실호스트 측정·운영 중 비용 |
| 관리·종료 | VAT/크레딧·잔액/expiration, 1일 알림/하드 중단 상한, OS 패치·백업/복원·반납/미결제 확인 |

**정확한 현재 가격/SKU/계약·크레딧은 NCP 콘솔에서 개통 시점에 다시 확인**한다. 이전 조사에서 산출한 시급/예상 예산·가정 표를 현재 공식 견적이나 사용자 지출 승인으로 재사용하지 않는다.

- [NCP 공식 상품 목록](https://www.ncloud.com/product)
- [NCP 공식 요금](https://www.ncloud.com/charge/price/ko)
- [NCP Server/스토리지 요금](https://www.ncloud.com/charge/price/ko)
- [CLOVA Studio 모델 안내](https://guide.ncloud-docs.com/docs/clovastudio-model)
- [CLOVA OCR 안내](https://www.ncloud.com/product/aiService/ocr)

**제품 인수:** 실 Google·메일/PG/TLS/보안·비용·복구는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276), 실제 계정·견적/청구·권리·반납은 [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283). 사전 계획은 [운영 계획](../../docs/OPERATIONS.md#prefinal-operations-plan), 상세 설정은 [NCP 운영 정본](../../docs/OPERATIONS.md#ncp-operations-2026).
