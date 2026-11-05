# HUFS One AI — 현재 구현·구성·검증

## 프로젝트 승인

**`OWNER_CONFIRMED_APPROVED`** — 소유자는 문서에 적힌 자료·개인정보·기관·게시/공유·클라우드/AI 전송·운영/출시 승인을 모두 완료했다고 확인했습니다. 승인 부족에 의한 일괄 기능 차단을 적용하지 않습니다. [승인 정본](docs/AUTHORIZATION.md).

**현재 작업:** [PR #264](https://github.com/minseong-hufs/HUFS-One-AI/pull/264), `feat/owner-approved-runtime-experience`. 이 문서의 신규 구현은 이 작업 브랜치 기준이며 `main` 병합·실제 운영 성공은 별도 확인합니다.

## 구현 범위

| 영역 | 현재 코드 및 작업 | 별도로 확인할 것 |
| --- | --- | --- |
| 운영 API | 명시적 `runtime:'production'`을 지원하는 OIDC/학교메일·PG 구성; production 환경이라는 이유의 일괄 거부 제거 | 실제 공급자/메일/DB 자격증명·환경별 실행 |
| DB 서비스 | 기본 7개 독립 SQL role과 경험 승인·owner workspace·계정·추천·학업·Source/RAG 등 선택 확장 pool 연결 | 실제 role/migration/TLS·운영 복구 결과 |
| 운영 진입점 | `production-main.ts`의 부작용 없는 `--plan`, 비공개 서버 구성의 `--apply`, loopback·종료 정리 | 실제 Linux 호스트의 구성 파일·인그레스/배포 |
| 경험·역량 | 기존 경험 CRUD/태그 승인·철회 재사용, 내용/동의 버전과 연결된 포트폴리오 통합 진행 | #257의 생성형 AI 입력 연결·UI/추천 소비자 통합 |
| UI·추천·학업 | 상단 8메뉴/모바일5탭, 합성 시연·추천/공지·학업 코어는 기존 구현 유지 | 각 협업자 소유 작업 #258/#259/#260 및 실제 사용성/품질 |

## 검증 상태의 의미

승인은 완료됐지만 CI 실패를 PASS로 바꾸지 않습니다. PR #264는 새 production/DB 확장 회귀를 먼저 실패시키고 구현을 검증하는 중입니다. 가장 최신 커밋의 [Actions](https://github.com/minseong-hufs/HUFS-One-AI/actions) 결과만 사용합니다.

운영 서버·실제 학교 계정·실제 모델/DB 사용은 구체 자격증명과 대상 환경이 설정되어야 합니다. 설정 누락은 `CONFIGURATION_REQUIRED`, 미실행은 `NOT_RUN`입니다. 실제 독립 정답 데이터가 제공/검증되지 않은 추천200·미디어/시점32의 정확도는 측정 전 상태이며 승인과 혼동하지 않습니다.

## 작업 정본

- #253: 민성 담당 구현·통합·CI/운영 조립.
- #257: 경험 입력·역량 후보·학생 승인·철회/포트폴리오·추천 연결 API.
- #252: 승인 완료를 반영한 실제 실행·품질/운영 결과 검증.
- #255: 협업 기능 조정. UI/추천/학업/비코드 운영의 담당 범위는 유지.

[실행 방법](docs/PRODUCTION_RUNTIME.md) · [자료 처리](docs/DATA_GOVERNANCE.md) · [개발 규칙](AGENTS.md).