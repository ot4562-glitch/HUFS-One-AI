# HUFS One AI — 팀원이 설명하는 현재 서비스

**HUFS One AI는 공식 학교 시스템이 아닌 독립 학생 프로젝트**입니다. 학생의 맞춤 기회·공지·마감·학업/졸업 계획을 **근거와 불확실성을 함께** 보여 주는 제품을 개발합니다. 현재는 합성 시연과 검증용 코드 단계이며 공개 운영 `RELEASE_BLOCKED`입니다.

## 한눈에 보는 흐름

1. **화면 선택:** 상단 8개 HUFS One AI 주요 메뉴(휴대폰 5탭), HUFSAbility 원 메뉴는 이름/순서만 참고·미지원. 학교 원본 UI/계정을 복제하지 않는다.
2. **상태/대상 선택:** 로그인 actor와 시연 대상 가상 슬롯을 구분하고, 허가된 공고/학업 원장만 표시. A→B·RESET·철회 시 다른 학생의 캐시를 즉시 비움.
3. **추천·달력:** 같은 40개 가상 공고/10개 공지를 다른 관심·경험/전공으로 정렬하고 지원 조건·출처·수정판·확정 마감/미정·학생 일정 분리.
4. **AI 보조:** 출처·동의 확인 후 OCR/RAG·필요한 HCX 후보를 검증된 인용·JSON/수치·코드 판정과 결합. AI가 지원 적격·졸업·수상 결과를 확정하지 않음.
5. **학업:** 취득/수강 중/계획 학점과 What-if를 구분하고 규칙이 불명확하면 `UNKNOWN/NEEDS_REVIEW`. 학과/학사지원팀 공식 판정과 다름.
6. **운영:** React→Fastify→PostgreSQL→Source/AI·별도 NCP를 안전하게 조립할 코드가 존재해도 실계정·자료권리/서버비용/보안/사람 인수는 아직 남음.

## 팀 역할

심민성: 전체 API/DB·권한·Source/AI/NCP 관련 **코드**, 이의상: UI/접근성, 김채윤: 추천·공지, 박준영: 학사/전망, 이서연: **NCP 계정/요금/서버 비코드 운영**. 서로의 계약과 결과를 교차 검수합니다.

## 본선 진출 전/후 역할과 점검 이슈

| 담당 | 본선 진출 전 — 계속 진행 | 본선 진출 이후 — 실제 운영/실자료 수락 |
| --- | --- | --- |
| 이의상 UI/접근성 | [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실 BETA UI·모바일/스크린리더/학업·경험 종단 |
| 김채윤 추천/공지 | [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 합성 코퍼스·정정/성능(순수 코어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료) | [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) 실제 허가 출처·추천 정확성 주장 방지/운영 실측 |
| 박준영 학업 | [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 합성/교차 검토; #260 PR #262 정책/테스트 완료, 소비자 리뷰는 미완료 | [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) 공식 RulePack·4인 학업 원장·8학기 개설 실증 |
| 이서연 비코드/운영 | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 계정·비용·권리 사전검토/문서 | [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) 실 NCP 계정·청구/복구/반납·실원본 이용권 검수 |

**공통 원칙:** 본선 전 이슈의 합성 개발·사전 검토는 **OPEN**, 본선 이후 이슈는 **OPEN/NOT_RUN**이며 실제 NCP·SQL/AI/비밀키/운영자 구성과 실서비스 통합은 오너 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)이 총괄합니다. 본선 전 이슈 완료가 본선 이후 실서비스 인수 완료는 아닙니다. 원본 `csv/` 5개는 수정·삭제하지 않고 운영/배포/CI 번들에 포함하지 않습니다. 독립 사람 Gold는 현재 범위에서 제외되며 PASS 아님.

팀원에게 지금은 **합성 화면/코어 테스트, UX·문서/보안/비용 계획**만 맡기고, 본선 진출 이후에만 각각 검증된 운영 환경/실자료/실서버 인수에 착수합니다.

## 발표에서 답해야 하는 10가지

1. 학교 공식 서비스와 어떤 관계인가?
2. 왜 학생마다 다른 추천이 필요한가?
3. 추천 적격/마감/학점과 AI 문장을 누가 확정하는가?
4. 가상 5슬롯과 실원본 4명은 왜 다른가?
5. 선택·로그아웃·권한 철회가 발생하면 어떻게 캐시를 비우는가?
6. 원본·학칙의 권리/출처/판본·asOf는 어떻게 보존하는가?
7. 어떤 부분이 실제로 동작하고 어떤 것이 합성/미지원인가?
8. 생성형 AI와 개발 과정의 바이브코딩을 어떻게 검증하는가?
9. NCP의 비용/CPU/RSS·보안·실재 원본 전송을 누가 승인하는가?
10. 실제 서비스 공개를 위한 인적 Gold·접근성·D03 출시 조건은 무엇인가?

**실제 팀원 재설명/60초 데모·10분 발표·5분 질의응답 인수는 미완료**이며 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에 증거를 남깁니다. 기획 요약은 [README](../README.md), 실행은 [DEMO_MANUAL](DEMO_MANUAL.md).


## 처음 참여하는 비전공자에게 보여 줄 중요 문서 (2026-11-06)

1. [NCP 서버 개설·기본 보안](BEGINNER_NCP_SERVER_SETUP.md) — 콘솔/VPC/SSH/비용/반납.
2. [NCP 제품·GPT(Codex)·Claude Code 설치](BEGINNER_NCP_PRODUCT_AND_AGENTS.md) — 합성 미리보기와 운영/개발 에이전트 차이.
3. [제품 구조·추천·학업·AI 흐름](BEGINNER_PRODUCT_ARCHITECTURE.md) — 10분 발표/비전공 용어집.

**코드 진행:** 학업 전망 #278·추천 경험 코어 #279 병합, #259 순수 코어 완료. **협업 UI #258·학업 #260·NCP/실학생·실 Google/PG/CLOVA 운영 #276은 아직 미완료**. 실제 서비스 `RELEASE_BLOCKED`.
