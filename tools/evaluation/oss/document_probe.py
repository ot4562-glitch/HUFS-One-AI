"""Fixed author-synthetic PDF/DOCX experiment; accepts no files, URLs or text.

No dispatcher, OCR, LLM or plugins. Python audit denial is NOT a filesystem or
native-code sandbox. Results measure these tiny fixtures, not production quality.
"""
import hashlib
import io
import json
import platform
import statistics
import sys
import time
import unicodedata
import zipfile
from html import escape
from importlib.metadata import distributions, version
from pathlib import Path


def docx(paragraphs, rows=()):
    def paragraph(text):
        return '<w:p><w:r><w:t>' + escape(text) + '</w:t></w:r></w:p>'
    body = ''.join(paragraph(x) for x in paragraphs)
    if rows:
        body += '<w:tbl>' + ''.join('<w:tr>' + ''.join('<w:tc>' + paragraph(cell) + '</w:tc>'
                                                         for cell in row) + '</w:tr>' for row in rows) + '</w:tbl>'
    parts = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '</w:body></w:document>',
    }
    target = io.BytesIO()
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name, content in parts.items():
            archive.writestr(zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0)), content.encode('utf-8'))
    return target.getvalue()


def pdf(lines=(), image=False):
    """One-page extraction fixture with explicit Unicode map, no embedded font.

    This is a parser fixture, not a visually validated school-document facsimile.
    The image-only negative uses a 2x2 raster, not a realistic scanned document.
    """
    chars = sorted(set(''.join(text for _, _, text in lines)))
    ids = {char: i + 1 for i, char in enumerate(chars)}
    cmap = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap '
            '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def '
            '/CMapName /Synthetic def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange '
            + str(len(chars)) + ' beginbfchar '
            + ' '.join(f'<{ids[c]:04X}> <{c.encode("utf-16-be").hex()}>' for c in chars)
            + ' endbfchar endcmap CMapName currentdict /CMap defineresource pop end end').encode('ascii')
    def stream(data):
        return f'<< /Length {len(data)} >>\nstream\n'.encode() + data + b'\nendstream'
    commands = '\n'.join(f'BT /F1 10 Tf {x} {y} Td <' + ''.join(f'{ids[c]:04X}' for c in text) + '> Tj ET'
                         for x, y, text in lines).encode('ascii')
    if image:
        commands = b'q 100 0 0 100 50 600 cm /Im1 Do Q'
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
               b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 9 0 R >> >> /Contents 4 0 R >>',
               stream(commands), b'<< /Type /Font /Subtype /Type0 /BaseFont /Synthetic /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>',
               b'<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Synthetic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 600 >>',
               stream(cmap), b'<< /Type /FontDescriptor /FontName /Synthetic /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>',
               b'<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4 >>\nstream\n\x00\xff\xff\x00\nendstream']
    raw, offsets = b'%PDF-1.4\n', [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(raw))
        raw += f'{i} 0 obj\n'.encode() + obj + b'\nendobj\n'
    xref = len(raw)
    raw += f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
    raw += b''.join(f'{pos:010} 00000 n \n'.encode() for pos in offsets[1:])
    return raw + f'trailer << /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()


def fixtures():
    rows = [['캠퍼스', '학년도', '마감'], ['서울', '2027', '2027-03-15'], ['글로벌', '2026', '2026-12-01']]
    return [
        {'id': 'DOCX-PROSE', 'format': 'docx', 'bytes': docx(['합성 국제교류 안내', '서울캠퍼스 2027학년도', '마감 2027-03-15']),
         'expected': ['국제교류', '서울캠퍼스', '2027학년도', '2027-03-15']},
        {'id': 'DOCX-TABLE', 'format': 'docx', 'bytes': docx(['합성 캠퍼스별 일정'], rows),
         'expected': ['서울', '글로벌', '2027-03-15', '2026-12-01'], 'tableRows': rows},
        {'id': 'DOCX-REVISION', 'format': 'docx', 'bytes': docx(['합성 공모전 일정 정정', '기존 마감 2027-03-15', '변경 마감 2027-03-22', '서울 및 글로벌 캠퍼스 재학생']),
         'expected': ['기존 마감 2027-03-15', '변경 마감 2027-03-22', '서울 및 글로벌']},
        {'id': 'PDF-PROSE', 'format': 'pdf', 'bytes': pdf([(50, 740, '합성 국제교류 안내'), (50, 710, '서울캠퍼스 2027학년도'), (50, 680, '마감 2027-03-15')]),
         'expected': ['국제교류', '서울캠퍼스', '2027학년도', '2027-03-15']},
        {'id': 'PDF-COLUMNS', 'format': 'pdf', 'bytes': pdf([(50 + col * 150, 740 - row * 30, text) for row, cells in enumerate(rows) for col, text in enumerate(cells)]),
         'expected': ['서울', '글로벌', '2027-03-15', '2026-12-01'], 'tableRows': rows},
        {'id': 'PDF-IMAGE', 'format': 'pdf', 'bytes': pdf(image=True), 'expected': [], 'expectEmpty': True},
    ]


