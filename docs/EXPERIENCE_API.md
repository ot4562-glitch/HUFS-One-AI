# 경험·학생 승인 태그 API

기존 #257 공통 계약·API·DB 코드는 분할 병합으로 완료되어 이슈가 닫혔습니다. **[#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279)의 경험 역량 후보/현재 승인 추천 순수 코어가 병합되어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 한정된 코어 범위 완료**. 실제 UI는 #258, 교과 근거는 #260, 실 Google/NCP/모델·실학생 데이터는 #276에서 검증해야 합니다. `OWNER_CONFIRMED_APPROVED`는 개인별 현재 권리·동의/버전 검증을 면제하지 않습니다.

## 기존 동작

`/api/experience/cards`와 `/:id`의 CRUD, `/:id/tag-approval`의 읽기/승인/철회는 유지합니다. 승인 값은 `LOCAL_USER_SELECTION`이며 역량 인증서나 자동 AI 승인 결과가 아닙니다. 내용/동의 버전이 바뀌면 기존 태그를 재사용하지 않습니다.

## 포트폴리오 조회

```http
GET /api/experience/cards?view=portfolio&limit=20
```

`view`를 생략하면 기존 `{items,nextCursor}` 형식을 그대로 반환합니다. 포트폴리오는 페이지당 최대20개 경험과 `asOf`, `consentVersion`, 경험별 `contentVersion`/현재 태그 승인, 태그별 근거 experience ID를 제공합니다. `afterId`로 페이지를 넘깁니다. `portfolio.coverage:'PAGE'`는 집계 범위를 현재 페이지로 고정하고, `portfolio.complete`는 현재 응답의 `nextCursor===null`과 일치합니다. **페이지에 포함된 실제 본인 경험(`OWNER_CONSENTED`)에서 학생이 승인한 태그만 `portfolio.topics`에 집계**합니다. 합성 경험은 본인 경력·실추천 신호로 오해하지 않도록 증거 목록에는 표시하되 토픽 합계에서는 제외합니다. 전체 경력 총점·숙련도·부족 능력을 추정하지 않습니다.

필수 서버 서비스는 selfAccount, ownerWorkspace, experienceApproval입니다. 이 중 하나라도 없으면 portfolio 조회는503입니다. 실제 사용자 role·세션 확인 및 no-store는 유지됩니다. 조회 중 내용/승인/동의 버전이 달라지면409, 현재 저장 동의가 철회됐으면403, 세션이 만료되면401로 응답합니다. 이 조회는 의존 버전을 재검사하지만 DB 전체에 걸친 원자적 write receipt는 아닙니다.

## 프런트엔드/추천 인계

`ExperiencePortfolioQuerySchema`, `ExperiencePortfolioSchema`가 공통 계약입니다. 실제 본인 경험(`OWNER_CONSENTED`)에 연결된 ACTIVE 승인 태그만 해당 페이지의 개인화 신호로 사용합니다. `coverage:'PAGE'`일 때 전체 계정 역량이 아니라 부분 집계이며, `complete:false`면 다음 페이지 확인이 필요합니다. 서버 응답으로 돌아온 사용자 승인과 AI 후보를 구분하며, 후보를 생성하거나 자동 승인했다고 표시하지 않습니다.

## 선택 경험 → AI 역량 후보 → 학생 승인 연계 (병합된 분할 PR #268·#273 및 후속)

```http
POST /api/experience/ai-skills/prepare
Content-Type: application/json

{"experienceIds":["EXP-001","EXP-002"]}
```

본인 BETA 세션과 CSRF를 확인해 **이미 실제 소스·AI 전송 권한·입력 개인정보 분류가 검토된** 경험에 대한 `inputRef`/`asOf`를 반환합니다. 최대16개 카드, 변경/미승인 항목은 `unavailable`; 없는 등록을 승인된 것처럼 생성하지 않습니다. 이 단계는 **무료 메타데이터 조회**이며 모델 과금·AI 역량 자동 승인은 발생하지 않습니다.

사용자가 해당 입력으로 기존 `POST /api/ai/experience-skills`를 호출하면 모델 실행기가 예산·동의·근거를 다시 검증합니다. 반환된 job ID는 아래 GET 후보 조회와 연결합니다. 결과를 확인한 사용자가 기존 `PUT /api/experience/cards/:id/tag-approval`에서 직접 선택해야 포트폴리오/추천의 ACTIVE 신호가 됩니다.

