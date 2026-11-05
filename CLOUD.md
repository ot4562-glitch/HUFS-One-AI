# HUFS One AI — 운영 배치·인증·NCP 안전 계약

**현재 단계:** 오프라인 IaC·SSH 전용 합성 preview·PG/권한/AI 어댑터 코드가 있고, **실 NCP 계정·DNS/HTTPS/Google/학교메일·운영 PG/유료 OCR/HCX는 인수 전**입니다. `RELEASE_BLOCKED` 및 `AI_ENABLED=false`/Laya OFF를 유지합니다.

## 공개 도메인과 접근권

실제 공개 도메인/서비스 승인은 아직 없습니다. 향후 운영한다면 **사용자 별도 지출·공개 승인 + #12 NCP 비코드 운영 + #252 실제 보안/권리 인수**를 통과해야 합니다. TLS/HTTPS, 정확한 Host/SNI, 직접 origin IP/IPv6/preview 차단, 익명 HTML/JS/API 자산 차단, Edge/WAF/Geo의 우회 시험은 각각 필요합니다. 한국 리전 선택은 한국 IP 한정 정책의 증거가 아닙니다.

Nginx 앞에 NCP LB/Edge가 있는 경우 **명시적으로 신뢰한 프록시 경계**에서만 원 IP를 복원하고, 두 독립 사용자 IP가 `request.ip`에서 구별되는지/임의 XFF 위조가 실패하는지 실증해야 합니다.

## 사용자 인증

- 서버 측 OIDC code exchange/PKCE/JWKS, 허용된 Google 인증, 현재 외대 이메일 수신 소유 OTP, 엄격한 session/CSRF·권한 철회와 역할별 독립 관리자/학생/REVIEWER.
- 심사자 초대는 32바이트 CSPRNG·해시·Google sub/email 연계·기한/철회·20인 기본 한도·합성 전용 데이터 경계. 발급/실발송은 별도 승인.
- 실 사용자/학생 자료는 본인의 현재 목적·SourceRights/SharingGrant·정확한 revision/asOf/retention이 없으면 차단.
- 미확인/미공유 상태는 `NOT_SHARED/UNKNOWN/NEEDS_REVIEW`, 네트워크/DB/AI 실패는 401/403/409/429/503 또는 안전한 보류.

## NCP/DB/AI

- NCP 계정·SKU·KRW/h/VAT·크레딧·저장/트래픽·서비스 quota·중지 상한/책임자는 운영자가 현재 콘솔과 견적으로 확인.
- 비공개 preview는 루프백 127.0.0.1 + SSH 터널의 합성 자료 전용. 공개/운영 모드 기동 가드를 강제로 우회하지 않음.
- 운영 PostgreSQL은 CA TLS·최소 역할/FORCE RLS·허가된 migration/role/EXCECUTE GRANT·백업/복원·재시작 철회·다중 인스턴스 부정시험 필요.
- OCR/HCX/선택 Laya는 출처/개인정보 외부전송 권리·비용 승인, token/usage/429/503·`UNKNOWN_BILLING` 재정산·CPU/RSS/OOM/p95·kill switch 검증 전 OFF.

**구현 잔여:** [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253) · **현장 수락/지출:** [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252), [#12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12) · **안전한 계획·복구:** [NCP 가이드](infra/ncp/README.md).
