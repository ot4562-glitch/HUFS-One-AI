# 독립 검증

- 주 소유자: 팀장/QA 트랙. Architecture.md A02.6,A08.5,A15와 docs/WORKSTREAMS.md 참조.
- 20개 전환·권한·추천·학사·AI 실패를 합성 시험. 실패 은폐 금지.
- `contracts/*.test.ts`는 Zod·권한·26/6열·AI·학업/전망 계약, `consumers/*.test.ts`는 UI·추천·학업·API **4개 자동 소비자 관점**을 각각 검증한다. `npm run check`로 재현한다. **자동 테스트는 네 팀원이 실제 리뷰했다는 증거가 아니다.** 실제 학생 자료를 테스트/스냅샷/CI에 사용하지 않고 실패·미실행을 그대로 기록한다.
