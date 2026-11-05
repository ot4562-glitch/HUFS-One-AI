# HUFS One AI — 현재 제품 실행 순서

## 승인

문서에 기재된 모든 승인은 소유자가 완료 확인했습니다. **OWNER_CONFIRMED_APPROVED**이며 승인 대기로 기능 전체를 막지 않습니다. 실제 환경/자격증명·코드·시험 상태는 별도로 관리합니다.

## 실행

1. 최신 코드 SHA·설치 의존성을 확인하고 타입/계약·합성/거부·격리 PostgreSQL·Chrome CI를 실행합니다. 실패와 SKIP은 그대로 기록합니다.
2. 개발 시 합성 계정·EMPTY_DEMO를 사용하고 실제 사용자 서비스는 별도 production 구성으로 연결합니다. 개발용 계정을 실제 인증으로 사용하지 않습니다.
3. [PRODUCTION_RUNTIME](PRODUCTION_RUNTIME.md)에 따라 실제 OIDC/학교메일·DB role/CA TLS·선택 서비스·공급자 설정을 서버 비공개 factory에 주입합니다. 주소/자격증명 누락은 CONFIGURATION_REQUIRED입니다.
4. `production-main --plan`으로 설정 요구를 확인한 뒤 명시적 `--apply`로 시작합니다. 서버는 실제 role 확인 후 loopback에서 TLS 인그레스 뒤에 바인딩합니다.
5. 실환경 테스트·요금/CPU/RSS·복구·학생 경험/학사 결과·자료 원문·인용/미디어 품질·기기 사용성을 #252에 기록합니다.

경험·태그/포트폴리오/추천·학업/AI 기능은 로그인한 소유자의 현재 자료·버전·권한을 따릅니다. 승인 완료는 타인 사칭·원문 오류·비밀키 노출이나 삭제 무시를 허용하지 않습니다. 실제 시험/측정하지 않은 값을 완료했다고 작성하지 않습니다.
## 2026-11-06 분할 작업과 실행 증거

현재 소유자 작업은 [#267](https://github.com/ot4562-glitch/HUFS-One-AI/pull/267) → [#268](https://github.com/ot4562-glitch/HUFS-One-AI/pull/268) → [#269](https://github.com/ot4562-glitch/HUFS-One-AI/pull/269) → [#270](https://github.com/ot4562-glitch/HUFS-One-AI/pull/270) → [#272](https://github.com/ot4562-glitch/HUFS-One-AI/pull/272) → [#273](https://github.com/ot4562-glitch/HUFS-One-AI/pull/273) → [#274](https://github.com/ot4562-glitch/HUFS-One-AI/pull/274) 순서로 병합해야 합니다. 이전 대형 PR #264는 미병합 종료됐습니다. [운영/실자료/품질 인수 원장](OWNER_TRACK_RELEASE_EVIDENCE_20261106.md)에서 실제 계정·소스·공급자 확인 결과를 추적합니다. 합성 결과를 실환경·실비용의 PASS로 승격하지 않습니다.
