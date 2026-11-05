# 경험·학생 승인 태그 API

담당 범위는 #257 공통 계약·API·DB입니다. 추천 알고리즘/역량 추출 정책은 #259, UI는 #258, 교과 근거는 #260의 협업 범위입니다. 프로젝트 승인 상태는 OWNER_CONFIRMED_APPROVED이며 실제 데이터는 로그인한 사용자의 현재 소유권과 버전에 맞게 처리합니다.

## 기존 동작

`/api/experience/cards`와 `/:id`의 CRUD, `/:id/tag-approval`의 읽기/승인/철회는 유지합니다. 승인 값은 `LOCAL_USER_SELECTION`이며 역량 인증서나 자동 AI 승인 결과가 아닙니다. 내용/동의 버전이 바뀌면 기존 태그를 재사용하지 않습니다.

## 포트폴리오 조회

```http
GET /api/experience/cards?view=portfolio&limit=20
```

`view`를 생략하면 기존 `{items,nextCursor}` 형식을 그대로 반환합니다. 포트폴리오는 페이지당 최대20개 경험과 `asOf`, `consentVersion`, 경험별 `contentVersion`/현재 태그 승인, 태그별 근거 experience ID를 제공합니다. `afterId`로 페이지를 넘깁니다. **페이지에 포함된 경험만 집계**하며 전체 경력 총점·숙련도·부족 능력 등은 추정하지 않습니다.

필수 서버 서비스는 selfAccount, ownerWorkspace, experienceApproval입니다. 이 중 하나라도 없으면 portfolio 조회는503입니다. 실제 사용자 role·세션 확인 및 no-store는 유지됩니다. 조회 중 내용/승인/동의 버전이 달라지면409, 현재 저장 동의가 철회됐으면403, 세션이 만료되면401로 응답합니다. 이 조회는 의존 버전을 재검사하지만 DB 전체에 걸친 원자적 write receipt는 아닙니다.

## 프런트엔드/추천 인계

`ExperiencePortfolioQuerySchema`, `ExperiencePortfolioSchema`가 공통 계약입니다. 응답의 ACTIVE 승인 태그만 선택된 경험의 개인화 신호로 사용합니다. 서버 응답으로 돌아온 사용자 승인과 AI 후보를 구분하며, 후보를 생성하거나 자동 승인했다고 표시하지 않습니다.

**잔여 구현:** 사용자 선택 경험을 실제 provider input에 등록하고 AI 후보/근거 버전에 결속하는 어댑터, UI와 추천 소비자 연결은 #257/#258/#259에서 별도 완료 증거가 필요합니다. 현재 portfolio endpoint만으로 전체 AI 커리어 기능이 완성됐다고 주장하지 않습니다.

테스트: `tests/api/experience-portfolio.test.ts`, `tests/api/experience-portfolio-http.test.ts`; 기존 경험 승인·삭제/철회·PostgreSQL 회귀도 함께 실행합니다.