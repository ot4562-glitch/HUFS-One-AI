# HUFS One AI | 확정 5인 분업과 작업 경계

> 기준: 2026-11-03 KST. 이 문서는 **지속되는 담당자·작업 경계**만 적습니다. PR별 실적/차단은 [STATUS](../STATUS.md), 수락 항목 증거율은 [TEAM_PROGRESS](TEAM_PROGRESS.md), 과거 기록은 [Git 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/docs/WORKSTREAMS.md)에서 확인합니다. 과거 PR 상태를 '현재'로 재사용하지 않습니다.

## 팀 책임

| 담당자 (GitHub) | 최종 책임 / 작업 이슈 | 명확한 범위 |
| --- | --- | --- |
| **심민성** `ot4562-glitch` | 기술 총괄·통합·보안·공통 계약·API/인증/DB·Temporal RAG, **NCP 관련 모든 코드** [#8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8) [#19](https://github.com/ot4562-glitch/HUFS-One-AI/issues/19) [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27) [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20) [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88) [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143) | SourceRevision·actor/grant·CAS·central manifest, OCR/HCX provider SDK·HTTP adapter·bbox/권리·AI 비용 hard gate·Laya ONNX worker/queue·CPU 안전 제어 및 테스트·CI·OS/systemd·Docker/IaC/배포 스크립트 구현. UI/추천/학업 타인의 코드 소유 경계는 존중 |
| **이의상** `uisang2004-maker` | React UI·모바일·접근성·학생 흐름·시연 화면. [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9) [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) | HUFSAbility 원래 학생 메뉴 보존·🚫 미지원 상태, 더 나은 독립 UI/UX, 화면 route/상태·360px/키보드·스크린리더, #131/#134 보완. API/계약 권한은 기술 총괄과 조정 |
| **김채윤** `qamarrchae` | 추천·공지 순수 코어/정렬·근거/합성 평가. [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61) | TopicCode/공고·자격·마감/정정·시점/노출·재계산·독립 gold 평가. **AI 후보를 근거 없는 공식 판정으로 승격하지 않음** |
| **박준영** `taewangim-alt` | 학업·학점·교육과정/개설·졸업 RulePack 순수 코어 및 공식 교과 조사. [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) | 학수번호·이중전공·중복/대체/선수·기간/규칙, `UNKNOWN/NEEDS_REVIEW`, #138 저장 페이지 변환 검증. 실제 교과 사이트 수집/이용허가를 추정하지 않음 |
| **이서연** `lhh42001` | **NCP 클라우드 운영·계정·권한·크레딧·요금·비코드 인프라·실측 전담** [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12) [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22) | VPC/서버/스토리지/TLS/IAM/DNS·CLOVA/OCR/HCX 서비스 이용권·SKU/예산·호스트 CPU/RSS/비용 영수증·중지/반납. **SDK·worker·HTTP·ONNX·IaC·OS 스크립트·CI·자동화 코딩 0건 배정**. UI·추천·학업 개발 이슈에서 assignee 해제. 유료 실행은 별도 사용자 승인 필요 |

**2026-11-03 최신 역할 우선:** 이서연은 NCP 운영 담당만 유지하고 OCR/HCX/Laya 코드 등 모든 개발작업은 심민성에게 재배정했다. 기존 작업 이슈 #12/#22의 운영 범위와 #20/#88/#143의 구현 범위를 엄격히 구분한다. 이전 문서/과거 이슈의 혼합 배정은 효력 없음.

**팀원 5명 ≠ 실자료 제출 5명.** 실제 학업/Forms 자료 제출 대상은 **심민성·이의상·김채윤·이서연 4명**으로, 박준영은 학업 코어 담당일 뿐 이번 실 4인 자료 제출 대상이 아닙니다. 별도의 빈 SYNTHETIC 계정·S01~S05·REVIEWER도 실 4인과 섞지 않습니다. 당사자 목적별 동의 확인과 Git 게시/클라우드/공개 사용 동의는 [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 기준으로 구분합니다.

## 주요 교차 의존

| 작업 | 입력 주관 → 소비자 및 완료 게이트 |
| --- | --- |
| [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) + [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) 전체 메뉴·디자인 | 심민성 manifest/실기능 상태·사용자 가치/공식 표현 검수 → 이의상 원래 메뉴 노출·독립 디자인. [UI 텍스트 아틀라스](HUFSABILITY_UI_COMPONENT_ATLAS.md)의 11개 대분류·76화면과 공개 5/24/4 대응. 미구현 메뉴도 보이되 동작 금지 |
| [#132](https://github.com/ot4562-glitch/HUFS-One-AI/issues/132) 독립 빈 시연 계정 | 심민성 owner API·CAS·데이터 격리·시연 설명/매뉴얼 검수 → 김채윤 재계산 검증·박준영 학업 공백 확인 → 이의상 설정/초기화 화면 |
| [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) 실제 4인 학업·교과 | 박준영 공식 교육과정/개설·학점/이수구분 근거 조사 → 심민성 4인 actor/rights/DB·원본/변환 검수 → 김채윤 추천 소비·이의상 학생별 UI. 무단 크롤링/외부 원본 업로드·가짜 계정 금지 |
| [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) 정정 전후 비교 | 김채윤 판본/피드 합성 코어 → 심민성 승인 claim·권리/API → 이의상 필드별 비교/접근성. 테스트-only #140 병합은 실제 비교 UI 완료 아님 |
| [#80](https://github.com/ot4562-glitch/HUFS-One-AI/issues/80)·[#81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81)·[#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82) 지원/졸업/What-if | 심민성 인가·저장/API + 박준영 공식 학업 계산(해당 시) → 이의상 권한 있는 화면/실브라우저. 실학생의 공식 합격·졸업 판정 표시 금지 |
| [#23](https://github.com/ot4562-glitch/HUFS-One-AI/issues/23) RAG·OCR/Vision·Laya | **심민성** 출처/인가·Temporal RAG+OCR/HCX SDK·Vision bbox·Laya ONNX/queue·비용 차단·offline chaos **모든 코드**([#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88), [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)) ↔ **이서연** NCP 계정·entitlement·VPC/한도/실측·비코드 운영 영수증(#12/#22). 사용자 승인 없는 외부 전송·유료 호출 기본 OFF |

## 협업 안전·PR 검수

- **담당별 브랜치/PR/worktree/포트/일회용 DB 격리**. NCP 구성값·모델/리소스 보호가 코드(스크립트·YAML·IaC·CI 포함)인 경우에는 심민성 소유이며, 이서연은 운영 콘솔·계약·권한/비용/호스트 검증의 비코드 소유다. shared Zod/TopicCode, migrations, lockfile, GitHub Actions, auth/scope 변경은 기술 총괄과 소비자 리뷰를 거칩니다. 작성자 본인 APPROVED만으로 병합 불가. [PR_WORKFLOW](PR_WORKFLOW.md).
- API·UI·코어의 동일한 `asOf`/actor·grant/epoch·version·revocation·401/403/409·늦은 응답에서 이전 학생 데이터가 보이지 않게 하는 것이 공통 비기능 요구입니다.
- 자료·원문·학교 아이덴티티·실 개인정보를 권한 없이 공개하지 않습니다. 합성/SKIP/NOT_RUN·외부 권리/실운영을 구분합니다. [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)과 [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 해결 전 공개 출시 차단.
- 진척율은 증거 기반 **고정 게이트 수락률**일 뿐 제품 완성도/개인 역량 평가가 아닙니다. [TEAM_PROGRESS](TEAM_PROGRESS.md) 참고.
