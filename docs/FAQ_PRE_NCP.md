# #341 공식 근거 FAQ — NCP/HCX 연결 전 단계 인수

> 2026-11-12 KST. 이 문서는 **서버에서 검증된 FAQ 원문을 운영자가 별도 주입한 경우**에만 동작하는 개발 경계를 설명합니다. 학교 공식 답변·학사/장학/선발 판정이 아니며, NAVER HCX-007이 실제로 호출되었다는 증거가 아닙니다.

## 구현된 오프라인/합성 경계

- 기존 `packages/core/src/campus-assist/faq.ts`의 문단 검색은 현재 `documentId/sourceRevision`·KST 유효기간·인용 ID·이용권·철회·오염된 이중 출처 상태를 확인합니다. 합성 BM25 검증 100건 이상은 **개발 회귀**, 사람 독립 Gold가 아닙니다.
- `apps/api/src/modules/campus-assist-http.ts`: 서버 BETA 세션을 확인하고, **운영자가 명시적으로 승인된 `faq` source port**를 주입한 경우에만 검색합니다. 권리/actor/TTL을 조회 전후 재확인합니다. `hcx007` 유료 port가 없으면 `CONFIGURATION_REQUIRED` 유지, 생성형 답변·원문 문단·인용/모델 usage 대신 최대 6개의 **검증된 현재 공식 링크 메타데이터(`documentId,revisionId,title,sourceUrl,verifiedAt`)만** 돌려줍니다. 권리 철회/세션 변경 시 링크도 반환하지 않습니다.
- `packages/contracts/src/campus-assist/index.ts`: 위 읽기 전용 출처 링크 DTO를 명시했습니다. 기존 no-model 응답에서 `sourceLinks`는 **선택 필드**로 하위 호환됩니다. 누구나 주어진 URL로 직접 조회하는 공개 엔드포인트를 추가한 것이 아닙니다.
- `apps/web/src/features/campus-assist/OwnerPanels.tsx`: HCX 설정 없을 때 사람에게 **출처 URL/검증일만** 표시하며 `AI 답변 후보`를 허위 생성하지 않습니다. 질문/port 변경이나 unmount 중 이전 비동기 답을 폐기합니다.
- HCX 허가 port가 구성됐을 때도 `buildFaqHcx007Request`는 예산 admission 전에 실행되며, 원본 문단의 학번·전화·메일·이름/긴 식별번호를 발견하면 **문단 전체를 거부**합니다(인용 검증이 깨지지 않도록 임의 삭제/부분 마스킹하지 않음). 질문 자체는 기존 개인정보 마스킹만 모델에 전달합니다. 합성/실원본 혼합도 거부합니다. 무권한 모델 자동 대체/유료 호출을 만들지 않습니다.
- 회귀: `tests/api/campus-assist-http.test.ts`, `packages/ai/src/faq-hcx007.privacy.test.ts`, `apps/web/src/features/campus-assist/OwnerFaqPanel.test.tsx`. CI 정확한 HEAD 확인과 독립 리뷰 전에는 완료라고 표시할 수 없습니다.
- 한국어 붙인 부정 표현의 대조는 별도 AI 주담당 [PR #483](https://github.com/ot4562-glitch/HUFS-One-AI/pull/483)에서 진행 중입니다. 이 작업은 `faq-guard.ts` 또는 #483 브랜치를 덮어쓰지 않습니다.

## NCP/실자료·학교 인수 전 미완료

1. 한국외대 공식 FAQ·OIA·학사·학과 공고별 **원본 접근/색인/저장/외부 HCX 전송·재게시 권리**와 현행 source-head·효력·문단 span/hash의 독립 검수. 학생 의견/블로그를 공식 규칙으로 대체하지 않음.
2. 비용·쿼터 승인/영속 admission, 실제 **HCX-007 v3** 요금/키/네트워크 권한·실 타임아웃/429/503/재시도 안전성, 프롬프트·원문/개인정보 격리·완전한 citation 대조를 실 NCP에서 검사. 승인 전 AI 답변 미제공.
3. FAQ 검색의 정보범위·학년도/학기/캠퍼스/학과 필터, 정정·철회 시 인덱스/캐시 purge, 실원문 검색 실패 vs 검색 범위/권한 없음 구분과 사용자 질문 명확화.
4. 동료 교차 검증과 사람 독립 Gold의 인용 정합성, 한국어 부정/어휘·숫자·날짜/학점 반례, 부적절한 개인 판정 0, 320/360/390/768/1440px 접근성 및 실제 학생 사용성 테스트.
5. 실제 HCX 비용, 실학교 문서 인용/외부 공급자 전송, NCP 민감 로그/키·장기보관 관리가 미준비면 `CONFIGURATION_REQUIRED`/거절 상태를 유지.

**상태:** NCP `NOT_CONNECTED`, 공식 문서 사용권·유료 HCX·독립 Gold `NOT_RUN`, 실서비스 `RELEASE_BLOCKED`. #341은 OPEN입니다.
