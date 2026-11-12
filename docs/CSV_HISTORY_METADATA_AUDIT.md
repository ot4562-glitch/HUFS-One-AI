# 공개 Git 기록의 CSV 메타데이터 조사 — #362

**공식 게시·개인정보 동의 판정 문서가 아닙니다.** 현재 공개 저장소에 보호되어 있는 5개 원본은 사용자 지시에 따라 내용·경로·커밋 기록을 변경하지 않습니다.

## 조사 범위

- 현재 [tracked-csv-change-guard](../.github/workflows/tracked-csv-change-guard.yml)는 새로운 PR의 원본 경로 변경만 GitHub 메타데이터로 검사합니다. 이 검사나 .gitignore로 과거 공개 기록·포크를 감출 수 없습니다.
- **경로 제한:** 조사기는 과거 각 커밋의 `csv/` 디렉터리 아래 tracked blob 메타데이터만 셉니다. `csv/` 밖의 과거 CSV, 디렉터리 이동 이전 기록, 유실된 로컬 ref, 다른 포크·캐시의 CSV는 **조사하지 않습니다(UNKNOWN)**. `NO_CSV_IN_FETCHED_LOCAL_REFS`는 “이 제한된 경로에서 관측되지 않음”만 뜻하며, 저장소 전체 또는 외부 공개 노출이 없다는 뜻이 **절대 아닙니다**. 전체 노출 및 동의/권리는 별도 인적 조사입니다.
- 과거 CSV가 일반 파일(`100644`)이 아닌 실행권한·심볼릭 링크·서브모듈 모드로 기록된 경우 **AUDIT_UNAVAILABLE**가 나오며, 해당 모드는 권한 있는 담당자가 비공개로 원인을 확인해야 합니다. 자동으로 안전/무노출이라고 판정하지 않습니다.
- [로컬 기록 조사기](../tests/release/audit_tracked_csv_history.py)는 **수동 실행 전용**입니다. Git rev-list, ls-tree의 로컬 커밋/트리 메타데이터만 검사하며 Git blob 본문이나 개인 파일은 열지 않습니다. 결과는 커밋 수, CSV 기록이 있는 커밋 수, 중복 제거된 blob 버전 수, 한 커밋의 최대 파일 개수뿐입니다. 학생 파일명, 실응답, SHA와 commit 메시지를 출력하지 않습니다.
- 별도 Git 클론에는 원본 blob이 이미 포함될 수 있으므로 권한 있는 신뢰 환경에서만 조사합니다. 스크립트가 원격 fetch, git checkout, git add, 삭제/재작성은 하지 않습니다.
- shallow clone, 읽기 실패, 너무 많은/비어 있는 기록은 **AUDIT_UNAVAILABLE**로 종료합니다. 일반 CI에서는 새 unittest의 **합성 메타데이터 회귀만** 실행하며 실제 Git history CLI는 실행하지 않습니다.
- **원격 fork·미수집 refs·미러·캐시·제3자 공개 기록은 UNKNOWN**. 로컬 조사에서 0건이어도 실제 동의·권리·공개 위험이 없다는 뜻이 아닙니다.

## 수동 실행과 사람 인수

권한 있는 완전한 로컬 클론에서 명령:

    python tests/release/audit_tracked_csv_history.py

출력은 집계 건수와 owner_publication_rights_and_consent=NOT_VERIFIED를 포함합니다. GitHub 관리자/권리 담당자는 포크와 과거 노출을 별도 확인하고 김채윤/자료 제공자에게 **비공개로** 최초 동의 목적, 게시권, 공개 범위, 재식별성, 철회 절차의 근거를 인수해야 합니다. 실제 원본과 학생 개인정보를 공개 이슈/로그에 적지 않습니다.

허가된 공개판 분리/접근 제한 등은 사용자와 데이터 권리자의 승인을 받은 뒤에만 적용하며, 원본 5개나 Git 기록을 임의로 변경하지 않습니다. 따라서 **#362 OPEN / RELEASE_BLOCKED 유지**.
