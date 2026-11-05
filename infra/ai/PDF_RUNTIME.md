# HUFS One AI — 현재 비공개 PDF 원문·OCR/근거 런타임

PDF → 승인된 전체 페이지 PNG → OCR/bbox → 원본·페이지 SHA 불변 저장 → 별도 검수자 승인 → Temporal RAG/인용으로 연결하는 **비공개 증거 수집 경로**다. 사용자 HTTP 업로드·비인가 출처/원본 전송·실 provider 호출·운영 migration 허용 기능이 아니다. `AI_ENABLED=false` 및 `RELEASE_BLOCKED` 기본.

## 조립·차단

`apps/api/src/modules/opportunities/approved-pdf-extractor.ts`의 `createApprovedPdfExtractor`는 명시적인 renderer/identity·rights authority·OCR·enabled 전부를 요구한다. 실제 `packages/ai/src/pdf-renderer.ts` Poppler renderer와 `pdfRuntimeIdentity`/native subprocess/정확한 rootfs hash를 승인된 private factory에서만 연결한다. 현재 권리·source revision/asOf/actor/검수/예산/취소를 I/O 전후 확인한다. 하나의 페이지라도 bbox/문단/원본 바이트 검증에 실패하면 문서 전체 후보를 거절한다.

## 지원하는 v1 입력 한도

| 구분 | 현재 코드 정책 |
| --- | --- |
| PDF 원본 | 비어 있지 않고 **256 KiB 이하**, SHA-256/헤더·검수 |
| 페이지 | 최대 **4개 full page**. 회전/크롭/다른 UserUnit/암호·active content 불허 |
| raster | 원본 page마다 실제 PNG, **페이지당 256 KiB 이하** |
| 원본+PNG 전체 | **1 MiB 이하** |
| worker | CPU **8초**·주소 공간 **768 MiB**·출력 256 KiB·파일 디스크립터 32(정책 목표) |
| 객체·해제 | PDF ref 4,096/방문 20,000/깊이 64·최대 zlib 8MiB |
| 파서 | **pypdf 6.21.4** exact version 및 wheel/package digest |
| host | root-owned Python/pdftoppm·bubblewrap·worker/PDF rootfs와 executable SHA, 단일 허용 mount/네트워크 차단 |

실 운영에 필요한 rootfs/Python/Poppler/pypdf/bwrap/폰트/배포 NOTICE·라이선스/해시·OS 자원 한도는 최종 승인된 이미지별로 재검증한다. 디버그 용이성 때문에 PDF 원본·페이지 PNG·학생 자료를 웹/public build/CI·로그에 노출하지 않는다.

## PostgreSQL·승인 경로

승인된 migration 의존 순서는 `20261101_source_review.sql` → `20261105_source_image_evidence.sql` → `20261105_source_pdf_evidence.sql`. DB role/RLS/원자 source-head·writer/reviewer/reader의 독립 권한과 안전한 rollback을 요구한다. 코드/합성 fixture/테스트가 존재해도 **운영 DB 적용/직접 학생·학교 원본 수집·실호스트 sandbox 전체**가 수행됐다는 뜻이 아니다.

## 실행 가능한 검사와 실인수

```sh
npm run test:api
python3 -m unittest discover -s tests/release
npm run check:privacy
```

native dependency가 없는 실행에서는 SKIP/NOT_RUN을 명시하고 실제 pypdf/Poppler/bwrap 관련 전 경계 PASS를 주장하지 않는다. 실제 기관별 권리·OCR 정확도/Gold 20+12·실 worker CPU/RSS·p95/유료 provider는 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)에서만 수락.

**관련:** [API](../../apps/api/README.md) · [RAG](../../docs/TRUSTED_RAG_MEDIA_VERSIONING.md) · [구현 #253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253).
