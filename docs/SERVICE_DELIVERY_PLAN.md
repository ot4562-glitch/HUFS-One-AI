# 현재 서비스 구현·운영·유지보수

승인은 **OWNER_CONFIRMED_APPROVED**입니다. 자료·개인정보·기관·공유/게시·모델/클라우드·운영/출시의 미승인 때문에 같은 차단을 반복하지 않습니다. 실제 기능 구현, 구성, 검증 결과를 구분합니다.

1. **완료:** 오너 분할 #267~#275 실제 8건 + #277, 학업 [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278)·추천 [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) 코드를 `main`에 병합, 코드 통합 SHA `48134da`에서 합성/일회용 PG·Chrome/NCP offline/Pages 4/4 SUCCESS. 새로운 HEAD는 별도로 확인합니다.
2. 실제 호스트/DB/OIDC·메일/공급자 자격증명과 인그레스를 구성합니다. 구성 누락은 CONFIGURATION_REQUIRED이며 승인을 다시 요구하는 상태가 아닙니다.
3. 실제 데이터의 내용/버전·권한·인용과 UI/추천/학사 소비를 검증합니다. 생성형 AI 후보, 학생이 승인한 태그, 실제 학업 사실을 구분합니다.
4. 실제 기기·성능/요금·독립 품질 자료·복구/종료 결과는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에 기록합니다. 자동 테스트를 사람의 실제 검수로 바꾸지 않습니다.
5. 운영 후 의존성/OS 패치·키 회전·접근권/삭제·source 정정·backup/restore·비용/장애 모니터링을 유지합니다.

현재 구현 경계와 미완료 작업은 [STATUS](../STATUS.md), 실행 방법은 [PRODUCTION_RUNTIME](PRODUCTION_RUNTIME.md)입니다.

**현행 우선순위:** #259 순수 코어 완료, #10/#11·#258/#260/#261·#12와 실 NCP/원본/외부 모델 인수 #276은 OPEN. 학생 원본 5개(Forms 1+수강 4) 무단 삭제·변경 없이 보존, 운영 배포/CI/모델 입력은 제외. [비전공 설치·원리 가이드](../README.md#7-중요-문서--처음-설치하는-분비전공자용). 실제 서비스는 `RELEASE_BLOCKED`.