def normalize(text):
    return ' '.join(unicodedata.normalize('NFC', text).split())


def score(case, text):
    normalized = normalize(text)
    rows = case.get('tableRows', [])
    lines = [normalize(line) for line in text.splitlines()]
    return {'fragments': {'num': sum(normalize(x) in normalized for x in case['expected']), 'den': len(case['expected'])},
            'tableRows': {'num': sum(any(all(normalize(cell) in line for cell in row) for line in lines) for row in rows), 'den': len(rows)},
            'empty': {'num': int(case.get('expectEmpty', False) and not normalized), 'den': int(case.get('expectEmpty', False))}}


def run():
    if len(sys.argv) != 1 or version('markitdown') != '0.1.9':
        raise RuntimeError('PINNED_SYNTHETIC_PROBE_REQUIRED')
    attempts = {'network': 0, 'subprocess': 0}
    def deny_external(event, _args):
        category = ('network' if event in {'socket.connect', 'socket.getaddrinfo', 'socket.sendto'} else
                    'subprocess' if event in {'subprocess.Popen', 'os.system', 'os.posix_spawn'} else None)
        if category:
            attempts[category] += 1
            raise RuntimeError('SYNTHETIC_PROBE_EXTERNAL_OPERATION_DENIED')
    sys.addaudithook(deny_external)
    started = time.perf_counter()
    from markitdown import StreamInfo
    from markitdown.converters import DocxConverter, PdfConverter
    import_ms = (time.perf_counter() - started) * 1000
    converters = {'docx': DocxConverter(), 'pdf': PdfConverter()}
    sha = lambda raw: hashlib.sha256(raw).hexdigest()
    results = []
    for case in fixtures():
        samples, output = [], None
        for _ in range(6):
            started = time.perf_counter()
            text = converters[case['format']].convert(io.BytesIO(case['bytes']), StreamInfo(extension='.' + case['format'])).markdown
            samples.append((time.perf_counter() - started) * 1000)
            if output is not None and text != output:
                raise RuntimeError('NONDETERMINISTIC_SYNTHETIC_CONVERSION')
            output = text
        results.append({'id': case['id'], 'format': case['format'], 'originalSha256': sha(case['bytes']),
                        'outputSha256': sha(output.encode()), 'inputBytes': len(case['bytes']), 'outputBytes': len(output.encode()),
                        'metrics': score(case, output), 'timingMs': {'first': samples[0], 'warmMedian': statistics.median(samples[1:]), 'warmSamples': 5}})
    if any(attempts.values()):
        raise RuntimeError('EXTERNAL_OPERATION_ATTEMPTED')
    return {'version': 'synthetic-document-probe-v1', 'referenceKind': 'AUTHOR_SYNTHETIC_NOT_HUMAN_GOLD',
            'releaseEligible': False, 'toolVersion': version('markitdown'), 'python': platform.python_version(),
            'probeSha256': sha(Path(__file__).read_bytes()), 'dependencies': sorted([[d.metadata['Name'], d.version] for d in distributions()]),
            'baseline': {'state': 'UNSUPPORTED_BINARY_FORMATS', 'tool': 'existing-cheerio-html-extractor'},
            'scope': 'SIX_FIXED_PDF_DOCX_FIXTURES_NOT_OCR_HWP_HWPX_OR_FIELD_SPAN_EVALUATION',
            'networkGuard': 'PYTHON_AUDIT_SOCKET_SUBPROCESS_DENY_NOT_SANDBOX', 'attempts': attempts,
            'externalModelCalls': 0, 'importMs': import_ms, 'cases': results}


if __name__ == '__main__':
    try:
        print(json.dumps(run(), ensure_ascii=True))
    except Exception:
        print('SYNTHETIC_DOCUMENT_PROBE_FAILED', file=sys.stderr)
        sys.exit(1)
