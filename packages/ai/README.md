# HUFS One AI 생성형 AI 구성

경험 기술 후보, 공고 조건 해석, 개인 행동 요약, 졸업 설명의 네 제품 작업을 처리합니다. OCR/이미지/PDF·Temporal RAG 근거와 코드 판단을 조합하고 구조화 결과·인용·수치·현재 사용자 입력을 검증합니다.

프로젝트 승인 상태는 **OWNER_CONFIRMED_APPROVED**입니다. `createPostgresProviderRuntime`은 실제 공급자/SQL 역할·가격·secret 및 서버측 `enabled`를 구성하면 별도의 미승인 기본값으로 차단하지 않습니다. 명시적인 중지 설정은 유지됩니다. 구성 시점에는 DB·키·모델을 호출하지 않고 실제 요청 때 현재 입력/권한·예산을 검증합니다.

프로젝트의 사용 승인과 실제 입력 바인딩·자격증명·가격 정확성은 별개입니다. SafeLlmPacket의 실제 자료 분류를 거짓으로 지정하지 않으며 개인별 데이터/삭제·철회와 인용 근거를 지킵니다. AI가 실제 능력·수상·공식 학칙/지원 결과를 만들어내지 않습니다.

실제 tokenizer·provider usage·청구·latency/CPU/RSS·품질은 측정 결과로만 보고합니다. 설정 누락 CONFIGURATION_REQUIRED, 미실행 NOT_RUN. [운영 구성](../../docs/PRODUCTION_RUNTIME.md) · [경험 API](../../docs/EXPERIENCE_API.md).