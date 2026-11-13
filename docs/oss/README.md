# NCP 이전 OSS 소규모 비교

이 폴더는 #450–#454의 선택 도구를 실제로 시험한 근거를 기록한다. 역사적 후보 목록은 `ENGINEERING_ARCHIVE.md`에 보존되어 있다. 설치 목록이나 전체 도입 완료 선언이 아니다. 개인별 Claude/GPT 연결·유료 서비스·실자료·NCP 운영 인수는 수행하지 않았다.

## 2026-11-13 — MarkItDown HTML 경로

**현재 코드 채택 판단: 기존 Cheerio HTML 추출기를 유지한다.** MarkItDown의 HTML 운영 의존성 도입은 보류한다. 이번 작은 표본에서는 추가 정확도 이점이 없고 Python 실행 환경이 추가된다. PDF/Office의 가치까지 배제한 결론은 아니다. #453의 PDF/Office·LangExtract·검색 비교와 #454 실제 검수자 시연은 아직 남아 있다.

[실측 JSON](markitdown-html-v1.json)은 Node 24.15.0/Python 3.14.6, Cheerio 1.2.0/MarkItDown 0.1.9에서 실행했다. 고정 fixture·각 원문·실제 baseline extractor·worker lock·Node/Python harness의 SHA-256과 설치된 Python 패키지 버전을 기록한다. 시험 대상은 저자가 작성한 한국어 HTML 8개이며, 독립 사람 Gold가 아니다. 후보는 프로젝트 내부의 무시되는 `local_only/oss/markitdown-0.1.9` 가상환경에만 설치했다. root/worker 운영 의존성은 변경하지 않았다. 설치된 MarkItDown wheel SHA-256은 `52f59c48bea9cf887224c56247f648d68beb7aa7af5a12d414748210c83c20ea`였다.

- 두 경로 모두 기대 문구 16/16개를 보존했다. 이 값은 정해진 문자열의 포함 여부이며 필드 관계·자격 판정·출처 span 정확도·분류 F1·retrieval Recall/MRR가 아니다.
- 메뉴·푸터·script/style 등의 제외 문구 5개 중 기존 경로는 0/5개, 기본 MarkItDown HTML 변환은 2/5개를 출력했다. 기존 경로는 등록된 `main`을 선택하며, 후보는 기본 body 변환이다. 후보에 별도 본문 선택 전처리를 붙이면 달라질 수 있다. 이 기본 구성 차이를 후보 엔진의 일반 결함으로 단정하지 않는다.
- 빈 문서·JavaScript만 있는 문서의 빈 결과는 양쪽 2/2개다. 두 경로 모두 JavaScript를 실행하지 않는다. 실제 브라우저 경로와 비교한 시험이 아니다.
- 각 문서에서 첫 변환 1회와 warm 24회를 기록했다. import 시간도 별도로 기록했다. 같은 호스트의 작은 순차 실행이며, 프로세스 전체 비용·동시 처리·RSS·실서비스 레이턴시의 비교가 아니다. 토큰/유료 모델 호출은 없었다.

후보는 전체 `MarkItDown` dispatcher 대신 고정 `HtmlConverter`에 메모리 바이트만 전달한다. plugin·OCR·LLM·URL 변환기를 구성하지 않는다. Python audit hook은 socket 접속/주소 조회/송신과 subprocess/system 실행을 거부하며 관찰된 시도는 각각 0건이다. 이 hook은 파일시스템/네이티브 코드 sandbox가 아니다. 실행 입력은 코드에 동봉한 합성 fixture뿐이며, 이 실험 도구로 실제 파일·URL·NCP 원문을 처리하지 않는다.

