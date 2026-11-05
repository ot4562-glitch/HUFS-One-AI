# HUFS One AI — 합성 제품에서 운영 인수까지

**현재 상태: `RELEASE_BLOCKED/NO_GO`.** 실행 가능한 로컬 합성과 승인된 실제 NCP 운영은 별개의 단계다. 운영 계정·실사용자/개인정보·유료 AI/모델은 사용자·운영자·권리자의 **별도 명시 승인** 전에는 실행하지 않는다. 이 문서 작성이나 PR 병합은 인프라/요금/공개 허가가 아니다.

기술적 준비는 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253), 실제 보안/원본/인적 수락·D03은 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252), 클라우드 **비코드 운영·비용 승인 증거**는 [#12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12).

## 0. 소스·CI·권한 기준

- `main`의 **정확한 SHA와 해당 SHA의 GitHub Actions**(type/contract, Chrome, disposable PG, offline IaC, public artifact/secret boundary)를 기록한다. 이전 SHA 통과를 현재 PASS로 표시하지 않음.
- Node `^22.22.2` 또는 `^24.15.0`. 원본 보호 파일·키가 없는 승인된 checkout에서만 `npm ci --ignore-scripts --no-audit --no-fund`, `npm run check`, `npm run check:privacy`, `npm run assets:check` 실행.
- 사람 Gold/실원본·기관/공급자 이용권, `APP_ENV=production` 차단과 `AI_ENABLED=false`·Laya OFF가 유지되는지 검증한다.
- FAIL/SKIP/NOT_RUN·미설정 권한 포트·반환 코드 401/403/409/429/503는 강제로 우회하지 않는다.

## 1. 무료 로컬 합성 전체 시연

[기본 5가상 계정](DEMO_MANUAL.md)과 [EMPTY_DEMO+가상 동아리](EMPTY_DEMO_RUNBOOK.md)는 서로 다른 로컬 API 실행 모드로, 동시에 켜지 않는다. UI 메뉴 8개/모바일 5탭·개인화/공지/달력·졸업/What-if 보류·경험/보관함·관리자 게시·REVIEWER 합성/철회·RESET을 단계별 확인한다. 자동 E2E가 사람 실제 사용 수락을 대체하지 않음.

## 2. 개인정보·평가 선행 인수(클라우드 없이)

- 실제 비작성자 추천 **200건**, PNG/HTML 포스터 **20건**, Temporal 정정/시점 **12건**의 독립 판정·서명·근거·오판·P@3/nDCG/조건 recall을 [인적 평가](INDEPENDENT_EVALUATION.md)에 따라 기록. 현재 독립 Gold **0/200·0/32**.
- 실제 4명 CSV/Forms/RulePack은 승인된 제한 영역에서 **현재 목적별 동의·권리 ID**를 확인하고 원본 SHA/alias·4인 수기 학업 계산을 독립 대조. 5명 참여 동의·수집 허가는 각 원본의 Git 게시/외부 모델·NCP 전송 승인과 다르다.
- 승인되지 않은 학교/학생 원본·해당 실문서/사진·비밀키/토큰을 Git·이슈·CI·외부 AI로 전송하지 않는다.

## 3. NCP 계획 전용(지출 0)

NCP 코드 심민성·운영 이서연·사용자 승인권자가 **실계정/SKU/리전/권한·VAT 포함 예상 비용·상한·중지/반납 책임**을 확인하기 전에는 plan 이상으로 진행하지 않는다.

```sh
node infra/ncp/setup/00-preflight.mjs --example
node --test tests/security/ncp-setup-plan.test.mjs
```

예시 입력은 가상 설정일 뿐 실제 승인된 견적/리전/IAM·호스트 SSH 키가 아니다. 최종 계획은 비밀 없는 `plan` SHA·승인 ID·허용 관리자 공인 IPv4/32/ACG/NACL/포트/비용으로 보관한다. `terraform apply`, VM 생성, `-Apply`, 실제 SSH 전송/유료 provider 호출을 임의로 하지 않는다.

## 4. 승인된 비공개 NCP 합성 미리보기

오직 별도 승인된 실제 NCP 환경에서만 합성 allowlist ZIP/SHA→SFTP/SSH→Ubuntu systemd **127.0.0.1:5173** 미리보기를 계획/적용한다. SSH 지문·독립 키 로그인 뒤 root/password SSH 거부, VPC/ACG/NACL/UFW·외부 80/443/API/PG/preview 원본 차단, 부팅/재기동/헬스·실제 CPU/RSS·p95/비용·rollback 증거를 얻는다.

**이 단계에서 허용되지 않는 것:** public HTTPS, 실제 Google/학교메일, 실학생 원본, 유료 HCX/OCR/Laya ON, 외부 접근. 비공개 preview PASS가 전기능 운영 허가가 아님.

## 5. 제품용 staging 코드·보안/인수

운영 조립 `production composition root`·실 Google OIDC/메일 OTP·최소 역할 PG CA TLS/FORCE RLS·생산 미디어/AI worker·Nginx/LB/WAF/Edge TLS·캐시/클라이언트 IP·도메인/직접 origin/IPv6 차단이 **코드 #253과 실제 운영 #252에서 모두 통과**되어야 한다.

기능별 승인된 합성 사용자와 별도 실제 계정으로 **React→API→PG→SourceRevision/인용/권한/정정/철회**를 확인한다. 네트워크/공급자 장애·2탭/late response/세션 만료·마감·UNKNOWN·rollback, 학교 학사·개별 원본과 유료 모델 입력은 현재 별도 권리 검증 뒤에만. LB 앞단이라면 실제 **서로 다른 두 사용자 IP**가 서버 `request.ip`로 보존되고 임의 XFF가 무효함을 확인한다.

## 6. D03 공개 여부·복구

현재 기본은 `NO_GO/RELEASE_BLOCKED`. [A01–D03 인수서](HUMAN_ACCEPTANCE_GATE_20261104.md)에서 모든 적용 필수 실제 증거/인적 독립 승인이 확인되면 권한 있는 사람이 서면 GO를 결정할 수 있다. 공개 뒤 OS/Node/worker/비밀 회전·RLS·PG backup/restore·권리 철회/삭제·비용 hard stop/알림·rollback·서버 중지/반납/청구 종료를 운영 절차로 유지해야 한다.

## 검증 영수증

```text
Phase/기능 · 대상 Git main SHA/Actions:
환경 LOCAL_SYNTHETIC | DISPOSABLE_PG | NCP_PRIVATE_PREVIEW | NCP_STAGING | PRODUCTION:
운영·요금 승인 ID / 기관·자료·외부 AI 권리 ID (민감값 제외):
실제 계정 역할/단말/OS/브라우저:
명령/입력(합성 또는 개별 허가)·부정시험/실측:
PASS | FAIL | HOLD | NOT_RUN | SKIP:
검토자/날짜(KST)·실제 비작성자 여부:
성능·청구·오류·복구 및 미해결 위험:
#253 결함 PR / #252 인수 ID:
출시 판정 NO_GO | GO (별도 서명 근거):
```

세부 운영 설정: [NCP 가이드](../infra/ncp/README.md) · [실무 인계](../infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md).
