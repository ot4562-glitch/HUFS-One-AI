# HUFS One AI — 현재 구현·검증 상태

**기준:** 2026-11-05 · `main` 코드 통합 커밋 [`856ea7536205ce7c133c9cf2cb270915ab5d6d27`](https://github.com/minseong-hufs/HUFS-One-AI/commit/856ea7536205ce7c133c9cf2cb270915ab5d6d27). 이 문서 이후의 문서-only 변경이 실제 실행 코드를 바꿨다는 뜻은 아닙니다. 항상 [현재 GitHub Actions](https://github.com/minseong-hufs/HUFS-One-AI/actions?query=branch%3Amain)에서 최신 SHA를 조회합니다.

**출시 판정: `RELEASE_BLOCKED / NO_GO`**. 공식 학교 서비스·실학생/실계정/운영 NCP·유료 OCR/HCX/Laya를 가동하거나 인수한 상태가 아닙니다.

## 현재 구현과 검증

| 범위 | main에 존재하는 코드 | 검증의 한계 |
| --- | --- | --- |
| 웹 | React/Vite, 독립 상단 8개 주요 메뉴·모바일 5탭, HUFSAbility 원래 메뉴 미지원 표시, 배너·홈 요약, 학생/REVIEWER·EMPTY_DEMO/가상 ADMIN | 합성 브라우저; 실제 스크린리더/실 Google 사용 전 |
| 공통 계산 | 40공고·10공지, 개인 추천·정정/근거, 일정·D-day, 졸업·What-if/중복·학업계획, 경험·북마크·행동 | 합성 자료/규칙 기준; 독립 사람 Gold와 공식 RulePack 미수락 |
| API·DB | Fastify·Zod, 권한·세션/초대·CAS·다중 역할/분산 quota, SourceRevision·Temporal RAG·이미지/PDF 근거, 실제 PostgreSQL opt-in 통합 시험 | production composition·운영 Google/학교메일/CA TLS/PG role GRANT·철회/복구 미수락 |
| AI | 승인 입력·4개 AI 작업·OCR/HCX 프로토콜·원자 예산/취소·Laya 격리·실행 차단 | 유료 공급자·실모델 품질/청구·실호스트 자원 실측 미실행 |
| 클라우드/릴리스 | NCP IaC·오프라인 mock·SSH 비공개 합성 preview·백업/rollback 관련 코드, privacy/publication/SBOM 감사 도구 | 실 NCP VM/SSL/Ingress/운영 복구·최종 배포 미실행 |

**UI 통합:** [PR #248](https://github.com/minseong-hufs/HUFS-One-AI/pull/248) 병합. 정확한 PR HEAD `fbbc6a5bbdb8b1300ab78560a21a1ef4a54473ed`에서 TASK-00(합성 계약·일회용 PG·revision claims), Chrome, NCP offline, Pages 합성 미리보기 **4개 워크플로 성공**. 이 판정은 해당 SHA의 자동 실행에 한정하며 실제 접근성·권리·출시 인수는 포함하지 않습니다.

## 현재 남은 작업 — 열린 담당 이슈 두 건

- **[#253 — 잔여 구현·코드·계약·CI](https://github.com/minseong-hufs/HUFS-One-AI/issues/253):** 운영용 구성/HTTPS·프록시/인증·최소 SQL 권한, 출처/AI/Owner 동적 연결과 부정시험, 설계 API 경로 직접 미매핑 9건의 필요/대체/차단 판정, native/asset 라이선스/문서 정합성.
- **[#252 — 실환경·인적·권리·출시](https://github.com/minseong-hufs/HUFS-One-AI/issues/252):** 실제 Google·외대 메일/REVIEWER, 승인된 NCP/PG/TLS/LB/복구, 4인 원본·공식 학칙·기관/학생 이용권, 독립 사람 평가/스크린리더, 비용·D03 GO/NO_GO.

관련 팀원 영역인 [#9 UI](https://github.com/minseong-hufs/HUFS-One-AI/issues/9), [#10 추천](https://github.com/minseong-hufs/HUFS-One-AI/issues/10), [#11 학업](https://github.com/minseong-hufs/HUFS-One-AI/issues/11), [#12 NCP 운영](https://github.com/minseong-hufs/HUFS-One-AI/issues/12), [#119 UI 통합](https://github.com/minseong-hufs/HUFS-One-AI/issues/119)은 원래 담당자가 유지합니다. **정본 이슈 수가 줄었다고 수락 조건이 충족되지는 않습니다.**

## 측정·권리·운영 사실

- 독립 사람 정답: 추천 **0/200**, 포스터 **0/20**, 시점/정정 **0/12**. AI 초안/합성 서명·평가 도구를 사람 Gold로 세지 않습니다.
- 참여 **5명 동의**와 HUFSAbility 자료 수집 허가는 사용자 확인 사항입니다. 실제 CSV/Forms 원본 제공자는 **4명**으로, 각 원본별 현재 목적·외부 전송·보관/철회·최초 Git 게시/backup 권리를 별도로 확인해야 합니다. 현 Git 보호 파일 경로 0과 조회 가능한 과거 6경로는 다르며 full private checkout 감사가 필요합니다.
- `GET /api/admin/usage`는 안전한 조회·별도 SQL role의 **코드**가 있으나 실제 운영 DB migration/EXECUTE GRANT/비밀 설정은 미적용. 측정하지 않은 token/error는 `NOT_COLLECTED`이지 0이 아닙니다.
- NCP `terraform apply`, 운영 Google OIDC/SMTP, 실제 PostgreSQL migration/복구, 유료 AI provider/Laya ON, 운영 서버 공개는 **승인/실행 전(해당 조건 NOT_RUN)**.
- **`AI_ENABLED=false` / Laya OFF / production 거부 유지**. 출처·학칙·권한이 불명확한 결과는 `UNKNOWN / NEEDS_REVIEW / NOT_SHARED`로 남깁니다.
- UI 배너 `hero.webp`는 팀원 제공 합성 이미지지만 생성 도구/이용 조건 확인 및 실기기 접근성은 최종 독립 인수 전입니다.

## 개발과 검증

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run check:privacy
npm run audit:api-contracts
npm run audit:entrypoints
npm run audit:licenses
npm run audit:sbom
npm run test:e2e:empty-demo
```

지원 Node 버전: `^22.22.2 || ^24.15.0`. 로컬 환경에 PostgreSQL/Chrome/native worker가 없을 경우 관련 테스트의 **SKIP/NOT_RUN을 별도 표시**해야 합니다. 실계정·결제/원본/클라우드 사용은 위 명령으로 승인되지 않습니다.

**사람 수행·출시 수락:** [인수 체크리스트](docs/HUMAN_ACCEPTANCE_GATE_20261104.md) · [운영 단계](docs/PRODUCT_ACTIVATION_RUNBOOK_20261105.md) · [데이터 권리](docs/DATA_GOVERNANCE.md).
