# HUFS One AI | 확정 5인 분업과 작업 경계

> 기준: 2026-11-03 KST. 이 문서는 **지속되는 담당자·작업 경계**만 적습니다. PR별 실적/차단은 [STATUS](../STATUS.md), 수락 항목 증거율은 [TEAM_PROGRESS](TEAM_PROGRESS.md), 과거 기록은 [Git 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/docs/WORKSTREAMS.md)에서 확인합니다. 과거 PR 상태를 '현재'로 재사용하지 않습니다.

## 팀 책임

| 담당자 (GitHub) | 최종 책임 / 작업 이슈 | 명확한 범위 |
| --- | --- | --- |
| **심민성** `ot4562-glitch` | 기술 총괄·통합·보안·공통 계약·웹/외부 API·인증·일반 PostgreSQL·Temporal RAG. [#8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8) [#19](https://github.com/ot4562-glitch/HUFS-One-AI/issues/19) [#21](https://github.com/ot4562-glitch/HUFS-One-AI/issues/21) [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27) | SourceRevision·permission/source rights·actor/grant·version/epoch·CAS, central capability manifest와 API 조립, 계약/CI 통합. 다른 담당자의 코어/UI를 임의 교체하지 않음 |
| **이의상** `uisang2004-maker` | React UI·모바일·접근성·학생 흐름·시연 화면. [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9) [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) | HUFSAbility 원래 학생 메뉴 보존·🚫 미지원 상태, 더 나은 독립 UI/UX, 화면 route/상태·360px/키보드·스크린리더, #131/#134 보완. API/계약 권한은 기술 총괄과 조정 |
| **김채윤** `qamarrchae` | 추천·공지 순수 코어/정렬·근거/합성 평가. [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61) | TopicCode/공고·자격·마감/정정·시점/노출·재계산·독립 gold 평가. **AI 후보를 근거 없는 공식 판정으로 승격하지 않음** |
| **박준영** `taewangim-alt` | 학업·학점·교육과정/개설·졸업 RulePack 순수 코어 및 공식 교과 조사. [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) | 학수번호·이중전공·중복/대체/선수·기간/규칙, `UNKNOWN/NEEDS_REVIEW`, #138 저장 페이지 변환 검증. 실제 교과 사이트 수집/이용허가를 추정하지 않음 |
| **이서연** `lhh42001` | 팀 기획·심사용 표현, NCP/CLOVA General OCR·HCX Vision·Laya 모델/비용·인프라 제공자 통합. [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12) [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20) [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22) [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) | 공급자 권한·CPU/메모리/비용·모델 실험 계획·콘텐츠/학교 공식성 검토. 유료 클라우드 실행은 별도 사용자 승인 필요 |

**팀원 5명 ≠ 실자료 제출 5명.** 실제 학업/Forms 자료 제출 대상은 **심민성·이의상·김채윤·이서연 4명**으로, 박준영은 학업 코어 담당일 뿐 이번 실 4인 자료 제출 대상이 아닙니다. 별도의 빈 SYNTHETIC 계정·S01~S05·REVIEWER도 실 4인과 섞지 않습니다. 당사자 목적별 동의 확인과 Git 게시/클라우드/공개 사용 동의는 [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 기준으로 구분합니다.

## 주요 교차 의존

| 작업 | 입력 주관 → 소비자 및 완료 게이트 |
| --- | --- |
| [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) + [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) 전체 메뉴·디자인 | 심민성 manifest/실기능 상태 → 이의상 원래 메뉴 노출·독립 디자인 → 이서연 사용자 가치/공식 오인 방지. [UI 텍스트 아틀라스](HUFSABILITY_UI_COMPONENT_ATLAS.md)의 11개 대분류·76화면과 공개 5/24/4 대응. 미구현 메뉴도 보이되 동작 금지 |
| [#132](https://github.com/ot4562-glitch/HUFS-One-AI/issues/132) 독립 빈 시연 계정 | 심민성 owner API·CAS·데이터 격리 → 김채윤 재계산 검증·박준영 학업 공백 확인 → 이의상 설정/초기화 화면 → 이서연 시연 문구/매뉴얼 |
| [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) 실제 4인 학업·교과 | 박준영 공식 교육과정/개설·학점/이수구분 근거 조사 → 심민성 4인 actor/rights/DB·원본/변환 검수 → 김채윤 추천 소비·이의상 학생별 UI. 무단 크롤링/외부 원본 업로드·가짜 계정 금지 |
| [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) 정정 전후 비교 | 김채윤 판본/피드 합성 코어 → 심민성 승인 claim·권리/API → 이의상 필드별 비교/접근성. 테스트-only #140 병합은 실제 비교 UI 완료 아님 |
| [#80](https://github.com/ot4562-glitch/HUFS-One-AI/issues/80)·[#81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81)·[#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82) 지원/졸업/What-if | 심민성 인가·저장/API + 박준영 공식 학업 계산(해당 시) → 이의상 권한 있는 화면/실브라우저. 실학생의 공식 합격·졸업 판정 표시 금지 |
| [#23](https://github.com/ot4562-glitch/HUFS-One-AI/issues/23) RAG·OCR/Vision·Laya | 심민성 출처/인가·Temporal RAG → 이서연 OCR·모델·유료 제공자/CPU. 외부 처리·권리/비용 승인이 없는 경우 기본 OFF·실호출 차단 |

## 협업 안전·PR 검수

- **담당별 브랜치/PR/worktree/포트/일회용 DB 격리**. shared Zod/TopicCode, migrations, lockfile, GitHub Actions, auth/scope 변경은 기술 총괄과 소비자 리뷰를 거칩니다. 작성자 본인 APPROVED만으로 병합 불가. [PR_WORKFLOW](PR_WORKFLOW.md).
- API·UI·코어의 동일한 `asOf`/actor·grant/epoch·version·revocation·401/403/409·늦은 응답에서 이전 학생 데이터가 보이지 않게 하는 것이 공통 비기능 요구입니다.
- 자료·원문·학교 아이덴티티·실 개인정보를 권한 없이 공개하지 않습니다. 합성/SKIP/NOT_RUN·외부 권리/실운영을 구분합니다. [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)과 [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 해결 전 공개 출시 차단.
- 진척율은 증거 기반 **고정 게이트 수락률**일 뿐 제품 완성도/개인 역량 평가가 아닙니다. [TEAM_PROGRESS](TEAM_PROGRESS.md) 참고.
