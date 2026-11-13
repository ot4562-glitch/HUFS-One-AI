"""Fixed LangExtract alignment experiment with canned outputs, not model QA.

Accepts no input files/URLs and never instantiates an external model provider.
Python audit denial is not a native-code or filesystem sandbox.
"""
import hashlib
import json
import platform
import sys
import time
from importlib.metadata import distributions, version
from pathlib import Path


def fixtures():
    def case(identifier, text, values, response=None):
        expected = []
        for kind, value, occurrence in values:
            start = -1
            for _ in range(occurrence + 1):
                start = text.index(value, start + 1)
            expected.append({'kind': kind, 'value': value, 'start': start, 'end': start + len(value)})
        return {'id': identifier, 'text': text, 'expected': expected,
                'response': response if response is not None else [{'kind': x['kind'], 'value': x['value']} for x in expected]}
    return [
        case('EXACT-KO', '서울캠퍼스 2027학년도 신청 마감은 2027-03-15입니다.',
             [('campus', '서울캠퍼스', 0), ('year', '2027학년도', 0), ('deadline', '2027-03-15', 0)]),
        case('REPEATED-CAMPUS', '서울은 이전 대상이다. 최종 대상은 서울이다.', [('campus', '서울', 1)]),
        case('HALLUCINATED-YEAR', '신청 대상은 2027학년도 재학생입니다.', [('year', '2027학년도', 0)],
             [{'kind': 'year', 'value': '2028학년도'}]),
        case('MISSING-FIELD', '신청 마감은 2027-03-15입니다.', [('deadline', '2027-03-15', 0)], []),
        case('UNICODE-OFFSETS', '📘 글로벌캠퍼스 2027학년도 합성 안내', [('campus', '글로벌캠퍼스', 0), ('year', '2027학년도', 0)]),
        case('REVISED-DEADLINE', '기존 마감 2027-03-15, 변경 마감 2027-03-22.',
             [('oldDeadline', '2027-03-15', 0), ('newDeadline', '2027-03-22', 0)]),
    ]


def score(case, observed):
    def key(item):
        return tuple(item.get(k) for k in ('kind', 'value', 'start', 'end'))
    def located(item):
        start, end = item.get('start'), item.get('end')
        return type(start) is int and type(end) is int and 0 <= start < end <= len(case['text'])
    expected = {key(item) for item in case['expected']}
    found = {key(item) for item in observed}
    return {'exactSpans': {'num': len(expected & found), 'den': len(expected)},
            'literalSpans': {'num': sum(located(item) and case['text'][item['start']:item['end']] == item['value'] for item in observed), 'den': len(observed)},
            'unlocated': {'num': sum(not located(item) for item in observed), 'den': len(observed)}}


def run():
    if len(sys.argv) != 1 or version('langextract') != '1.6.0':
        raise RuntimeError('PINNED_SYNTHETIC_ALIGNMENT_REQUIRED')
    attempts = {'network': 0, 'subprocess': 0}
    def deny_external(event, _args):
        category = ('network' if event in {'socket.connect', 'socket.getaddrinfo', 'socket.sendto'} else
                    'subprocess' if event in {'subprocess.Popen', 'os.system', 'os.posix_spawn'} else None)
        if category:
            attempts[category] += 1
            raise RuntimeError('SYNTHETIC_PROBE_EXTERNAL_OPERATION_DENIED')
    sys.addaudithook(deny_external)
    started = time.perf_counter()
    import langextract as lx
    from langextract.core import base_model, types
    import_ms = (time.perf_counter() - started) * 1000
    class CannedModel(base_model.BaseLanguageModel):
        def __init__(self, response):
            super().__init__()
            self.response, self.prompts = response, 0
        def infer(self, batch_prompts, **_kwargs):
            for _ in batch_prompts:
                self.prompts += 1
                yield [types.ScoredOutput(score=1.0, output=self.response)]
    sha = lambda raw: hashlib.sha256(raw).hexdigest()
    example = lx.data.ExampleData(text='합성 예시 서울캠퍼스', extractions=[lx.data.Extraction(extraction_class='campus', extraction_text='서울캠퍼스')])
    results = []
    for case in fixtures():
        response = json.dumps({'extractions': [{x['kind']: x['value']} for x in case['response']]}, ensure_ascii=False)
        model = CannedModel(response)
        started = time.perf_counter()
        result = lx.extract(text_or_documents=case['text'], prompt_description='Extract the stated campus, year and dates verbatim.',
                            examples=[example], model=model, fence_output=False, use_schema_constraints=False,
                            max_char_buffer=1000, max_workers=1, batch_length=1, extraction_passes=1,
                            fetch_urls=False, show_progress=False)
        elapsed = (time.perf_counter() - started) * 1000
        observed = [{'kind': item.extraction_class, 'value': item.extraction_text,
                     'start': item.char_interval.start_pos if item.char_interval else None,
                     'end': item.char_interval.end_pos if item.char_interval else None,
                     'alignment': str(item.alignment_status)} for item in result.extractions or []]
        results.append({'id': case['id'], 'inputSha256': sha(case['text'].encode()), 'cannedResponseSha256': sha(response.encode()),
                        'expected': case['expected'], 'observed': observed, 'metrics': score(case, observed),
                        'inferencePrompts': model.prompts, 'elapsedMs': elapsed})
    if any(attempts.values()):
        raise RuntimeError('EXTERNAL_OPERATION_ATTEMPTED')
    return {'version': 'synthetic-alignment-probe-v1', 'toolVersion': version('langextract'),
            'referenceKind': 'AUTHOR_SYNTHETIC_NOT_HUMAN_GOLD', 'model': 'CANNED_RESPONSES_NOT_LLM_INFERENCE',
            'releaseEligible': False, 'externalModelCalls': 0, 'attempts': attempts,
            'networkGuard': 'PYTHON_AUDIT_SOCKET_SUBPROCESS_DENY_NOT_SANDBOX',
            'offsetUnit': 'PYTHON_UNICODE_CODE_POINTS_NOT_UTF16_OR_BYTES',
            'python': platform.python_version(), 'probeSha256': sha(Path(__file__).read_bytes()),
            'dependencies': sorted([[d.metadata['Name'], d.version] for d in distributions()]), 'importMs': import_ms,
            'scope': 'CANNED_RESPONSE_PARSING_ALIGNMENT_ONLY_NOT_LLM_HCX_OR_NORMALIZER_COMPARISON', 'cases': results}


if __name__ == '__main__':
    try:
        print(json.dumps(run(), ensure_ascii=True))
    except Exception:
        print('SYNTHETIC_ALIGNMENT_PROBE_FAILED', file=sys.stderr)
        sys.exit(1)
