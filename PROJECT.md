# HUFS One AI — 제품 방향과 현재 범위

HUFS One AI는 한국외국어대학교 학생의 기회 탐색·학사 공지·경험 기록·진로/학업 계획을 **개인 조건과 확인 가능한 근거**에 맞춰 묶는 독립 학생 프로젝트입니다. 학교가 운영·인증한 서비스가 아닙니다.

## 사용자 문제

공고·장학·비교과·취업·학칙 정보가 여러 곳에 나뉘어 있고, 같은 공고라도 학생의 학과/전공·관심·학점·마감/지원 자격에 따라 적합성이 바뀝니다. 이 서비스는 확인 가능한 조건을 코드로 구분하여 **왜 보이는지·왜 보류되는지·무엇을 확인해야 하는지**를 설명합니다.

## 2026-11-12 프로젝트 범위·검증 현황

[main `3c6b87b`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/3c6b87b1f28e360b37f90a0dc59557d3f9e30b74) 기준 [#503](https://github.com/ot4562-glitch/HUFS-One-AI/pull/503) 전 기능 검색 디렉터리·제품형 진입 UI와 #339–#352 추가 기능의 다수 코드/계약/웹 PR이 반영되었습니다. **전체 메뉴 탐색 가능**은 **학교 기능 전체가 구현·운영·승인됐다**는 뜻이 아니며, 공식 학교 권한 기능은 미지원 상태를 유지합니다. 실 데이터 취득·권리·Gold는 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)/[#446](https://github.com/ot4562-glitch/HUFS-One-AI/issues/446), NCP 수집기·설계는 [#445](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445)/[#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449), 전체 범위는 [#447](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447)로 추적합니다. 실서비스는 `RELEASE_BLOCKED`입니다. [현재 전체 31개 이슈 상태](STATUS.md).

## 현재 제공하는 합성 여정

- 데스크톱 참고 대분류 11개 GNB와 실제 화면 LNB, 모바일 하단 5탭, HUFSAbility 원 메뉴 24개는 **미지원**이라고 표시. 상단 합성 계정 선택기는 실제 학교 로그인 아님(#297/#299).
- 가상 프로필 5개와 독립 빈 계정에서 40 공고/10 공지, 마감/정정·출처·중요 일정 개인화.
- 학점 세 원장·전공/이중전공 What-if·계획·개설 전망을 **공식 아님/UNKNOWN**과 구분.
- 경험 DRAFT/승인 태그·북마크/행동 계획, 가상 ADMIN 동아리 게시·수정/철회, REVIEWER 합성 시연.
- 생성형 AI 4작업과 OCR/HCX·Temporal RAG의 승인형 코드 경계. 실제 유료 모델은 기본 OFF.

## 서비스가 하지 않는 것

실제 공고 지원 제출, 학교 공식 SSO, 공식 졸업 판정, 푸시 발송, 학교 자료/로그인 무단 수집, 실학생 4인 원본 공개·외부 AI 전송을 제공했다고 표시하지 않습니다. 미지원 메뉴는 해당 상태를 명확히 보여 줍니다.

**현재 구현과 단계별 출시 게이트:** [STATUS](STATUS.md) · [#276 실운영·실자료 통합](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) · [#255 팀 협업](https://github.com/ot4562-glitch/HUFS-One-AI/issues/255). 상세 설명은 [README](README.md), 기술 계약은 [Architecture](Architecture.md)에 있습니다.


**과거 단계(2026-11-06 이전) 반영:** [PR #292](https://github.com/ot4562-glitch/HUFS-One-AI/pull/292)(학업 독립 참조모형·탐색 예산) · [PR #293](https://github.com/ot4562-glitch/HUFS-One-AI/pull/293)(학사공지 SourceRevision/mock claim·clean HEAD 벤치) · [PR #295](https://github.com/ot4562-glitch/HUFS-One-AI/pull/295)(교과코드 미확인 원장/전망 `forecast-offering-v3`, API `NOT_CONNECTED`) · [PR #304](https://github.com/ot4562-glitch/HUFS-One-AI/pull/304)(공통 UI/발표 S04·공개 합성 Pages 자동배포 유지). 실제 학교 인증·팀원 4명 개인별 데이터/학수번호 132개 공식 매핑·NCP/PG/CLOVA 실행·포스터/모바일/스크린리더 사람 인수는 `NOT_RUN/CONFIGURATION_REQUIRED` 또는 미완료입니다. 운영 제품은 `RELEASE_BLOCKED`이며, 공개 GitHub Pages는 **실자료·외부 AI 호출 없는 합성 시연**으로 `main` push 때 자동 배포를 계속합니다. 원본 `csv/` 다섯 파일은 내용·경로/이름·인코딩·추적 상태를 그대로 유지합니다.

**2026-11-06 당시 코드 진행(역사적 기록):** 오너 분할 #267~#275 중 8개·BETA 원본 화면 #277, 학업 전망 #278, 추천 경험 코어 #279가 `main`에 병합됐습니다. [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259) 순수 코어는 CLOSED, #10/#11/#258/#260 및 실제 NCP·Google/PG·학생별 동의/권리·CLOVA·복구는 별도 운영 게이트로 남았습니다(과거 #276은 2026-11-07 중복 이관으로 CLOSED). [처음 읽을 문서](README.md). 실제 운영은 `RELEASE_BLOCKED`.
