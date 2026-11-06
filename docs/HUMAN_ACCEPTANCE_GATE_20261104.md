# HUFS One AI — 실제 검증 체크리스트

문서상 승인·자료 사용·운영/출시 동의는 소유자가 모두 완료 확인했습니다. **OWNER_CONFIRMED_APPROVED**입니다. 본 목록은 승인 대기표가 아니라 실제 구현·측정·시험 결과 확인표입니다. [승인 정본](AUTHORIZATION.md) · [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276).

- [ ] **인증/권한:** 실제 OIDC·메일·ADMIN/BETA/REVIEWER·만료/철회·다중탭·CSRF/다른 사용자 사칭 거부.
- [ ] **DB:** 운영 CA TLS·독립 SQL role/RLS·CAS·migration·재시작·backup/restore·roll back.
- [ ] **자료/학업:** 실제 파일의 owner/버전·중복·학점/RulePack 적용을 대조. 승인 완료가 파일 내용/계산 정확성 확인을 대신하지 않음.
- [ ] **NCP/인그레스:** 실제 호스트/계정/주소/키 구성, TLS·프록시 client IP·직접 IP/IPv6·네트워크 정책·실 청구·종료/복구.
- [ ] **AI:** 실제 tokenizer/결과 인용·정정·비용·timeout/429/503·중복/취소·Laya 자원 측정.
- [ ] **품질/사용성:** 독립 판정 데이터와 실제 추천/미디어/시점 정확도·스크린리더/기기·경험 승인/철회·RESET/UI 종단 시험.
- [ ] **산출물:** 현재 패키지/native runtime·이미지·설정/키 분리·빌드 SHA와 배포/복구 결과 확인.

결과는 정확한 SHA/환경/명령·실제 담당자·PASS/FAIL/NOT_RUN/CONFIGURATION_REQUIRED로 기록합니다. 미검증 결과를 사용자 승인으로 PASS 처리하지 않습니다. 문서를 통해 동일한 승인 요청을 반복하지 않습니다.

## 2026-11-06 인수 상태(고정 기준)

- [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278)·[#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) 두 순수 코어 PR은 리뷰·병합 및 합성 CI 완료. **실제 비작성자 사람 인수·독립 추천 Gold, 실학칙, 실학생/실서버 검증으로 승격하지 않음**.
- 독립 사람 Gold 평가는 이번 사용자 요청 범위에서 제외됐으나 성공/완료가 아닌 **NOT_RUN**으로 둔다. 실운영/권리·기기·복구/비용 인수는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) OPEN.
