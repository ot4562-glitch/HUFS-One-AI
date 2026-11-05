# HUFS One AI — 학생 원본·권한·자료 준비 확인

**현재 범위:** 참여자 5명 모두의 공모전 참여 동의와 HUFSAbility 자료 수집 허가는 사용자 확인 사항입니다. 실제 과목 CSV·Forms 원본 제공자는 **4명**입니다. 이 정보는 목적별 게시/외부전송·NCP·모델 이용권의 포괄 승인이 아닙니다.

## 필요한 입력과 보안 경계

| 구분 | 파일 형태와 검증 | 수락 상태 |
| --- | --- | --- |
| 학기별 수강 내역 | 개인별 6열 CSV 4개, 과목/학점/상태·코호트·전공·중복/재수강과 owner alias 대조 | 실제 인입·권리/손계산 미수락 |
| 관심/경험 양식 | 26열 Forms, 4응답, 원본 SHA·owner/actor·목적·철회 매칭 | 실제 인입·권리/손계산 미수락 |
| 공식 학사 규칙 | 문서 판본·학년도/전공·영역·중복/교환·언어 속성·근거 문장 | 독립 RulePack 승인이 필요 |
| 합성 시연 | S01–S05/EMPTY/REVIEWER의 가상 정보 | 실제 학생 원본과 구분해 코드/CI 사용 가능 |

## 실제 검토 체크리스트

- [ ] 4명 각 파일의 **현재 목적별 동의/철회·보관·팀 공유·Git 최초 게시·NCP/외부 AI 전송·발표 공개** 권한을 제한 접근 원장으로 확인.
- [ ] 26열 Forms·6열 CSV 헤더/인코딩/BOM/동명이인·중복열·다른 학기·이수상태·원본 SHA를 사람과 독립 대조.
- [ ] 학생별 `FORM_RECEIVED`, `COURSES_RECEIVED`, `STUDENT_REVIEWED`, `RULE_MATCHED`, `INDEPENDENTLY_VERIFIED`, `DEMO_READY`를 각각의 실제 검증 근거로 표시.
- [ ] 4명별 학점/계획/What-if를 공식 RulePack 원문과 수기로 대조. 확인할 수 없으면 DRAFT/UNKNOWN을 유지.
- [ ] 민감한 실제 원문·실명↔SID·비밀키를 Git/PR/CI/공개 사이트/AI 프롬프트·로그에 노출하지 않음.

**작업 정본:** [#252 B03/B04](https://github.com/minseong-hufs/HUFS-One-AI/issues/252) · [개인정보 거버넌스](docs/DATA_GOVERNANCE.md) · [학업 구현 #11](https://github.com/minseong-hufs/HUFS-One-AI/issues/11). 실제 원본의 읽기/반입은 별도 승인 전 하지 않습니다.
