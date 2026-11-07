# #317 커리어 허브 (BETA, 비공개) · 구현/보안 경계

## 신규 구현: /career
본인 확인된 BETA에서만 OwnerSessionController의 현재 actor 확인 → 본인 동의 → 커서별 포트폴리오와 보관함 → 동의 재확인을 통해 화면을 구성한다. 공개 S01–S05나 REVIEWER에게 owner port를 주지 않는다.

- **프로필:** 기존 GET/PATCH /api/profile CAS 계약을 그대로 사용. 표시 이름, 관심 분야 최대 5개, 희망 직무 최대 3개만 본인이 편집한다. SNS 공개나 학교 공식 프로필·외부 플랫폼 내보내기가 아니다.
- **경험:** 기존 GET /api/experience/cards?view=portfolio, PATCH/DELETE /api/experience/cards/:id와 현재 승인 증거를 재사용. OWNER_CONSENTED 경험만 실제 BETA 타임라인에 표시하며 SYNTHETIC 경험/철회된 주제는 집계하지 않는다. 생성/AI 후보/승인/철회는 기존 /experience 경로에서 처리한다. 수정은 CAS와 재조회로만 반영하며 stale 후보를 자격 인증으로 승격하지 않는다.
- **로드맵:** 사용자가 직접 선택한 희망 직무/관심 분야와 현재 유효한 경험 승인 주제의 차집합만 표시한다. '탐색할 분야'는 학업 성취·숙련도·지원 자격·합격률·개인 취업 추천을 예측하지 않는다. TOPIC_CODES 기존 24개 폐쇄 어휘 유지.
- **보관함:** 기존 본인 소유 BOOKMARK 상태를 자기 입력의 진행 단계로만 표시. 실제 지원/채용 시스템 결과 연동을 주장하지 않는다.
- **AI:** 커리어 화면은 자동 외부 API 호출·유료 작업 생성을 하지 않는다. /owner-ai는 별도 명시적 실행·기존 작업 수동 재조회 경로이며 실 Provider 데이터가 없다면 NOT_RUN.
- **안전:** 본인 저장 동의가 없으면 이름/경험/보관함 전체를 비운다. 첫 6×20 경험 및 3×50 보관함만 읽는 bounded cursor; 자료가 더 있으면 '일부 기록' 고지를 띄워 전체 역량 인벤토리라고 주장하지 않는다. 읽기 전후 actor 재확인 및 동의 version 변화 시 fail-closed. 공개 Pages·localStorage에 개인 자료 영구 저장 안 함.
- **검증:** packages/core/src/career/owner-roadmap.test.ts는 권한 해제, 현재 승인, 가상 자료 혼입, cursor 중복, 미완 페이지, 지원 단계 자체 신고를 테스트한다. 실제 BETA 서버·학교 인증·스크린리더·다중 계정 사람 인수는 #325/#318의 별도 검증.

## #317 남은 작업/외부 의존

| 항목 | 현재 상태 |
| --- | --- |
| FEAT-01/02 경험 선택·모델 후보·사람 승인 | 기존 /experience의 owner 경로 재사용. 실제 승인 AI 공급자는 #321/#322/#325 인수 전 성공 주장 금지 |
| FEAT-03 관심/승인 기반 로드맵 | /career 구현, 추천 품질/활용성 사람 검증 NOT_MEASURED |
| FEAT-04/05 개인 삭제·프로필 | 기존 CAS API와 신규 /career 폼 연결. 전 계정 데이터 삭제/보존 정책은 별도 |
| FEAT-06/07/08 타임라인·승인·지원 단계 | 기존 workspace/approval/bookmark API 기반 read/edit/delete 연결, 학교/기관 공식 증빙 연동 없음 |
| FEAT-09 실기기/보조공학·독립 운영 인수 | NOT_RUN |
| FEAT-10/11/12 실 Provider 영수증·캐시·재실행 | /owner-ai의 승인된 작업/수동 조회에 LIVE_PROVIDER_RUN·CACHED_PREVIOUS_RUN·SYNTHETIC 표시 계약 추가. 전체 작업 이력/금액·성능 실측/실제 NCP 호출은 아직 미완료 |
| FEAT-13 기관 홈페이지 출처 | 별도 organizationWebsite HTTPS/verifiedAt/evidenceRef 계약·REAL 검증된 공고의 상세 링크를 구현. 운영에서 실제 기관 홈페이지의 신뢰/권리/링크를 승인·등록한 사례는 없음 |
| FEAT-14 연합·외부 동아리 확장 | SYNTHETIC 모집글의 CAMPUS/INTER_UNIVERSITY/EXTERNAL 범위 필드 및 가상 게시판 라벨 추가. 실제 연합/교외 동아리의 운영·기관 동의·관리자 승인 기능은 별도 계약/권한 필요 |
| FEAT-15 규칙/AI 전후 비교 | 기존 출처 정정 비교와 신규 AI 전후 구별 필요. 근거 없는 실모델 비교 미완료 |

RELEASE_BLOCKED 실서비스 게이트 불변. 기존 csv/ 원본 5개·TUNING/REPORT split·API/DB 권한·실제 데이터/Google/NCP 구성은 변경하지 않는다.
