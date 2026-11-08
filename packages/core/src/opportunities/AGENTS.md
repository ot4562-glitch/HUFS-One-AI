# 기회 추천·적격·시점 코어

**현행 역할:** 김채윤([#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358))은 실제 공고/포스터·공식 모집조건·권리/정정 자료와 독립 Gold를 공급한다. 신규 기능은 **심민성 최초 구조/계약 → 박준영 또는 이의상 기능 개발 주작성자 배정** 순서로 인수하며, 두 AI 개발자가 추천·코드/모델 결과를 상호 교차검증한다. **박준영은 AI 제품 기술 QA**를, 이서연([#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357))은 공고/추천 웹 화면과 API 연계를, 심민성([#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359))은 전 과정 검수를 맡는다. [루트 AGENTS](../../../../AGENTS.md).

결정론 `evaluateOpportunity`, `rankOpportunities`, `composeFeed`와 featured/compact, 출처 revision·마감/적격 상태 `ELIGIBLE/INELIGIBLE/UNKNOWN`·제외 사유를 구분한다. 실제 학생 권한/소유권/출처·검증 시점은 API와 함께 확인하고, 모델 관련도와 공식 지원·합격 가능성을 구분한다. 독립 Gold의 존재·모델 시험 통과는 실행 증거로 확인한다.