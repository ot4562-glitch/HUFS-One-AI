# 공용 계약/타입

- 주 소유자: 팀장 트랙. Architecture.md A02~06,A08,A13와 docs/WORKSTREAMS.md 참조.
- 팀장 단독 소유. 소비자는 읽기만 하며 변경은 별도 계약 PR과 모든 영향 트랙 검토.
- **TASK-00 TypeScript/Zod v0.1.0 실제 소스가 이 경로에 존재한다.** 코드의 단일 원본은 `src/`, 런타임 export는 `npm run build:contracts` 후 `dist/` ESM+타입선언이다. `dist/`는 추적/공유하지 않는다. 다른 트랙은 import만 하며 변경 요청은 계약 PR로 제안한다. 상세 사용법: [README.md](README.md).
