# HUFS One AI — 현재 읽기 전용 감사 도구

이 디렉터리의 기본 기능은 **실제 코드/등록 경로/패키징 의존·출판 위험의 재현 가능한 정적/동적 증거를 보고**하는 것이다. 감사 스크립트 PASS는 실 Google·학교 원본/사람/운영 NCP 출시 인수를 자동 충족하지 않는다.

## API/DTO/TASK inventory

- `api_contract_inventory.json`: 실제 code/DTO/test/consumer 참조를 매핑. 현재 수는 감사 출력의 `registrationCount`와 각 목록을 정본으로 사용한다. 진행 이슈 목록과 과거 계약 이슈 목록을 구별한다.
- `audit_api_contracts.mjs`: 경로/contract/작업 원장과 누락·무권한 개방·불명확 항목을 검사. 설계 직접 미매핑 9경로는 retired/비공개·대체/실구현 필요 여부를 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253)에서 판정.
- 동적 import/런타임 DI·실 사용자/PG·미활성 optional worker는 **정적 소스 존재=운영 인수**가 아니므로 UNKNOWN 명시.
- `validationStatus: PASS`여도 `coverage: UNKNOWN`이면 명령은 **exit 3**을 반환한다. 목록 누락이 없다는 뜻과 동적 경로·실운영 검증 완료를 구별하며, 자동으로 exit 0으로 바꾸지 않는다. 과거 정본 이슈 표 검사는 명시적인 `## 5. Canonical issues` 절 안에만 적용하고, 해당 절이 있으면 비어 있거나 누락된 표도 실패시킨다.

```sh
npm run audit:api-contracts
npm run test:api-contracts
npm run audit:entrypoints
npm run test:entrypoints
```

## Git/privacy·출판·의존성

- `audit_private_git_metadata.py`: 접근 가능한 Git 이력의 경로 이름을 외부로 노출하지 않고 metadata 기반 보호 원본 위험을 집계. 현재 커밋 경로 0과 과거 도달 가능한 보호 6경로·full private checkout/clone/backup 조사는 다른 범위이다.
- `verify_release_boundary.py`, `release_publication_gate.py` 등: 보호 원본/비밀 패턴·HTML/JS/sourcemap/ZIP/asset/publication 경계·알 수 없는 링크/경로 거부.
- `audit_dependency_licenses.mjs`, `dependency_bom.mjs`: 설치된 npm direct/transitive LICENSE/NOTICE 증거·CycloneDX. 실 NCP image/runtime·Python/Poppler/pypdf·폰트/모델/학교 이미지까지 모든 라이선스를 승인했다는 뜻이 아님.

```sh
npm run check:privacy
npm run audit:licenses
npm run audit:sbom
npm run test:dependency-evidence
```

## 합성 데이터·브라우저/평가

- `generate_synthetic_snapshots.mjs`, `generate_demo_assets.mjs`: 개인 원본 없이 고정 가상 5슬롯/40공고/10공지·합성 원본 자산과 버전/해시 검증.
- `check_empty_demo_browser.mjs`, `check_local_account_browser.mjs`: Chrome/HTTP/반응형·권한·reset/다중탭·발표 가능한 합성 여정 시험.
- `evaluation/run.mjs`: 오프라인 비작성자 review 패키지·서명/ledger·추천/미디어/Temporal 사례 평가. 실제 사람 Gold는 여전히 **0/200·0/32**.

```sh
npm run fixtures:check
npm run assets:check
npm run test:e2e:empty-demo
npm run build:evaluation
node tools/evaluation/run.mjs fixtures --action check
```

**증거 수준:** 같은 SHA의 PASS/FAIL/SKIP/NOT_RUN과 재현 명령을 보관. 운영 권한/학생·기관 자료 동의·모델 이용권·보조기기 독립 수락은 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)에 별도로 기록한다.
