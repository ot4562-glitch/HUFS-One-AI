# 합성·독립 정답

- 주 소유자: 팀장/QA 트랙. Architecture.md A08,A12,A15와 docs/WORKSTREAMS.md 참조.
- 합성 golden/negative만. 실제 csv/ 자료 복제 금지.
- `synthetic/`와 `negative/`에 **합성 snapshot·profile·rulepack·AI packet fixture**가 있다. `golden/`은 향후 독립 expected용. 실제 Forms/학생 CSV·이름↔S매핑, 학교 원문·실제 교수/학칙은 절대 fixture로 복사하지 않는다. 다른 트랙은 fixture를 읽기만 하고 변경 요청은 QA 담당에게 낸다.
