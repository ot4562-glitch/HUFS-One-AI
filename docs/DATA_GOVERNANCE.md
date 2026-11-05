# HUFS One AI — 현재 개인정보·공식 자료권리·배포 경계

**상태:** 공모전 참가자 **5명 동의** 및 HUFSAbility 자료 **수집 허가**는 사용자 확인 사실. 실제 CSV/Forms 원본 제공자는 **4명**. 이것이 최초 Git 게시·team clone/backup·NCP·외부 AI/모델·발표·제3자 재배포의 **자동 허가가 아니다**. 실제 목적·현재 철회/보관·기관별 권리 독립 인수는 [#252 B03/B04](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)에서 확인한다. RELEASE_BLOCKED.

## 자료의 분리

| 자료 | 현재 사용 가능 범위 | 추가 확인·금지 |
| --- | --- | --- |
| 합성 S01–S05 / EMPTY / 가상 동아리 / REVIEWER | 합성 개발·CI/시연 | 실학생 신원·학교 공식 게시/지원으로 가장 금지 |
| 개인 수강 CSV 4개(6열)·Forms 26열/4응답 | 명시적으로 허가된 제한된 지역에서 목적별 검토/비공개 preview 계획 | Git/CI/공개 웹/모델·클라우드·팀 공유/최초 게시/보관/철회 개별 허가 필요 |
| 공식 공지/학칙/WIS/강의명·교수명 | 출처·목적·현재 판본/권리·출처 제한에 따른 안내/검증 | 다운로드/수집 가능과 재배포·외부 AI 전송·공식 RulePack 승인 동일시 금지 |
| 기관/기업 공고·포스터/모델 후보 | source class, collect/store/display/AI transmit 권리별 허가 후 | 비공개 API/학교 로그인 우회, 사이트/원문 재배포 무단 사용 금지 |
| 인증 키·토큰·개인 정보 대응표 | 승인된 보안 vault/환경에서 최소권한 접근 | Git/PR/CI/로그/스크린샷·LLM 요청·public artifact 반입 금지 |

## Git·로그·출판

- 현재 커밋 트리의 보호 원본 추적 경로는 0으로 보고되어 있으나, 조회 가능한 과거 이력 보호 경로 6개와 full private checkout 검사에서 남은 2개 실패/미해소 검토는 **서로 다른 범위**다. 모든 clone/fork/backup/unreachable object·최초 게시 권리를 자동 확인한 것은 아니다.
- 승인 없는 Git history rewrite/force-push·개인 파일명/SID 매핑 공개·원문 열람을 금지한다. 과거 이력 메타데이터 조사는 최소 정보로 제한, 보호 파일명·개인 원문은 이슈/CI로 출력하지 않는다.
- 새 UI/운영 자산·PDF/ZIP/JS/source-map·로그·Pages/정적 빌드·재배포 파일에 비밀/원본/개인 preview·실 활성 초대 URL이 포함되지 않아야 한다. 승인된 release artifact/NOTICE·문서/폰트/AI 자산 이용권을 검증한다.

## SourceRevision·AI·권한

- 각 원문에 collect/store/display/AI transmit 독립 권리와 수집·공표·검토·관찰 `asOf`를 보존한다. SourceRevision 원본/문단·media/PDF/OCR bbox·변경/정정/철회·영속 영수증의 범위가 불확실하면 `BLOCKED_RIGHTS/UNKNOWN/NEEDS_REVIEW`.
- 개인 원본은 Owner/SharingGrant/Consent→검증된 최소 projection 이후만 소비한다. 선택한 5슬롯의 overlay/REVIEWER sandbox는 원본 승인/공유 권한이 아니다. 철회/삭제/만료 시 API·PG/RAG·AI cache/이미지 URL·모든 탭의 잔상 차단.
- 외부 HCX/OCR/NCP에 원문/학생자료를 보내기 전에 명시 목적·법적/기관 동의·이용권/요금·보관/삭제·민감필드 비식별을 검토한다. Laya·유료 AI 기본 OFF.
- 공식 졸업 규칙/원장·학과/교수의 공개 수업명은 **허용된 수업 안내 목적**과 학교 규정 범위에서 이용하되 맥락 없는 실명/학번 추론·마스킹 면제가 아니다.

## 독립 감사 입력

```text
원본/기관별 제한 receipt ID, 데이터 종류·목적·현재 허용범위·보관/철회:
승인자/일시/근거 위치(공개 원문·개인 이름/계정번호 제외):
현재 Git tree + 전체 private checkout + history/clone/backup 조사 범위:
비인가 재배포·외부 AI/공개·실서비스 반입 차단 결과:
PASS | FAIL | HOLD | NOT_RUN:
필요 코드 보완 #253 / 실제 수락 #252:
```

실제 개인 원본 읽기/삭제/전송/클라우드 반입은 별도 권한자의 명시적 실행 승인 전 수행하지 않는다. [TEAM_SURVEY](../TEAM_SURVEY.md) · [데이터 수락](HUMAN_ACCEPTANCE_GATE_20261104.md).
