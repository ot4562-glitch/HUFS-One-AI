# 공개 가능한 합성 fixture·독립 Gold 구분

**현행 협업:** 김채윤 `qamarrchae`([#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358))은 독립 사람 Gold의 자료/레이블·출처 판본을 관리한다. 박준영 `taewangim-alt`([#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356))은 AI 제품 기술 QA·정량 평가 러너·반례/재시험을 구축한다. 이의상은 AI/OCR·RAG/추천의 교차 검증과 시험 fixture 설계에 참여한다. 이서연은 실제 UI 합성 시연 데이터를 소비하고, 심민성은 보안·계약·CI 및 전 과정 검수를 맡는다. 새 추가기능은 최초 심민성에게 배정한 후 구조 설계가 준비되면 박준영/이의상 중 개발 담당자를 지정한다. [루트 AGENTS](../../AGENTS.md).

`synthetic/`, `negative/`에는 가상 계정·공고·AI/학업·권한/철회·시점의 합성 또는 허가된 부정 시험만 둔다. 실 Forms/학생 CSV·실명/SID 연결·토큰/비밀·개인 문서/실제 스크린샷은 공개 fixture/CI에 포함하지 않는다.

`golden/`의 자동 정답이나 합성 oracle은 독립 사람 검증의 증거가 있을 때만 `HUMAN_GOLD`로 분류한다. 원문/Gold 판본·hash·manifest·라이선스·재현성을 보존하고 AI 측정/실측·모의 데이터를 구분한다.