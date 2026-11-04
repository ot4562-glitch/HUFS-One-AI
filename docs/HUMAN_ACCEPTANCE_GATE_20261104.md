# HUFS One AI | 사람 승인·현장 검증 인수서

**기준:** 2026-11-04 KST, 공모전 프로젝트. **상태: RELEASE_BLOCKED**.  
**성격:** 코드/합성 CI 결과와 사람이 실제 확인해야 할 승인·운영 증빙을 분리하는 **검수 원장**. 이 문서·PDF에 체크하는 행위 자체가 GitHub CODEOWNER 승인, 실서버 생성, 외부 공개, 개인정보/기관 허가 확대를 뜻하지 않는다.

## 0. 검토할 현재 개발 PR과 병합 순서

| 번호 | 개발 범위 | 의존성 | 현재까지의 기술 증거 | 별도 사람 승인 |
| --- | --- | --- | --- | --- |
| [#213](https://github.com/minseong-hufs/HUFS-One-AI/pull/213) | Google OIDC를 주입하는 내부 API 진입점·PG 7역할 TLS/준비/종료 | **#183** 애플리케이션 조립 선행 | 최신 HEAD TASK-00 + Chrome 성공; 실운영 연결 NOT_RUN | 최신 HEAD **비작성자 APPROVED**, DB 역할·비밀·OAuth 실환경 검증 |
| [#214](https://github.com/minseong-hufs/HUFS-One-AI/pull/214) | NCP 전용 NIC·보호 VM·SSH 공인 IP Terraform | **#207 → #208 → #211 → #214** | 합성 Node/Chrome 및 Terraform mock 검증(실 NCP API NOT_RUN); 최신 HEAD CI 재확인 | 리뷰어, 사용자 비용/자원 승인, NCP 계정 담당자의 실제 값 확인 |
| [#215](https://github.com/minseong-hufs/HUFS-One-AI/pull/215) | Ubuntu 승인형 설치 + WinSCP/SSH 배포/헬스/복구 | **#197 → #209 → #215**; #207 LF, #214 호스트도 현장 선행 | 최신 HEAD TASK-00 + Chrome 성공; 실 Ubuntu/SSH NOT_RUN | 리뷰어, 운영자, 사용자 실제 실행 승인 |
| [#212](https://github.com/minseong-hufs/HUFS-One-AI/pull/212) | 보호 파일 6개 Git 추적 해제·전체 트리 검사 | 단독; 실제 원본 접근과 과거 이력 별개 | PR HEAD 보호 경로 0, TASK-00 + Chrome 성공 | 비작성자 승인·병합 뒤 전체 private checkout 검사·기존 Git 이력 처리 검수 |

**원칙:** 새 PR 승인/CI는 **같은 최신 HEAD** 기준이어야 한다. 현재 PR HEAD와 base가 바뀌면 이 문서의 과거 PASS를 재사용하지 않는다. #183/#207/#208/#211/#197/#209 미병합이면 자식 PR을 단독 출시 완료로 체크하지 않는다. **실서비스 공개 production 차단은 그대로 유지**한다.

## 1. 개발 독립 승인 (담당: 코드 리뷰어 / 심민성)

- [ ] **A01 — #183 → #213 최신 HEAD 비작성자 승인 + 동일 HEAD 필수 CI 성공.** 실 코드 변경 경로/공용 API 계약/PG 권한/비공개 OIDC 주입 검토. 증거: PR 승인 URL, HEAD SHA, Actions run, 리뷰 스레드 해소.
- [ ] **A02 — #207 → #208 → #211 → #214 순서 승인·병합.** 실제 NCP provider 4.0.7 schema / network-only SSH/ACG/NACL/host Terraform mock 검사, 과금 자원 apply는 별도. 증거: 각 PR 승인/HEAD CI와 main CI.
- [ ] **A03 — #197 → #209 → #215 순서 승인·병합.** rollback lock·expected-current SHA·실패 시 복구·Windows PowerShell 5.1 / Ubuntu bash 호환 검토. 증거: 각 PR 승인/HEAD CI, 합성 불변조건.
- [ ] **A04 — 공용 DB migration·운영 API 역할 계약 및 위 세 PR의 main 재통합·회귀.** 배포용 ZIP에 학생 원본·비밀이 없음, production 차단이 유지됨, 실행 entrypoint/패키지/빌드 경로가 재현됨. 증거: 새 main SHA/Actions 및 별도 운영 런북.

## 2. 실제 인증·DB·자료 권한 (담당: 심민성 + 승인된 검수자)

- [ ] **B01 — 운영 Google OIDC/JWKS/PKCE/콜백 + 실제 외대 이메일 소유·OTP + REVIEWER 초대**를 독립 실계정으로 검증. 세션·CSRF·BETA/REVIEWER 격리·권한 철회·브라우저 재접근 차단 확인. 실패 로그에 토큰·이메일·OTP 없음.
- [ ] **B02 — 실제 PostgreSQL 최소 권한 7역할/CA TLS/RLS/보안 migration**을 승인된 비공개 데이터베이스에서 검증. ROLE을 바꿔 타인 원장 조회·직접 SQL 우회 시도 실패, 전체 서버 중단/재기동 시 세션 철회 영속, 제한된 백업 복구 시험. DSN·비밀번호·실학생 값은 문서에 쓰지 않음.
- [ ] **B03 — 데이터·권리 확인.** 사용자 확인: 공모전 참여 5명 전원 동의, HUFSAbility 자료 수집 허가 확보. 실제 학업/Forms 원본 제출 4명과 혼동하지 않음. 공식 강의시간표 공개 교수명·강의명은 용도 한정 이용(이름 일괄 마스킹을 자동 의무로 놓지 않음). **허가의 실제 필드/목적/외부 전송·게시 범위**, 철회/보관/삭제만 제한된 원장에서 확인.
- [ ] **B04 — #46 Git privacy 수정 후 최종 감사.** #212 승인→병합→원본 보존 경로 확인→전체 private checkout `npm run check:privacy` 기존 2 FAIL 해결 검증. 과거 Git commit/clone/backup의 접근·이력/유출 범위는 별도 점검, 승인 없는 force push/이력 재작성 금지.

## 3. NCP 운영·배포·복구 (담당: 운영 이서연, 자동화 심민성, 최종 승인 사용자)

- [ ] **C01 — 운영 계정·지출 승인 (#12/#22):** NCP subaccount/IAM 최소 권한, 한국 리전, 실제 Ubuntu amd64 SKU/이미지 ID, 공개 IP·SSD·예상 KRW/h·VAT·크레딧·quota·이용권·상한과 중지/반납 책임. **사용자 서명/날짜/견적 근거** 확인 뒤에만 `apply` 가능.
- [ ] **C02 — 실제 네트워크 (#192):** VPC/subnet/라우팅/IGW·독립 ACG·stateless NACL·DNS 반환 포트, SSH **관리자 공인 IPv4/32만 허용**, 5173·3000·5432·6379/9229·80/443 외부 기본 차단, 공개 origin IP/IPv6 우회 테스트. 사용자 명시 공개 승인 전에는 웹 포트 개방 금지.
- [ ] **C03 — Ubuntu 초기 설치/접속:** 관리자 키(공개키만 서버), PuTTY/WinSCP 고정 host key 지문, 두 번째 독립 SSH 키 로그인 성공 뒤 root/password SSH 차단. bootstrap/Node24/systemd/UFW, 비밀/SSH 키 보호, 실호스트 영수증 기록.
- [ ] **C04 — 합성 미리보기 배포 검증:** 승인된 Git 커밋/ZIP SHA와 SFTP/SSH만 사용해 127.0.0.1:5173에서 시연, HTTPS/public 포트 없음. 실 API/Google/OCR/HCX/Laya/실학생 데이터 ON 금지. 부팅·재시작·헬스·불완전 패키지/실패 작업 거부 확인.
- [ ] **C05 — 배포 실패·복구 현장 드릴:** last-good SHA 유지, 동일 release 잠금, 다른 작업 동시성/잘못된 SHA/헬스 타임아웃, 이전 정상 릴리스의 재시작·헬스, 실패 시 명시적 수동 복구와 사고·비용 기록. 실제 승인 없이 실행하지 않음.
- [ ] **C06 — 공개 운영 별도 게이트 (#89):** Nginx/LB/WAF/CDN/TLS/인증서·직접 IP/Geo bypass·사전 로그인 HTML/JS 노출·백업/운영 비용/관측·종료/반납. #166은 Draft이고 실 운영 공개는 아직 차단.

## 4. 독립 품질/출시 판정

- [ ] **D01 — #61 독립 gold 200/200:** 김채윤의 합성 40공고×5가상 슬롯 자체 작성 라벨을 사람의 독립 gold로 계산하지 않음. 이의상 등 **작성자와 분리된 검토자**가 사례별 판정/근거/수정 이유·재현 SHA를 기록. 현재 확인 기준 0/200.
- [ ] **D02 — 실제 검수기기·접근성:** 모바일/데스크톱 실제 로그인/세션·빈/UNKNOWN/권리철회·스크린리더·성능/회복성 E2E. 가상/합성 시나리오의 성공을 실제 이용 검증으로 오인하지 않음.
- [ ] **D03 — 최종 출시 승인 (#89):** 모든 위 게이트의 **실제 증거** 확인, 추가 privacy/학교 권리·안전 책임자 검토, 사전 승인된 NCP 비용/범위·공개 경로 및 사고 대응/롤백을 별도 서면 승인. 승인 전 `RELEASE_BLOCKED` 유지.

## 5. 빠른 피드백 템플릿 (GitHub PR/이슈에 복사)

아래 **한 블록만** 복사하여 담당 이슈 또는 관련 PR에 댓글로 전달. **비밀, 토큰, 주민번호/학번, 실제 학생 원본, .pem/.ppk, NCP 개인키, 클라우드 결제 정보를 붙여넣지 말 것.**

```text
[HUFS One AI 사람 검수]
항목 ID: A01 / A02 / A03 / A04 / B01 / B02 / B03 / B04 / C01 / C02 / C03 / C04 / C05 / C06 / D01 / D02 / D03
결정: 승인 / 수정 요청 / 보류 / 미실행
검토자(역할): 
검토 일시(KST): 
정확한 대상 PR HEAD SHA / 대상 환경(비밀 제외):
증거 URL 또는 비공개 증거 ID(민감 정보 비노출):
실제로 실행한 항목 / 환경 / 결과:
발견한 문제(재현 조건/기대/실제):
요청할 수정 / 차단 해제에 필요한 증거:
재검수 담당·기준:
```

- **승인:** 해당 ID의 증거가 충족됐다는 검토 의견. PR 병합은 GitHub **비작성자 APPROVED**가 별도로 필요.
- **수정 요청:** 증상·재현·범위·요청 수정이 있으면 작성. **보류:** 외부 계정/견적/허가 등 아직 근거 없음. **미실행:** 실행하지 않은 검증, PASS 처리 금지.
- **검증 근거 연결:** 담당 이슈/PR 댓글 URL·Actions run ID·로그의 **민감 정보를 제거한** 해시·실제 운영자 검수 번호만 기록.
- 이 문서의 상태는 작성일 스냅샷이고, 현황 정본은 [STATUS](../STATUS.md), [PR_WORKFLOW](PR_WORKFLOW.md), [NCP 운영](NCP_OPERATIONS_2026.md), [개인정보 정본](DATA_GOVERNANCE.md), [#89](https://github.com/minseong-hufs/HUFS-One-AI/issues/89).

**주관 확인:** 심민성(API/DB/IaC/배포 코드), 이서연(실 NCP 비코드 운영), 이의상(독립 UI/gold 검토), 김채윤(추천 코어 작성/자체 평가; 독립 gold 불가), 박준영(공식 학업/RulePack 근거). **인적 승인/실행 기록이 아직 없다면 모든 체크박스는 [ ] 그대로 둔다.**