공식 근거는 Microsoft의 [MarkItDown 저장소](https://github.com/microsoft/markitdown), [v0.1.9 HTML converter](https://github.com/microsoft/markitdown/blob/v0.1.9/packages/markitdown/src/markitdown/converters/_html_converter.py), [동일 태그 패키지 설정](https://github.com/microsoft/markitdown/blob/v0.1.9/packages/markitdown/pyproject.toml), [MIT LICENSE](https://github.com/microsoft/markitdown/blob/v0.1.9/LICENSE)다. 2026-11-13 조회 시 공식 저장소는 archived=false, 최신 release v0.1.9(2026-10-21), main 마지막 push는 2026-11-07이었다. 이 날짜는 향후 유지관리 보증이 아니다. 패키지는 Python 3.10 이상을 요구하며, 더 넓은 포맷/외부 AI 기능은 별도 의존성·권한·송신/요금 검토 대상이다. 공식 [I/O 주의사항](https://github.com/microsoft/markitdown/tree/v0.1.9/packages/markitdown#readme)도 프로세스가 가진 권한으로 자원에 접근함을 설명한다.

## 재현

기존 worker 의존성을 설치한 개발 checkout에서 기본 기준선은 아래처럼 실행한다. 후보는 `NOT_RUN`으로 남으며 자동 설치하지 않는다.

```sh
node --test tools/evaluation/oss/notice-comparison.node.test.mjs
node tools/evaluation/oss/notice-comparison.mjs
```

선택적 후보 시험은 별도 개발 가상환경에서 고정 `markitdown==0.1.9`를 설치한 뒤 수행한다. probe는 다른 버전을 거부한다. 설치 네트워크와 변환 중의 외부 작업 거부는 서로 다른 단계다. 설치 기록은 로컬에 보관하고 공개 결과에는 합성 관측치만 포함한다.

```powershell
python -m venv local_only/oss/markitdown-0.1.9
local_only/oss/markitdown-0.1.9/Scripts/python.exe -m pip install --only-binary=:all: markitdown==0.1.9
$env:HUFS_MARKITDOWN_PYTHON = (Resolve-Path local_only/oss/markitdown-0.1.9/Scripts/python.exe).Path
node --test tools/evaluation/oss/notice-comparison.node.test.mjs
node tools/evaluation/oss/notice-comparison.mjs --python $env:HUFS_MARKITDOWN_PYTHON
```

한국어를 Windows 프로세스 사이에서 전달할 때의 기본 코드페이지 손실을 피하도록 probe JSON을 ASCII escape한다. 실제 후보 통합 시험은 문구 16/16개 보존을 확인해 이 경계를 검증한다. 기본 CI는 baseline/지표 시험만 실행하고 선택 후보는 명시적으로 SKIP한다.

## 기존 평가 도구 재사용

#452가 요구한 macro-F1, Recall@k/MRR, 근거 span 및 자격 오판율은 이미 [기존 metrics](../../packages/core/src/evaluation/metrics.ts)에 있다. FAQ의 TUNED/HOLDOUT 기준선도 [기존 회귀](../../tests/evaluation/faq-retrieval-metrics.test.ts)에 존재한다. 이 비교를 위해 같은 지표·Gold 원장·평가 framework를 다시 작성하지 않았다. [독립 평가 절차](../INDEPENDENT_EVALUATION.md)의 서명·판본·사람 검수 상태도 바꾸지 않았다.

OpenAI의 [플랫폼 dataset/grader 절차](https://developers.openai.com/api/docs/guides/evaluation-getting-started)는 별도 서비스 흐름이며, 해당 문서를 읽었다는 사실이 OpenAI Evals OSS나 HCX 호환성을 시험한 증거는 아니다. Evals/외부 모델·Claude↔GPT A/B·개인 플러그인 권한은 아직 NOT_RUN이다. [공식 skills 설명](https://developers.openai.com/plugins/concepts/skills)도 workflow 지침의 배포 형태를 설명할 뿐 팀원 계정 연결·실행 증거를 제공하지 않는다.

## PDF·DOCX 선택 시험 — #453

2026-11-13 같은 개발 가상환경의 `markitdown[docx,pdf]==0.1.9`로 [고정 합성 probe](../../tools/evaluation/oss/document_probe.py)를 실행했다. [측정 JSON](markitdown-documents-synthetic-20261113.json)은 실행 코드·입력 바이트·출력의 SHA-256, 설치 의존성 판본, Python 판본, 첫 변환과 warm 5회 중앙값을 담는다. 가상환경은 개발 전용이며 production 의존성·수집 worker·lockfile을 바꾸지 않았다.

DOCX 본문/표/마감 정정, PDF 본문/3열/이미지 전용의 6개다. 한글·학년도·캠퍼스·이전/변경 마감을 포함한 기대 문자열 19/19개를 찾았다. DOCX 표와 PDF 3열의 각 3개 행은 해당 셀 문자열이 같은 출력 줄에 함께 나타나 6/6개였다. 이 지표는 **한 줄 내 문자열 동시 존재**이며 셀 순서·중복·정확한 표 구조·필드 관계·원문 좌표/span·정정 우선순위의 정확도를 검증하지 않는다. 문구의 포함만으로 eligibility 판정/분류 F1/검색 지표가 좋아졌다고 해석하지 않는다.

PDF는 Unicode map을 명시한 작은 parser fixture이며 글꼴을 내장하거나 시각 검수한 학교 문서 모사본이 아니다. 이미지 음성 사례는 텍스트 없는 2×2 raster로, 빈 출력 1/1개였다. OCR이나 복잡한 실제 스캔·다단·병합 셀·HWP/HWPX·다른 Office 형식은 시험하지 않았다. 기존 Cheerio 경로는 HTML 전용이므로 `UNSUPPORTED_BINARY_FORMATS`로 기록하고 같은 문서를 변환한 성능 기준선으로 꾸미지 않았다. 작은 고정 입력의 지연은 실서비스 비용·RSS·동시 부하의 근거가 아니다.

고정 `PdfConverter`/`DocxConverter`에 메모리 바이트만 전달하고 dispatcher·URL·OCR·LLM·plugin을 구성하지 않는다. 기존 HTML 실험과 같은 Python audit 거부에서 관찰된 network/subprocess 시도는 각각 0건, 외부 모델 호출은 0회다. 이 거부는 파일시스템·네이티브 코드 sandbox가 아니다. 임의 파일/URL/문자열 CLI 인수를 거부하며 실자료 처리 도구로 제공하지 않는다. 실제 자료용 변환 경로를 채택하려면 권리·파일 검역·resource/egress 제한·변환 산출물과 SourceRevision/span 계약을 별도로 통합해야 한다.

**결정:** 기존 HTML 경로를 유지하고, MarkItDown은 PDF/DOCX 오프라인 후보로만 보류한다. 공식 [PDF 구현](https://github.com/microsoft/markitdown/blob/v0.1.9/packages/markitdown/src/markitdown/converters/_pdf_converter.py)은 pdfplumber/pdfminer 경로를, [DOCX 구현](https://github.com/microsoft/markitdown/blob/v0.1.9/packages/markitdown/src/markitdown/converters/_docx_converter.py)은 Mammoth/HTML 변환 경로를 사용한다(2026-11-13 조회). 설치한 MIT 본체 외 의존성 LICENSE/NOTICE 배포 검토, 승인된 실자료·독립 Gold 평가, HWP/HWPX 별도 파서, 운영 sandbox 검증은 남아 있다. 이 실험은 `releaseEligible:false`이며 NCP·운영 채택·사람 인수를 완료하지 않는다.

재현(기존 선택 가상환경에 extras 설치 후):

```powershell
$env:HUFS_MARKITDOWN_PYTHON = (Resolve-Path local_only/oss/markitdown-0.1.9/Scripts/python.exe).Path
python -m unittest discover -s tools/evaluation/oss -p test_document_probe.py
& $env:HUFS_MARKITDOWN_PYTHON tools/evaluation/oss/document_probe.py
```

환경변수 없이 단위 시험을 실행하면 fixture/지표 2개만 실행하고 실제 변환 1개는 명시적으로 SKIP한다. probe는 정상 결과에 원문·변환 본문을 출력하지 않고 오류도 고정 메시지만 내보낸다.
