# 2026-10-29 후속 참고자료 수집

범위: 현재 Proposal.md의 참고자료 URL 및 공식 HUFS 심벌/시그니처 안내. 공개 비로그인 일회 조사이며 사이트 전체 크롤링·정기 제품 feed·학생 계정 열람이 아니다.

**결과:** 출처 45개 점검, 신규 HTML 원문 31건 저장, 기존 로컬 원문 11건 재사용, 사용자 제공 UI 규정집 1건 재사용, 접근 실패 2건. 원문 URL·시각·파일 해시·상태는 `manifest.json`을 확인한다. `SAVED`는 해당 응답이 보존됐다는 뜻이지 모든 동적 기능·표·본문이 완전히 분석됐다는 뜻은 아니다.

원본 `raw/`, 추출 `text/`는 Git 제외이며 삭제하지 않는다. 아래 자체 작성 색인·출처 manifest는 협업 대상이다. 공식 RGB·배경·심벌 기준은 Proposal.md §3.4에, 사용자 제공 로그인 인덱스 분석은 §2.6에 반영했다.

| ID | 수집 상태 | 추출 문자 수 | 추가 확인 |
| --- | --- | ---: | --- |
| H1-1 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| H2-2 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| H3-3 | SAVED | 3541 |  |
| C1-4 | SAVED | 6478 |  |
| C2-5 | SAVED | 4293 |  |
| BRAND-01-6 | SAVED | 6763 |  |
| BRAND-02-7 | USER_SUPPLIED_LOCAL | - | 기존 로컬 파일 재사용 |
| SRC-H03-8 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| SRC-H07-9 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| SRC-H09-10 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| SRC-G01-11 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| SRC-G02-12 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| SRC-G03-13 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| SRC-G04-14 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| SRC-G10-15 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| SRC-G12-16 | ALREADY_LOCAL | - | 기존 로컬 파일 재사용 |
| U1-17 | SAVED | 6482 |  |
| U2-18 | SAVED | 12618 |  |
| U3-19 | SAVED | 4345 |  |
| U4-20 | SAVED | 77 | 짧은 정적 응답: 동적 본문 별도 확인 필요 |
| U5-21 | SAVED | 12362 |  |
| U6-22 | SAVED | 3674 |  |
| U7-23 | SAVED | 2672 |  |
| U8-24 | SAVED | 11683 |  |
| U9-25 | SAVED | 1156 |  |
| U10-26 | SAVED | 1567 |  |
| U11-27 | FAILED_REVIEW | - | ValueError: unsupported or unexpected content |
| N1-28 | SAVED | 9010 |  |
| N2-29 | SAVED | 1624 |  |
| N3-30 | SAVED | 5944 |  |
| N3-31 | SAVED | 17440 |  |
| N4-32 | SAVED | 10088 |  |
| N5-33 | SAVED | 5502 |  |
| N6-34 | SAVED | 4746 |  |
| N7-35 | SAVED | 1934 |  |
| N8-36 | SAVED | 10440 |  |
| N9-37 | HTTP_ERROR | - | 404 |
| T1-38 | SAVED | 13091 |  |
| T2-39 | SAVED | 3673 |  |
| G1-40 | SAVED | 24703 |  |
| G2-41 | SAVED | 4321 |  |
| G3-42 | SAVED | 13735 |  |
| G4-43 | SAVED | 14582 |  |
| BRAND-SYMBOL | SAVED | 6069 |  |
| BRAND-SIGNATURE | SAVED | 5722 |  |

## 범위와 남은 제약

원문 HTML은 외부 CSS/이미지 전체를 저장한 완전 오프라인 사이트가 아니다. 로그인·동적 추천·폼 접수·비공개 API를 실행하지 않았다. 짧은 HTML/동적 렌더링 안내가 있으면 원문의 해당 부분을 추가 확인해야 한다.

이전 학사 조사에서 `wis.hufs.ac.kr`의 전체 자동 수집 금지와 학과 `/bbs/` 제한을 확인한 경로는 이번에도 우회하지 않았다. 따라서 실제 5명 각각의 최신 학과 제출기한·개별 인정 예외는 자료 제공/공식 확인이 필요한 상태다. 이번 참고자료 수집으로 그 개인 적용 검증이 끝났다고 주장하지 않는다.

아래 실패는 성공 수에 포함하지 않는다.

- U11-27 — FAILED_REVIEW / ValueError: unsupported or unexpected content

- N9-37 — HTTP_ERROR / 404

수집 스크립트: `tools/collect_missing_references.py`. 새 자료 수집은 명시적 `--collect` 실행일 때만 수행한다. 이미 확인된 실패를 무한 재시도하지 않으며, 외부 전송·원본 재배포 허가로 해석하지 않는다.
