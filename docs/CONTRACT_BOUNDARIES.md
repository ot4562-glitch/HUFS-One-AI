# HUFS One AI — 공통 계약·4개 소비 트랙 경계

**현재 정본:** `packages/contracts`의 TypeScript/Zod, 실제 API registrations/DTO·TASK는 [inventory](../tools/api_contract_inventory.json)와 [audit](../tools/audit_api_contracts.mjs), 구현·테스트 최신 상태는 [STATUS](../STATUS.md). 계약 소유/보안 #253, 실원본/실사용자·사람 수락 #252.

## 모든 트랙이 공유해야 할 것

| 계약 | 현재 기준과 실패 시 동작 |
| --- | --- |
| Actor/Subject/Context | actorId는 인증 서버로부터; 합성 demoSubjectId/REVIEWER·실원본 4인 구별. 5슬롯 전환/다중탭·늦은 응답/철회 뒤 이전 데이터 0 |
| Grant/Consent/SourceRights | 목적·현재 기한/철회·COLLECT/STORE/DISPLAY/AI 전송별 scope, SQL/응답 직전 재확인. 명시 권한 없으면 403/NOT_SHARED/BLOCKED_RIGHTS |
| Version/asOf | dataset/projection/grant/consent/overlay/RulePack/SourceRevision/rank/schema/model·수집/검수/공표 시각. 다른 판본의 근거로 답을 확정하지 않음 |
| Topic/Recommendation | 닫힌 TopicCode24, 현재 근거/마감/자격; ELIGIBLE/INELIGIBLE/UNKNOWN, featured/compact와 제외 이유, 정정된 SourceRevision 무효화 |
| Academic | 6열 CSV/26열 Forms/4실원본은 비공개 원장. 정수 CreditUnits, earned·inProgress·planned 분리, RulePack/AREA_SPREAD/GROUP_CHOICE/What-if UNKNOWN |
| AI/미디어 | `SafeLlmPacket`·4제품 작업·인용 exact-match·bbox/original hash, 필요한 source consent, 예산 UNKNOWN_BILLING·비동기 취소 |
| Error/HTTP | code/message/requestId/retryable/contextId?, 401/403/409/422/429/503, SQL/원본/비밀/다른 사용자 메타데이터 비노출 |

## 현재 API와 소비자

등록 경로 **90**, 설계 계약 **39**, TASK **19**. 서류상 **직접 미매핑 9경로**는 모두 신규 route가 필요한 것은 아니다. 비밀번호 로그인 retired, 학사 import private operator, 다른 demo/academic/admin 설계 경로는 실제 등록/소비자와 동치·미구현·의도적 제외를 분류해 #253에 반영한다.

**4개 트랙 교차**:
- 웹/사용자 경험: `apps/web/src`·React/Chrome, 공개/미지원·REVIEWER/ADMIN·접근성/캐시
- 추천/공지: `packages/core/src/opportunities`, `notices`, 결정론/공고·시점 품질
- 학사/전망: `packages/core/src/academics`, `forecast`, 원장/RulePack·실학교 인수 분리
- API/영속: `apps/api/src`, SQL roles/RLS·인증/컨텍스트·Source/AI/문서 증거

계약 추가/수정 시 정상/거부/권한·버전/늦은 응답·실제 소비자/격리 PG·브라우저 테스트를 같은 SHA에서 실행하고 부작용이 없는 기존 기능을 유지한다. 정적 import/entrypoint/DTO 감사의 `UNKNOWN`은 동적 런타임 실행 증거가 아니다.

**검증:**

```sh
npm run typecheck
npm run test:contracts
npm run test:consumers
npm run audit:api-contracts
npm run test:api-contracts
npm run audit:entrypoints
```

실제 학교 권리/비작성자 Gold/기기·NCP 서명은 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)가 독립 판단한다.
