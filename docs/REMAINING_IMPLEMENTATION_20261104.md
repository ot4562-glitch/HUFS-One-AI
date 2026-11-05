# 현재 남은 코드와 실제 구성·검증

**승인:** `OWNER_CONFIRMED_APPROVED`. 이 정본은 승인 대기를 뜻하지 않습니다. 실제 배포·계정·원본·비용 및 제3자 품질 인수는 검증 증거가 있을 때만 완료로 기록합니다. 코드 담당은 #253/#257, 실행·인적 검증은 #252, 협업 총괄은 #255입니다.

## 현재 PR #264에 있는 구현

- 명시적인 production 구성과 안전한 `--plan`/`--apply` 실행, 관리 SQL 역할·RLS·독립 AI 예산/입력/정산, 소유권·철회·권한의 현재 상태 검사를 구현했습니다.
- 경험 CRUD/포트폴리오, 다중 경험 선택, 운영자 전용 input 등록, 현재 판본/동의 결속, `NEEDS_REVIEW` AI 후보 조회와 학생 승인 태그 API가 존재합니다. 화면 #258과 추천 순수 코어 #259의 실제 소비 완료는 별도입니다.
- 학업 What-if의 PostgreSQL 읽기 어댑터와 관리형 연결을 구현했습니다. #265에서 병합된 주전공별 이중전공/부전공 RulePack 선택을 통합하고, 학업 경로가 지정되지 않은 주전공 팩을 거부하도록 강화했습니다. 공식 학칙·실학생 자료의 판정이 검증되었다는 뜻은 아닙니다.
- API/설계 inventory의 직접 미매핑 7개 경로를 실행 가능한 정적 감사에서 다음과 같이 분류하고, 관련 API를 **정확한 대체 URL인 것처럼 주장하지 않도록** 했습니다.
  - `POST /api/auth/login`: 의도적으로 폐기된 비밀번호 로그인.
  - `POST /api/demo/contexts/:id/plans/simulate`, `POST /api/demo/contexts/:id/outlook/scenarios`: 시연 문맥에서 별도 가정 DTO·현행 grant/source/asOf·CSRF 검사를 수행하는 API를 별도 기능 PR에서 구현했습니다. 학생의 실제 학점/공식 개설 확정으로 바꾸지 않습니다. 사용자 UI 소비와 운영 실측은 미검증입니다.
  - `GET /api/demo/contexts/:id/experiences`, `GET /api/demo/contexts/:id/saved-items`, `POST /api/demo/contexts/:id/actions`: 개인 상태/보관함/REVIEWER 관련 **별도 범위의 현행 API**가 있으나 설계 URL과 정확히 일치하지 않습니다.
  - `POST /api/academics/import/preview`, `POST /api/academics/import/apply`, `POST /api/admin/corpus/approve`: 개인 원본·승인 관련 **운영자 전용 비공개 절차**로 유지; 무인증 공개 엔드포인트를 추가하지 않습니다.

## 미완료 범위 — 코드/설정/실행 결과를 구분

- 운영 API `production-main.js`는 loopback 기본 실행과 별도 승인 사설 컨테이너 IPv4 바인딩 코드를 갖춥니다. 하지만 실제 operator factory·NCP host·network/ingress·Google/학교메일·CA TLS/role GRANT·DB migration/backup/rollback 및 AI provider·가격·토큰을 구성한 종단 시험은 `CONFIGURATION_REQUIRED` 또는 `NOT_RUN`입니다.
- SourceRevision/Temporal RAG·문서/이미지/PDF·native worker와 비용 정산의 전체 운영 소비와 취소/오류/동시성 회귀, native/NOTICE/SBOM·패키징·비밀 유출 검증은 #253에서 계속 확인해야 합니다.
- 경험 후보→학생 승인→추천 projection을 UI #258·추천 #259의 실제 사용자 경로에서 검사하고, 학업 자료는 #260과 독립 교차 리뷰가 필요합니다.
- 합성 자동 CI와 운영/사람 인수를 혼동하지 않습니다. 최신 코드 SHA의 TypeScript·PostgreSQL·Chrome·NCP 오프라인 결과를 별도로 조회합니다.
- 실제 학생·기관·학칙 원본, NCP/AI 사용량·비용, 독립 사람 Gold·스크린리더·최종 출시 판정은 #252에서 사실적 증거로 검증합니다.

개인별 현재 동의/철회·신원/역할, RLS, CSRF, 비밀키·토큰 보호는 프로젝트 전체 승인이 완료됐어도 유지합니다.