# HCX-007·CLOVA OCR·코드 기반 AI 개발

**현행 AI 협업:** 이의상 `uisang2004-maker`([#355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355))과 박준영 `taewangim-alt`([#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356))은 **HCX-007, CLOVA OCR, 규칙/비LLM AI를 모두 활용하고 서로 모델·코드 결과에 피드백**한다. 모델 유형으로 배타적인 개발 경계를 두지 않고 해당 기능 이슈의 주작성자·교차 리뷰어를 따른다. **박준영은 AI 제품 기술 QA·정량 정확도·재시험**을 수행한다. 심민성은 신규 `[추가 기능]` 최초 구조 설계·권한/예산·API 계약과 전 과정 검수를 맡고, 구조 인수 후 박준영 또는 이의상에게 본기능 구현 assignee를 넘긴다. [루트 AGENTS](../../AGENTS.md).

**선택 모델 정책:** HCX-007은 검증된 텍스트의 구조화·근거 기반 설명/RAG에 사용하고, 이미지 문자 인식은 별도 CLOVA OCR 경로로 처리한다. 추천/자격·검색은 기존 결정론 코드 기반 경로와 비교한다. HCX-005 신규 실행 차단 변경은 [PR #354](https://github.com/ot4562-glitch/HUFS-One-AI/pull/354)의 HEAD/병합 상태를 확인한다.

실제 공급자 실행은 현재 actor·세션·동의/출처 권리·승인된 모델 전송 범위·토큰/비용·중복 과금/취소·정확한 근거 인용 검증과 함께 수행한다. `OWNER_CONFIRMED_APPROVED`([AUTHORIZATION](../../docs/AUTHORIZATION.md))와 실제 키/예산·운영 실행은 구분한다.

김채윤은 실자료·독립 Gold·디자인 자산과 경량 사용자 시연, 이서연은 UI/기능 배치, 박준영은 AI QA, 심민성은 단계별 코드·보안·통합 리뷰를 제공한다. 실측·모델 비용·사람 Gold와 합성/모의 시험을 구분해 기록한다. 미실행은 `NOT_RUN`, 미구성은 `CONFIGURATION_REQUIRED`로 남긴다.