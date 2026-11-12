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
