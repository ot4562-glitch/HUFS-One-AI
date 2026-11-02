# HUFS One AI | 시연·에이전트 검증 기준

## 2026-11-02 최신 심사 시연 진척·검증 게이트

- [x] **main 병합:** [#122](https://github.com/ot4562-glitch/HUFS-One-AI/pull/122) 정정/구판 잔상·권한 철회 회귀 `bb5b76d`; [#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72) 비합성 인증 캘린더 UI 포트·동일 context snapshot 격리 `717ce979`. 두 HEAD 모두 비작성자 APPROVED/Actions synthetic+PG 2/2 SUCCESS.
- [x] UI #74 졸업 비공식 판정 문구·#75 sandbox 미저장 입력 격리는 최신 HEAD APPROVED, **미병합**(선행 #73 초대 비동기 성공 콜백 CHANGES_REQUESTED). #117 코어 최신 HEAD APPROVED이나 다른 리뷰어의 이전 변경 요청 확인/계약 #120 불일치로 미병합. #76 Playwright는 독립 browser CI 증거 없음.
- [ ] [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) 기존 HUFSAbility 원래 메뉴 5분류·24하위 기능·공개 4영역 전면 배치와 **🚫 미지원** IA/UI 구현, [#123](https://github.com/ot4562-glitch/HUFS-One-AI/issues/123) 실제 생성된 가상 포스터/게시판/추천 화면 시연 미완료. #125 클럽 코어의 과거 asOf/미래 updatedAt 누출 문제 해결 전.
- [ ] 기존 학교 데이터·SSO/학생 동의/실독립 200골드·기관자료 원문·실 REVEIWER 브라우저·NCP/TLS/릴리스 허가 미검증. #46 Privacy 153/155 PASS·2 FAIL, #89 `RELEASE_BLOCKED`. 과거 2026-11-01의 PR/Issue 개수는 당시 이력.

**데모 설명 순서 제안:** 기존 HUFSAbility 기능/🚫 표시 → 구현된 합성 개인화 공고·달력 → 승인된 범위의 졸업지원 → 가상 동아리 모집 신규 제안. 실제 구현되지 않은 화면을 완성된 것으로 시연하지 않는다.

## 2026-11-01 후속 PR 리뷰·심사 검증 정본

- [x] [#118](https://github.com/ot4562-glitch/HUFS-One-AI/pull/118) 정책 버전 결과 캐시 키는 최신 HEAD 타인 APPROVED·[Actions #41307796839](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41307796839) 합성/PG 2 job SUCCESS 후 main merge `fdf0b09b`.
- [x] [#117](https://github.com/ot4562-glitch/HUFS-One-AI/pull/117) 조직 노출 상한·다양성에서 사유가 실제 순위와 맞지 않는 문제로 CHANGES_REQUESTED. [#120](https://github.com/ot4562-glitch/HUFS-One-AI/pull/120) 계약→[#121](https://github.com/ot4562-glitch/HUFS-One-AI/pull/121) owner API는 HEAD COMMENT·Actions SUCCESS·타인 리뷰 요청만 완료(아직 미병합).
- [ ] UI #72~#76·#119 실제 정정 전후 비교·#86 화면·#82 What-if 학업 계산 엔진·#81 계획 화면/실브라우저 종단 검증 미완료. 작성자 로컬 합성/CI 결과를 실제 학생·기관 공고/정식 학칙·브라우저 출시 승인으로 표기하지 않는다.
- [ ] #46 개인정보 원본 인덱스 검사 2 FAIL 및 #89 `RELEASE_BLOCKED`; 과거 '이번 신규 병합 0건'은 **이전 UI 전용 감사**의 기록이며 이번 코어 PR 1건은 실제 병합했다.

## 2026-11-01 새 PR 리뷰·시연 검증 게이트

- [x] 열린 UI PR #72~#76 **5건 모두 HEAD 리뷰**(두 건 CHANGES_REQUESTED: #72 일정 실제 API/스냅샷 버전, #75 REVIEWER 대상별 미저장 초안·설정 분리; 나머지 세 건 COMMENT). [상세 상태](STATUS.md).
- [ ] 현재 PR HEAD 원격 Actions 검증 0건/병합 0건. #76 본문 Edge E2E 10/10은 작성자 로컬 실행 진술이며 이 감사의 독립 재실행 결과가 아니다. 실제 Google/OIDC·권한 철회·모바일/스크린리더·실서버 E2E 별도.
- [ ] [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 전체 개인정보 경계 153/155 PASS·2 FAIL, 실자료/기관·동의·NCP 사용승인과 [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 운영 릴리스 게이트 미완료. 현재 `RELEASE_BLOCKED`.

> **2026-10-31 최종 운영·역할 정본:** [NCP 단가·816h/576h 계산](docs/NCP_OPERATIONS_2026.md) · High Memory-g3 Linux VPC 4vCPU/32GB 326원/h, CB 50GB 8원/h; 11/6~12/9 전체 816h 비용 상한이고 실제 VM 개통은 공식 11/16 본선 진출·크레딧·사용자 승인 이후. 심민성은 웹/API·인증·일반 DB·RAG, 이서연은 NCP·CLOVA/OCR/HCX/Laya/provider SDK/모델·클라우드 운용 전담. 독립 UI·추천·학업 소유 불변.


상세 기준은 [Architecture.md](Architecture.md) A2·§8·§13~16이다. 심사용 시연 소개는 [Proposal.md](Proposal.md) §04·§09를 따른다.

## 5개 데모 슬롯 주시연과 합성 회귀시험

본선의 **첫 시연은 동일한 HUFSAbility 취업·비교과 공고 묶음을 관심 분야가 다른 두 학생에게 보여주어 상위 큰 카드·일반 작은 목록과 추천 근거가 어떻게 달라지는지 검증**하는 것이다. 이어 개인정보 제공 승인된 최대 4명의 최소 이수기록에 각자의 검수된 한국외대 규칙을 적용한 **추가 졸업지원**을 시연한다. S01~S05 다섯 전환 슬롯 중 미수령·미동의·미검수 대상은 PENDING 또는 명시적 SYNTHETIC이다.

Google Forms 응답에서 관심·희망 직무를 읽고, 학생이 승인한 경험·공고 조건을 기반으로 **학생별 관련성 정렬과 `FEATURED_LARGE`/`COMPACT_LIST` 노출등급**을 검증한다. AI 행동 브리프의 근거 ID·자격·신청기한을 독립 대조한다. 추가 졸업지원은 본인 캡처에서 검수한 CSV로 실제 취득·수강 중·계획·미이수·시험/인증을 공식 규칙에 맞춰 평가한다. 실제/합성 자료와 허용 범위는 분리한다.

**외부 웹 개통 전 보안 시연:** `https://외대.온라인.한국`은 예정 주소다. Google 토큰 위조/만료, Workspace `hd` 힌트 우회, 개인 Gmail 단독, 외대 메일 OTP 누락·만료·재사용·다른 Google 계정 결속, 미초대 계정이 제품 HTML/API·파일에 들어오지 못하게 한다. 적법한 외대 이메일 소유자라도 다른 학생 원장/미승인 projection은 403이다. 직접 IP·CDN/스토리지·preview·로그아웃 캐시 우회도 시험한다. **학교 공식 SSO 허가 없이 독립 인증**으로 설계하지만 Google OAuth·메일 OTP·DNS/TLS·실제 E2E 미완료는 PENDING/BLOCKED다(Architecture A14.1a·A15).

## 수행과 체크의 주체

TASK-00~TASK-12의 체크박스는 담당 구현 에이전트가 실행·증거를 기록하고, 독립 검토 에이전트가 대조하며 통합 에이전트가 완료를 확인한다. 실행·검토 담당자는 항목마다 검증 근거를 남긴다. 각 카드의 수행자·검토자·읽을 절을 따른다.

목표·동의·자료 범위·기관권한·비용·공개는 **사람이 에이전트와 함께** 판단한다. 당사자의 동의나 실제 권한자의 승인을 에이전트가 만들어내지 않는다. 5명 시간·클릭 실험은 별도 필수과제가 아니다.

## 결과 보고

실제 학생별 적용 근거·독립 기대값·현재/계획 불변성·미확인 상태·원본 보호·동의철회·온라인/오프라인·live/캐시/replay 표시를 기록한다. 공개 결과물에는 개인 원장·증빙·개인 replay·학교 원본을 넣지 않는다. 실제 입력자 최대 4명의 검수 완료와 5개 데모 슬롯의 합성 시험 완료를 서로 대체하지 않는다.

현재 main에 합성 검증된 UI 셸·개인화 코어·서버/PG/권한 코드가 있으나, 실제 기관 원장/룰팩·공개 도메인·Google/외대 메일/NCP·심사자/학생 실브라우저 운영 검증은 미완료다. 실제 배포 시연 성능을 측정했다고 주장하지 않는다.

## 신규 신뢰성·시의성·이미지 증거 게이트 (2026-10-31 설계, 미실행)

기존 추천 40건×5프로필 평가와 **별도로** 합성 포스터 20건 및 정정/취소/기간/이력 12건을 목표로 한다. (1) HTML-only vs OCR vs OCR+HCX-005 이미지 필드·날짜·좌표 정확도, (2) core-only vs temporal RAG+HCX-007 evidence groundedness/환각·허위 자격, (3) Laya on/off Korean 문서 라우팅 F1·High Memory-g3 CPU/RSS/p95·비용을 독립 평가한다. 중요한 오판·미래 `asOf` 누출·권한 위반·취소 후 구본 활성화 **0건 목표**이며 실제 테스트 전에 실적이라고 쓰지 않는다. OCR/LLM 비용뿐 아니라 서버·gateway·storage·VAT·크레딧 적용을 구분하고 예산 초과 시 서비스 내 안전한 폴백을 검증한다. 수행 조건·실패 사례: `docs/TRUSTED_RAG_MEDIA_VERSIONING.md` §8.
