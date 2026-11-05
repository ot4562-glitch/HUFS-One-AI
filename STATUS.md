# HUFS One AI — 현재 구현·구성·검증

## 승인 및 권한

프로젝트 소유자는 문서 범위의 자료·개인정보·기관·공유·클라우드/모델·운영 승인을 모두 완료했다고 확인했습니다. 프로젝트 상태는 **`OWNER_CONFIRMED_APPROVED`**이며 과거 승인 대기를 이유로 기능 전체를 차단하지 않습니다. [정본](docs/AUTHORIZATION.md).

승인은 실사용자별 동의·인증·권리/철회·비밀 관리·출처 검증이나 실제 환경 설정의 대체가 아닙니다. 없는 운영 자격증명·계정·주소는 `CONFIGURATION_REQUIRED`, 실행하지 않은 검증은 `NOT_RUN`입니다.

## 코드 현재 상태

| 영역 | 존재하는 구현 | 실제 실행·품질 상태 |
| --- | --- | --- |
| 운영 API/인증 | Fastify·Zod·OIDC/학교메일·역할/세션/CSRF, `runtime:'production'` 및 비공개 `production-main.ts`의 `--plan`/`--apply` | 실제 Google/메일/호스트/TLS 연결은 별도 운영 구성 필요 |
| 데이터베이스 | 기본 7개 분리 SQL 역할, 경험/계정/추천/학업/Source 확장 역할, FORCE RLS/CAS·삭제·철회 | 실제 운영 DB migration/복구/역할·CA TLS는 운영 환경에서 확인 |
| 학업·What-if | 검증된 학사 순수 코어와 관리형 `majorWhatIfPostgres` 로더 연결, 독립 권한·원본 RulePack 확인 | 개인 학사 원본/실학교 환경과 사람 인수는 `NOT_RUN` |
| 경험/커리어 | 경험 CRUD·포트폴리오, 학생 직접 태그 승인/철회, 복수 경험 선택 `prepare`, 독립 검토된 AI 입력의 operator-only 등록, 현재 owner/경험/동의/source 버전 결속, `NEEDS_REVIEW` AI 후보 조회 | 실제 운영자 리뷰/소스·AI 공급자·학생 종단·UI/추천 소비자의 통합 실측은 별도 |
| AI/비용 | HCX 관리 SQL 3역할(입력·예산·결과), 필요시 네 번째 비공개 입력 등록 역할, 후보/근거/과금·중복·철회 검증 | 실제 공급자 사용·가격/토큰·비용 실측은 `NOT_RUN` |
| UI·추천·학업 코어 | 기존 React UI, 합성 시연, 추천/공지/학업 로직, 팀 소유 트랙 유지 | #258/#259/#260 소유 기능과 실제 사용성/Gold 평가는 별도 |

## 분할 PR과 빌드/검증 (2026-11-06)

기존 대형 PR #264는 **병합하지 않고 미병합 종료**했습니다. 최신 `main` 기준으로 협업자 코드를 보존하고 아래 순서의 **스택형 PR**로 분할했습니다.

[#267](https://github.com/ot4562-glitch/HUFS-One-AI/pull/267) → [#268](https://github.com/ot4562-glitch/HUFS-One-AI/pull/268) → [#269](https://github.com/ot4562-glitch/HUFS-One-AI/pull/269) → [#270](https://github.com/ot4562-glitch/HUFS-One-AI/pull/270) → [#272](https://github.com/ot4562-glitch/HUFS-One-AI/pull/272) → [#273](https://github.com/ot4562-glitch/HUFS-One-AI/pull/273) → [#274](https://github.com/ot4562-glitch/HUFS-One-AI/pull/274)

- #267~#270과 #272: 해당 HEAD에서 합성 TypeScript·계약·일회용 PostgreSQL·Chrome·NCP 오프라인 CI 성공을 검증했습니다.
- #273·#274: 경험→AI 후보→학생 승인→추천 HTTP 합성 종단 및 Forms 실양식 YES/NO 해석/음성 동의 테스트. HEAD 검사 결과는 PR Checks에서 **정확한 SHA로 확인**하며 미완료·실패를 자동 PASS로 쓰지 않습니다.
- 실제 운영 서버/네트워크/Google/외대메일/CA TLS/실제 HCX/OCR·유료 청구/원본 파일·학교 공식 학칙은 합성 CI로 대체할 수 없습니다. 이에 대한 상태는 [인수 증거 원장](docs/OWNER_TRACK_RELEASE_EVIDENCE_20261106.md)을 따릅니다. RELEASE_BLOCKED 상태를 유지합니다.

## 담당 범위

- [#267](https://github.com/ot4562-glitch/HUFS-One-AI/pull/267) → [#268](https://github.com/ot4562-glitch/HUFS-One-AI/pull/268) → [#269](https://github.com/ot4562-glitch/HUFS-One-AI/pull/269) → [#270](https://github.com/ot4562-glitch/HUFS-One-AI/pull/270) → [#272](https://github.com/ot4562-glitch/HUFS-One-AI/pull/272) → [#273](https://github.com/ot4562-glitch/HUFS-One-AI/pull/273) → [#274](https://github.com/ot4562-glitch/HUFS-One-AI/pull/274) — 소유자 담당 계약·경험/AI·DB·운영·시연 API·종단/동의 검증의 순차 병합 대상. 기존 [#264](https://github.com/ot4562-glitch/HUFS-One-AI/pull/264)는 대체되어 닫혔으며 병합되지 않았습니다.
- [#253](https://github.com/ot4562-glitch/HUFS-One-AI/issues/253) — API·인증·DB/Source·AI/NCP 및 전체 운영 조립.
- [#257](https://github.com/ot4562-glitch/HUFS-One-AI/issues/257) — 경험·AI 후보·학생 승인·추천 연계 API.
- [#252](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252) — 실제 계정·학생·공급자/운영·인적 품질 증거.
- [#255](https://github.com/ot4562-glitch/HUFS-One-AI/issues/255) — 팀 협업. UI #258, 순수 추천 #259, 학업 증빙 #260, 비코드 운영 #261은 각 담당자가 소유합니다.

[운영 실행](docs/PRODUCTION_RUNTIME.md) · [경험 API](docs/EXPERIENCE_API.md) · [개발 규칙](AGENTS.md).
