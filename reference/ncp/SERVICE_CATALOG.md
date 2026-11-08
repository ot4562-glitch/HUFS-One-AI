# HUFS One AI — 현재 검토 대상 NCP 서비스

**선택 원칙:** 서비스 전체 카탈로그를 제품에 도입하지 않는다. 학생 데이터·학교 자료 이용권·실 NCP 비용/보안 승인이 없는 상태에서 필요한 기술과 **제외/후속** 기능을 명확하게 나눈다. 실제 리전·가격·서비스 지원·모델은 가입/개통 시점의 NCP 공식 자료에서 재확인한다.

| NCP 서비스/범위 | 현재 제품 설계 | 상태 |
| --- | --- | --- |
| Server(VPC), Cloud Block Storage, Public IP, VPC/ACG/NACL | Ubuntu x64 합성 비공개 SSH preview·승인형 staging 계획 | IaC/offline mock 코드 있음; **실 생성/과금 NOT_RUN** |
| Load Balancer/Global Edge/WAF/TLS/DNS | 독립 Google/메일 인가·직접 origin/IPv6·비인가 assets·KR Geo 우회 차단 | 운영 전 코드+보안 독립 인수 필요 |
| 서버 내 PostgreSQL TLS/최소 역할·백업 | Auth/Owner/SourceRevision/권한 영수증/AI budget·원장 | SQL/격리 PG 코드 존재, 운영 DB 미적용 |
| CLOVA General OCR | 허가된 포스터/PDF에서만 bbox·문단 근거 추출 | 프로토콜/권한·비용 코드 있음, 실 외부 호출 OFF |
| CLOVA OCR + CLOVA Studio HCX-007 | 검증형 4개 AI 제품 task의 필요한 후보 설명/구조화 | 구조화 요청/예산·검증 코드, 실 모델/청구 인수 전 |
| Laya 모델 (NCP 서비스 아님) | 비동기 분류 보조, CPUQuota/RSS/OOM·API 우선 | 코드 정책 존재, **기본 OFF**, 실호스트 수락 전 |
| Object Storage/모니터링·알림 | 허가된 증거의 비공개 저장/복구, 실비용/오류 알림 | 검토/선택 단계; 실제 사용·이용권 별도 |
| 기타 AI/DB/메시징·앱/모바일/전면 오프라인 | 핵심 개인화/학업/근거 기반 시연과 직접 관련 없는 서비스 | P2/P3 선택·현재 필수 운영 범위에서 제외 |

**실제 이용권/재배포·모델 전송은 자료별로 확인:** [학교 자료 허가](../hufsability/DATA_PERMISSION_GATE.md) · [데이터 거버넌스](../../docs/DATA_GOVERNANCE.md), [운영 비용](COST_AND_ARCHITECTURE.md).

**운영 책임:** 이서연 NCP 비코드/요금, 심민성 NCP 모든 코드/SDK/Worker/IaC. 실제 운영/공개는 사용자 별도 승인 및 [#252 D03](https://github.com/minseong-hufs/HUFS-One-AI/issues/252) 이후만. **RELEASE_BLOCKED**.