### 운영자 전용 실제 입력 등록

`PostgresExperienceSkillInputRegistrar.register`는 **공개 HTTP가 아닌 서버 내부 작업**입니다. 독립 개인정보 리뷰 검증기를 주입해야 하며 현재 사용자 경험 버전·저장/외부 AI 동의·현재 원본 판본/해시·독립 source 검토와 전달 권한을 같은 PostgreSQL 트랜잭션에서 확인합니다. 운영자는 `20261106_ai_experience_input_operator.sql`을 검증된 환경에 적용하고, 독립 non-BYPASSRLS LOGIN에 `hufs_ai_input_operator` 그룹을 직접 부여해야 합니다. 준비 단계는 실제 등록과 다르며 SQL 연결·유료 모델 호출·승인 기록을 임의로 만들지 않습니다.

경험 내용이 변경/삭제되면 데이터베이스 트리거가 기존 provider input 본문을 폐기하고 HEAD를 제거합니다. 개인정보/외부 AI 동의 철회도 기존 입력 payload erasure trigger와 현재 세션 검증을 거칩니다. 원본 확인·사람 리뷰·실제 계정은 본 코드 외부에서 제공되어야 합니다.

## 승인된 AI 역량 후보 조회 (병합된 분할 PR #268·#273 및 후속)

```http
GET /api/experience/cards/:id/ai-skills/:jobId
```

운영자가 검토한 experience→source revision→provider input 결속을 등록하면, 본인 BETA 세션의 정산된 `experience_skills` 후보를 조회합니다. 서버는 **같은 세션의 실제 SETTLED job, 현재 경험 내용 버전·개인 AI 동의 버전·원본 근거, 권한·삭제·철회 상태를 재검증**합니다. 변경 중이면 후보를 반환하지 않습니다. 모델 결과는 `NEEDS_REVIEW`이며 **사용자가 기존 `tag-approval` API에서 직접 확인·선택**해야 추천 신호로 들어갑니다. 후보를 자동 승인하거나 역량 인증으로 표시하지 않습니다.

실제 전제 조건: `20261105_ai_consented_personal_inputs.sql` 이후 `20261105_ai_experience_bindings.sql` 적용, operator 전용 current provider input/출처·승인 결속 행 등록, 독립 SQL role 권한, 운영 provider 설정과 승인된 개인 동의. 이 경로가 존재한다는 사실만으로 실제 등록된 경험/모델 처리·통합 UX가 완료된 것은 아닙니다. UI/추천 소비의 실 사용자 인수는 #258/#276에 남습니다.

**현재 구현 경계:** `PostgresExperienceSkillInputRegistrar`의 운영자 전용 등록 코드와 분리된 SQL 역할·독립 검증 포트가 존재합니다. 실제 검토 기록, 학생의 개인별 정보 동의·원본 접근권, 운영 계정/DB·공급자 비용 및 종단 실행은 별도 운영 실측으로 확인합니다. UI/추천 순수 코어의 **실제 화면 소비는 #258/#276의 잔여 작업**이며, #259 순수 코어 완료와 별개입니다.

테스트: `tests/api/experience-portfolio.test.ts`, `tests/api/experience-portfolio-http.test.ts`; 기존 경험 승인·삭제/철회·PostgreSQL 회귀도 함께 실행합니다.
## 2026-11-06 코어와 UI 통합 주의

- [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) `assessSkillCandidates`는 간단한 키워드/문장 부정 기반 **NEEDS_REVIEW 힌트**다. 실제 역량·숙련도/모델 정확도 또는 채용 성과를 증명하지 않는다.
- `withApprovedExperience`는 입력된 신호로 경험 TopicCode 전체를 **교체**한다. API/UI 연계 전 인증된 현재 BETA actor의 **모든 승인 경험**과 내용/동의 버전을 수집하지 않으면 신호가 누락될 수 있다. 실 UI·owner 소비자 테스트는 #258·#276 후속.
- `csv/` 원본 5개는 Git에 있다고 실학생 계정이나 DB와 자동 매핑되지 않으며 권리/현재 소유권은 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) 운영 검증이 필요하다.
