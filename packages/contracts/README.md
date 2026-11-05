# @hufs-one/contracts — 현재 공통 TypeScript/Zod 계약

프로젝트 전 트랙(React/추천·공지/학업·전망/Fastify·SQL/AI·RAG)이 공유하는 버전·권한·DTO의 정본이다. 실제 등록된 서버 route/소비자 테스트는 [API inventory](../../tools/api_contract_inventory.json)에서 확인하며, 정적 선언만으로 기능 운영·사람/기관 승인을 주장하지 않는다.

## 주요 계약

- `Actor`, `SharingGrant`, `Consent`, `DemoContext`, owner/session/context/selectionEpoch·role/expiry/revocation
- `TopicCode` 폐쇄 분류 24개 및 alias·코어 추천/중요공지·부정시험.
- 4인 실제 원본 Forms 26열·수강 CSV 6열 **구조 계약**; 합성 5슬롯은 원본 개인정보가 아니라 별도 mock이다.
- `DemoSnapshot`·`VersionEnvelope`, `SourceRevision`·SourceSpan/media PDF/OCR/rights/asOf·정정/철회/temporal retrieval, 현재 section-sharing/forecast.
- 학업 earned/inProgress/planned·RulePack/degreePath/track/What-if, 일반 source의 확정 날짜/UNKNOWN, 사용자 경험/북마크·승인 태그/행동 초안.
- 4개 AI task의 `SafeLlmPacket`, 입력 권리/원본 SHA/허용 schema/정확한 citation·보수적 `NEEDS_REVIEW`.
- HTTP/실시간 오류 401/403/409/422/429/503와 SQL role/ADMIN usage `NOT_COLLECTED` 의미.

## 개발/검증

```sh
npm run build:contracts
npm run test:contracts
npm run test:consumers
npm run audit:api-contracts
```

공통 계약/버전을 고칠 때 네 소비 트랙(React·recommendations·academics·API)과 실제 Fastify route/optional PG reader의 테스트가 같은 SHA에서 통과해야 한다. `UNKNOWN` 설계 경로는 임의로 새 공개 API를 추가하지 않고 구현 필요/보안상 제외/대체 경로를 검토한다.

**소유:** 심민성(계약/DB·API 조립) 및 각 트랙 소비자. 실제 인적/원본·운영 수락은 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252), 잔여 계약/CI 수정은 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253). [기술 구조](../../Architecture.md).
