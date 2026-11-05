# HUFS One AI — 실제 환경·사람·권리 수락 체크리스트

**현재 정본:** [#252 — 실환경·자료권리·인적 독립 검증·D03](https://github.com/minseong-hufs/HUFS-One-AI/issues/252). 필요한 코드 수정은 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253)에서 진행합니다. 아래 모든 체크박스는 **미수락**이며 GitHub PR/CI 통과나 이슈 종료만으로 자동 체크하지 않습니다. `RELEASE_BLOCKED/NO_GO`.

## A — 개발·보안 독립 리뷰

- [ ] **A01:** 최신 통합 SHA의 API/OIDC/OTP/SQL RLS·권한·캐시/원본 비노출·철회·재기동을 비작성자 실제 리뷰어가 검증.
- [ ] **A02:** NCP 리전/SKU·VPC/ACG/NACL·IAM·비용·무단 적용 방지/계획 SHA를 운영자가 검수.
- [ ] **A03:** 승인된 Windows/Ubuntu/SSH fingerprint·systemd/UFW·실배포/배포 실패/last-good rollback을 별도 실환경에서 독립 검토.
- [ ] **A04:** 정확한 패키지 SHA·소스맵/원본·키/학교 자산 차단, native/Python/font/model/생성형 이미지 라이선스·NOTICE/SBOM, 리뷰/CI와 운영 보안을 대조. `hero.webp`의 생성 도구/이용 조건도 확인.

## B — 인증·DB·원본/개인정보

- [ ] **B01:** Google OIDC/JWKS/PKCE/현재 외대 메일 소유·OTP·BETA/ADMIN/REVIEWER·초대 서명/만료·철회/다중탭/401·403·409·429·503을 실제 승인된 브라우저/계정으로 시험. 학교 SSO로 과장 금지.
- [ ] **B02:** 기본 7+활성 확장 PostgreSQL role, CA TLS/FORCE RLS/세션·영수증/다중인스턴스 quota/SQL 직접 접근/백업·재시작/복구·rollback. `GET /api/admin/usage` 전용 role/function GRANT는 실제 적용·최소 권한 증거 후만 인정.
- [ ] **B03:** 참가 5명 동의와 실제 원본 4명 구별; Forms 26열/4응답·CSV 6열/4파일의 owner/alias·중복·학점·재수강·원본 SHA/현재 동의·보관/철회/공개·외부 모델/NCP 전송 권리를 private 원장으로 확인. 실제 4인 졸업/What-if/추천·공식 RulePack 문서 판본/조항을 사람 손계산으로 대조.
- [ ] **B04:** 제한된 full private checkout privacy 검사와 보호 원본 Git 도달/비도달 이력·clone/fork/backup, 최초 게시/외부 접근·삭제/철회 권리 독립 감사. 현재 트리 금지 경로 0과 과거 조회 가능 6경로/기존 2 FAIL은 별개이며 원문/SID를 공개하지 않는다.

## C — NCP·실서비스 보안(별도 사용자 지출/배포 승인 후만)

- [ ] **C01:** NCP 비코드 담당자 및 최종 사용자 서면 지출 승인, 계정/IAM·리전/SKU/Ubuntu 이미지·크레딧/요금/VAT·hard stop·반납/결제 종료.
- [ ] **C02:** 실제 VPC/ACG/NACL/UFW, 관리자 공인 IPv4/32 SSH만 허용, 공개 preview/API/PG·직접IP/IPv6/다른 host/Geo 우회 거부.
- [ ] **C03:** SSH host key/관리키 안전 검증, 별도 키 로그인 후 root/password 차단·Ubuntu systemd/보안 patch/secret·재부팅 인수.
- [ ] **C04:** 정확한 합성 ZIP SHA만 127.0.0.1:5173 SSH 터널로 미리보기. 실학교/학생·Google·유료 모델·공개 포트 OFF; 실제 기동·CPU/RSS/요금/재시작 기록.
- [ ] **C05:** 잘못된 SHA/partial deploy/timeout·DB backup/restore/철회 보존·last-good rollback/키 회전·운영 종료/반납 드릴.
- [ ] **C06:** 승인된 staging에서 실제 TLS/SNI/Edge/LB/WAF, pre-login HTML/JS/API/media/CDN 접근 거절·직접 원본 IP/IPv6/preview·한국 지역 접근 정책/host 검증. LB 앞단의 **서로 다른 두 사용자 IP가 API request.ip에 구분**되고 비신뢰 XFF 위조가 실패해야 함.

## D — 독립 품질·기기·출시

- [ ] **D01:** 추천 40공고×5가상 슬롯 **200/200** 및 포스터 **20/20**·시점/정정 **12/12**를 실제 비작성자가 판정·서명, 개별 근거/false ELIGIBLE·P@3/nDCG@3/조건 precision/recall과 연결. 현재 Gold **0/200·0/32**.
- [ ] **D02:** 360px 실기기·키보드/스크린리더/alt·카드/요약/메뉴·REVIEWER/EMPTY_DEMO·가상 ADMIN 게시→재승인→철회, 권한·네트워크/캐시·다중탭·401/403/409/503, 60초 시연/10분 발표·5분 Q&A를 비작성자가 직접 인수.
- [ ] **D03:** 모든 적용 필수 A01–D02 증거·데이터 권리·서비스 비용/복구·기관/사용자 책임자가 실제 `GO` 서면 승인할 때만 출시 차단 해제. **미실행/미허가/미완료는 NO_GO.**

## 결과 기록

```text
수락 ID / 정확한 main·RulePack·fixture·model SHA:
실제 환경·기기/OS/브라우저·계정 유형:
검토자(비작성자 여부) / 실제 검토시각(KST):
운영 비용·자료/학교 원본 허가 ID(비밀/실명 제외):
실행/부정시험/기대/실제·로그/스크린샷(민감정보 삭제):
PASS | FAIL | HOLD | NOT_RUN:
정확도/성능/요금(측정된 값만):
수정 PR(#253) / 재검수·rollback:
D03 GO(서면 증거 필요) | NO_GO(기본):
```

**실행 기준:** [제품 활성화 런북](PRODUCT_ACTIVATION_RUNBOOK_20261105.md) · [자료 보호](DATA_GOVERNANCE.md) · [독립 Gold](INDEPENDENT_EVALUATION.md) · [운영 #12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12).
