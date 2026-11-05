# 경험·학생 승인 태그 API

담당 범위는 #257 공통 계약·API·DB입니다. 추천 알고리즘/역량 추출 정책은 #259, UI는 #258, 교과 근거는 #260의 협업 범위입니다. 프로젝트 승인 상태는 OWNER_CONFIRMED_APPROVED이며 실제 데이터는 로그인한 사용자의 현재 소유권과 버전에 맞게 처리합니다.

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

## 선택 경험 → AI 역량 후보 → 학생 승인 연계 (PR #264)

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

## 승인된 AI 역량 후보 조회 (PR #264)

```http
GET /api/experience/cards/:id/ai-skills/:jobId
```

운영자가 검토한 experience→source revision→provider input 결속을 등록하면, 본인 BETA 세션의 정산된 `experience_skills` 후보를 조회합니다. 서버는 **같은 세션의 실제 SETTLED job, 현재 경험 내용 버전·개인 AI 동의 버전·원본 근거, 권한·삭제·철회 상태를 재검증**합니다. 변경 중이면 후보를 반환하지 않습니다. 모델 결과는 `NEEDS_REVIEW`이며 **사용자가 기존 `tag-approval` API에서 직접 확인·선택**해야 추천 신호로 들어갑니다. 후보를 자동 승인하거나 역량 인증으로 표시하지 않습니다.

실제 전제 조건: `20261105_ai_consented_personal_inputs.sql` 이후 `20261105_ai_experience_bindings.sql` 적용, operator 전용 current provider input/출처·승인 결속 행 등록, 독립 SQL role 권한, 운영 provider 설정과 승인된 개인 동의. 이 경로가 존재한다는 사실만으로 실제 등록된 경험/모델 처리·통합 UX가 완료된 것은 아닙니다. UI/추천 소비는 #258/#259 담당입니다.

**현재 구현 경계:** `PostgresExperienceSkillInputRegistrar`의 운영자 전용 등록 코드와 분리된 SQL 역할·독립 검증 포트가 존재합니다. 실제 검토 기록, 학생의 개인별 정보 동의·원본 접근권, 운영 계정/DB·공급자 비용 및 종단 실행은 별도 운영 실측으로 확인합니다. UI·추천 순수 코어의 실제 화면 소비는 각각 #258·#259 담당입니다.

테스트: `tests/api/experience-portfolio.test.ts`, `tests/api/experience-portfolio-http.test.ts`; 기존 경험 승인·삭제/철회·PostgreSQL 회귀도 함께 실행합니다.