# HUFS One AI — 제품 방향과 현재 범위

> **2026-11-12 현행 재감사:** [36개 PR·31개 이슈 전수 기록](docs/REVIEW_AND_ISSUE_AUDIT_20261112.md). 새로 PR 3개 병합·버그 #427만 완료해 **PR 33건 / Issue 30건 OPEN**(감사 시점). 아래 옛 수치/상태는 기록 당시 스냅샷입니다. 합성 CI는 실 NCP·공식 출처 권리/사람 Gold 인수를 대신하지 않으며 `RELEASE_BLOCKED` 유지.

HUFS One AI는 한국외국어대학교 학생의 기회 탐색·학사 공지·경험 기록·진로/학업 계획을 **개인 조건과 확인 가능한 근거**에 맞춰 묶는 독립 학생 프로젝트입니다. 학교가 운영·인증한 서비스가 아닙니다.

## 2026-11-11 제품·개발·인수 범위 (현행)

- 현재 공개 제품 범위는 **권한 경계가 있는 합성 시연·코드/오프라인 자동 검증**입니다. 실사이트 수집, 실학생 정보, 학교 공식 SSO/학사 판정, 실제 NCP 배포 및 외부 유료 HCX/OCR 호출은 검증 완료 항목이 아닙니다.
- **개발 최신 상태:** 11월 11일 최초 OPEN PR 22건·OPEN Issue 31건을 전수 점검, PR 전부 공식 코드 COMMENT 리뷰 작성, [#475](https://github.com/ot4562-glitch/HUFS-One-AI/pull/475)만 협업자 현재 HEAD 승인/CI 확인 후 main [05d78cd](https://github.com/ot4562-glitch/HUFS-One-AI/commit/05d78cdff03d68d1b711f9009bdbb335bc0e2939)로 병합. 상세 근거는 [PR/Issue 전수 감사](docs/REVIEW_AND_ISSUE_AUDIT_20261111.md)와 [STATUS](STATUS.md)에 기록합니다.
- **이번 추가 개발 과제:** [#445](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445) Crawlee 기반 NCP 내 비공개 공식자료 수집·정규화·예약 갱신, [#447](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447) HUFSAbility 범위의 독립 기능/실자료 전환, [#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449) 실제 NCP 데이터/권리/보존·백업·버전 설계 확정. 기구축 합성 코드와 새 통합 PR 스택을 실제 서버 인수와 혼동하지 않습니다.
- **수집·저장 위치:** Crawlee·파서·계약·API·테스트·배포 코드는 이 GitHub 저장소, 실제 운영 출처 목록/원문/검수·Gold/DB/백업/비밀은 비공개 NCP 환경에만 보관하는 구조를 목표로 합니다. 공개 웹 **URL 발견**, 실제 자동 취득, 저장·재게시·OCR/외부 AI 송신은 서로 다른 권한으로 검증합니다. 학교 SSO/API가 없더라도 본선 시연 기능은 독립 구현할 수 있지만 실제 기관 정보·자격의 공식 확정 판정은 하지 않습니다.
- **현재 GO/HOLD:** `OWNER_CONFIRMED_APPROVED`는 개발 방향에 대한 승인으로, **`RELEASE_BLOCKED`는 실서비스·실원본 권리/사람 인수 미완료**를 표시합니다. 열린 이슈 31건은 근거 없이 닫지 않고 각 담당자·실증 조건을 유지합니다.

## 사용자 문제

공고·장학·비교과·취업·학칙 정보가 여러 곳에 나뉘어 있고, 같은 공고라도 학생의 학과/전공·관심·학점·마감/지원 자격에 따라 적합성이 바뀝니다. 이 서비스는 확인 가능한 조건을 코드로 구분하여 **왜 보이는지·왜 보류되는지·무엇을 확인해야 하는지**를 설명합니다.

## 현재 제공하는 합성 여정

- 데스크톱 참고 대분류 11개 GNB와 실제 화면 LNB, 모바일 하단 5탭, HUFSAbility 원 메뉴 24개는 **미지원**이라고 표시. 상단 합성 계정 선택기는 실제 학교 로그인 아님(#297/#299).
- 가상 프로필 5개와 독립 빈 계정에서 40 공고/10 공지, 마감/정정·출처·중요 일정 개인화.
- 학점 세 원장·전공/이중전공 What-if·계획·개설 전망을 **공식 아님/UNKNOWN**과 구분.
- 경험 DRAFT/승인 태그·북마크/행동 계획, 가상 ADMIN 동아리 게시·수정/철회, REVIEWER 합성 시연.
- 생성형 AI 4작업과 OCR/HCX·Temporal RAG의 승인형 코드 경계. 실제 유료 모델은 기본 OFF.

## 서비스가 하지 않는 것

실제 공고 지원 제출, 학교 공식 SSO, 공식 졸업 판정, 푸시 발송, 학교 자료/로그인 무단 수집, 실학생 4인 원본 공개·외부 AI 전송을 제공했다고 표시하지 않습니다. 미지원 메뉴는 해당 상태를 명확히 보여 줍니다.

**현행 구현·출시 게이트:** [STATUS](STATUS.md) · [#445 NCP/Crawlee](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445) · [#447 전 기능·실자료](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447) · [#449 데이터 설계](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449). **과거 역할·작업 기록:** #276·#255는 역사적 참고입니다. 상세 설명은 [README](README.md), 기술 계약은 [Architecture](Architecture.md)에 있습니다.


**2026-11-06 이전 합성·시연 반영 기록(역사적 스냅샷):** [PR #292](https://github.com/ot4562-glitch/HUFS-One-AI/pull/292)(학업 독립 참조모형·탐색 예산) · [PR #293](https://github.com/ot4562-glitch/HUFS-One-AI/pull/293)(학사공지 SourceRevision/mock claim·clean HEAD 벤치) · [PR #295](https://github.com/ot4562-glitch/HUFS-One-AI/pull/295)(교과코드 미확인 원장/전망 `forecast-offering-v3`, API `NOT_CONNECTED`) · [PR #304](https://github.com/ot4562-glitch/HUFS-One-AI/pull/304)(공통 UI/발표 S04·공개 합성 Pages 자동배포 유지). 실제 학교 인증·팀원 4명 개인별 데이터/학수번호 132개 공식 매핑·NCP/PG/CLOVA 실행·포스터/모바일/스크린리더 사람 인수는 `NOT_RUN/CONFIGURATION_REQUIRED` 또는 미완료입니다. 운영 제품은 `RELEASE_BLOCKED`이며, 공개 GitHub Pages는 **실자료·외부 AI 호출 없는 합성 시연**으로 `main` push 때 자동 배포를 계속합니다. 원본 `csv/` 다섯 파일은 내용·경로/이름·인코딩·추적 상태를 그대로 유지합니다.

**2026-11-06 이전 코드 진행:** 오너 분할 #267~#275 중 8개·BETA 원본 화면 #277, 학업 전망 #278, 추천 경험 코어 #279가 `main`에 병합됐습니다. [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259) 순수 코어는 CLOSED, #10/#11/#258/#260 및 실제 NCP·Google/PG·학생별 동의/권리·CLOVA·복구 #276은 OPEN. [처음 읽을 가이드 3종](README.md#7-중요-문서--처음-설치하는-분비전공자용). 실제 운영은 `RELEASE_BLOCKED`.
