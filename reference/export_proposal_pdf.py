#!/usr/bin/env python3
"""Render the canonical Proposal.md to a review-ready A4 Proposal.pdf.

Local-only document exporter; no network, no product service, no dependencies
installed. Runs with the WSL Python that already provides markdown_it and
an installed Windows Chrome/Edge browser. --replace explicitly overwrites a
previous generated PDF after backing up nothing (keep your own versions).
"""
from __future__ import annotations

import argparse
import hashlib
import html
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import quote

from markdown_it import MarkdownIt

PROJECT = Path(__file__).resolve().parent.parent
SOURCE = PROJECT / "Proposal.md"
DEST = PROJECT / "Proposal.pdf"

CSS = """
@page {
  size: A4 portrait;
  margin: 17mm 16mm 19mm;
  @bottom-left { content: "HUFS ONE AI  /  PROPOSAL"; font: 8pt "Segoe UI", sans-serif; color: #8291a5; }
  @bottom-right { content: counter(page); font: 8pt "Segoe UI", sans-serif; color: #8291a5; }
}
:root { --ink: #1F2933; --navy: #002D56; --primary: #146E7A; --muted: #52606D; --line: #DADAD3; }
* { box-sizing: border-box; }
html, body { padding: 0; margin: 0; }
html { color: var(--ink); background: #fff; font: 9.55pt/1.54 "Malgun Gothic", "맑은 고딕", "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { overflow-wrap: break-word; }
a { color: #146E7A; text-decoration: none; overflow-wrap: anywhere; }
a:hover { text-decoration: underline; }
.cover { break-after: page; page-break-after: always; min-height: 248mm; padding: 16mm 0 0; display:flex; flex-direction:column; justify-content:center; }
.cover .eyebrow { color: var(--primary); font: 700 10pt/1.45 "Segoe UI", sans-serif; letter-spacing: 1.7px; margin-bottom: 20px; }
.cover h1 { color: #002D56; font-size: 30pt; font-weight: 750; letter-spacing: -1px; line-height:1.27; margin: 0 0 18px; }
.cover p { font-size:12.3pt; line-height:1.75; max-width: 155mm; color:#334760; margin:0 0 14px; }
.cover p:last-of-type {font-size:10pt;line-height:1.8;color:#576d83;}
.cover .bar { width: 51mm; height: 3px; margin: 29px 0 19px; background:#8D7150;}
.cover .meta {font-size:9pt;color:#64738a;line-height:1.95;}
.cover .meta strong {color:#146E7A;}
.toc { break-after:page; page-break-after:always; padding-top: 10mm; }
.toc h2 {font-size:18pt; margin:0 0 11mm; color:var(--navy);}
.toc ol {margin:0; padding-left:0; list-style:none; display:grid; grid-template-columns:1fr; gap:0;}
.toc li { border-bottom: 1px solid #e4e9f2; padding: 7px 0; margin: 0; break-inside:avoid; }
.toc a { font-size:10pt; color:#283951; font-weight:500;}
.toc small { color:#7c8b9f; display:inline-block; width:32px; font-size:8.5pt; }
.toc .note {font-size:8.4pt; color:var(--muted); margin-top:16px; line-height:1.6;}
article { width:100%; }
h1,h2,h3,h4,h5,h6 { color:var(--navy); font-weight:700; letter-spacing:-.15px; line-height:1.4; break-after:avoid; page-break-after:avoid; }
h2.chapter {break-before:auto;page-break-before:auto; margin:22px 0 14px; border-bottom:2px solid #DADAD3; padding:0 0 9px; font-size:17.8pt;}
article > h2.chapter:first-child {margin-top:0;}
h2#chapter-11 {break-before:auto;page-break-before:auto; margin-top:0;}
h3 { font-size:12.4pt; margin:19px 0 8px; }
h4 { font-size:10.5pt; margin:14px 0 7px; }
h5,h6 {font-size:9.5pt;margin:12px 0 6px;}
p { margin: 0 0 7px; orphans:3; widows:3; }
p + p { margin-top: 3px; }
strong {font-weight:700;color:#1b344f;}
em { color:#3c4b64; }
ul,ol { margin: 5px 0 11px; padding-left: 19px; }
li { margin: 2px 0; }
li > p { margin: 2px 0; }
blockquote {margin:12px 0 14px;padding:9px 13px;border-left:3px solid #146E7A;background:#F7F8F6;color:#374d6c;break-inside:avoid;}
hr {border:0;border-top:1px solid var(--line);margin:20px 0;}
table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:8.4pt; line-height:1.4; margin:10px 0 14px; border-top:1.5px solid #146E7A; }
thead {display:table-header-group;}
tr {break-inside:avoid;page-break-inside:avoid;}
th,td {padding:7px 7px; border-bottom:1px solid #e2e8f0; border-right:1px solid #eaf0f5; vertical-align:middle; overflow-wrap:anywhere; word-break:normal; white-space:normal;}
th:last-child,td:last-child {border-right:0;}
th {background:#EEF4F3; color:#002D56; font-weight:700; text-align:left;}
tbody tr td {background:#ffffff;}
table.wide {font-size:7.55pt;} table.wide th, table.wide td {padding:5px 5px;}
table.xwide {font-size:6.65pt;} table.xwide th, table.xwide td {padding:4px 4px;line-height:1.37;}
code {font: .92em/1.5 Consolas,"Courier New",monospace;color:#002D56;overflow-wrap:anywhere;}
p code,li code,td code {background:#f1f4f9;border-radius:3px;padding:1px 3px;}
pre {font-size:7.7pt;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;background:#f2f5fa;border:1px solid #e2e8f0;border-radius:5px;padding:9px 10px;margin:9px 0 12px;}
pre code {padding:0; background:transparent; color:#283d5d;}
img {max-width:100%;height:auto;break-inside:avoid;}
table p {margin:0;}
"""


def describe_tables(rendered: str):
    count = 0
    largest = 0

    def annotate(match):
        nonlocal count, largest
        raw = match.group(0)
        first_row = re.search(r"<tr[^>]*>(.*?)</tr>", raw, flags=re.S | re.I)
        cells = len(re.findall(r"<t[hd]\b", first_row.group(1), re.I)) if first_row else 0
        count += 1
        largest = max(largest, cells)
        cls = "xwide" if cells >= 7 else ("wide" if cells >= 5 else "")
        first = re.sub(r"<[^>]+>", " ", first_row.group(1)) if first_row else ""
        widths = None
        if cells == 4 and "공식 구분" in first:
            widths = [28, 17, 16, 39]
        elif cells == 4 and "시연 준비 상태" in first:
            widths = [12, 31, 39, 18]
        elif cells == 3 and "확인" in first and "결정할 것" in first:
            widths = [8, 43, 49]
        colgroup = "" if widths is None else "<colgroup>" + "".join(
            f'<col style="width:{w}%">' for w in widths
        ) + "</colgroup>"
        return raw.replace("<table>", f'<table class="{cls}">' + colgroup, 1)

    return re.sub(r"<table>.*?</table>", annotate, rendered, flags=re.S | re.I), count, largest


def create_html(markdown: str, checksum: str):
    parser = MarkdownIt("default", {"html": False, "breaks": False}).enable("table")
    rendered = parser.render(markdown)
    intro = re.match(r"\s*(<h1>.*?</h1>\s*<p>.*?</p>\s*<p>.*?</p>)", rendered, flags=re.S)
    if not intro:
        raise ValueError("Unexpected proposal opening structure; review the first Markdown heading/paragraphs.")
    cover_content = intro.group(1)
    rendered = rendered[intro.end():]
    chapters = []

    def number_chapters(match):
        index = len(chapters) + 1
        inner = match.group(1)
        label = html.unescape(re.sub(r"<[^>]*>", "", inner)).strip()
        chapters.append((index, label))
        return f'<h2 class="chapter" id="chapter-{index}">{inner}</h2>'

    rendered = re.sub(r"<h2>(.*?)</h2>", number_chapters, rendered, flags=re.S)
    rendered, n_tables, max_cols = describe_tables(rendered)
    toc_items = "\n".join(
        f'<li><a href="#chapter-{index}"><small>{index:02d}</small>{html.escape(label)}</a></li>'
        for index, label in chapters
    )
    full = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HUFS One AI | Proposal</title>
<meta name="source-sha256" content="{checksum}">
<style>{CSS}</style>
</head>
<body>
<section class="cover">
<div class="eyebrow">HUFS ONE AI  /  PROPOSAL</div>
{cover_content}
<div class="bar"></div>
<div class="meta"><strong>검토용 제안서</strong> &nbsp; | &nbsp; 기준 원본: Proposal.md<br>
2026-10-30 기준 제안 · 실제 서비스 구현 전 문서 단계<br>
HUFSAbility 취업·비교과 개인화 → AI 공고 해석 → 추가 졸업지원</div>
</section>
<nav class="toc">
<h2>목차</h2>
<ol>{toc_items}</ol>
<p class="note">아래 항목을 누르면 해당 장으로 이동합니다. 이 파일은 Proposal.md 전체 본문을 기반으로 한 검토용 출력본입니다. 직접 수집한 근거와 제안·미검증 영역은 본문에서 구분합니다.</p>
</nav>
<article>{rendered}</article>
</body></html>"""
    if len(chapters) < 8:
        raise ValueError(f"Expected main chapters; detected {len(chapters)}.")
    if n_tables < 5:
        raise ValueError(f"Unexpected number of tables: {n_tables}")
    return full, {"chapters": len(chapters), "tables": n_tables, "max_table_columns": max_cols, "source_chars": len(markdown)}


def windows_path(path: Path) -> str:
    return subprocess.check_output(["wslpath", "-w", str(path)], text=True).strip()


def win_file_url(path: Path) -> str:
    p = windows_path(path).replace("\\", "/")
    return "file:///" + quote(p, safe="/:")


def run():
    ap = argparse.ArgumentParser()
    ap.add_argument("--replace", action="store_true", help="Allow replacing an existing generated Proposal.pdf")
    args = ap.parse_args()
    if not SOURCE.is_file():
        raise FileNotFoundError(SOURCE)
    if DEST.exists() and not args.replace:
        raise FileExistsError(f"{DEST} exists; run with --replace if you want to regenerate.")
    content = SOURCE.read_bytes()
    checksum = hashlib.sha256(content).hexdigest()
    rendered, stats = create_html(content.decode("utf-8-sig"), checksum)
    browser = next((p for p in [
        Path("/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"),
        Path("/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
        Path("/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe"),
    ] if p.exists()), None)
    if browser is None:
        raise FileNotFoundError("Chrome / Edge unavailable; PDF not generated.")

    with tempfile.TemporaryDirectory(prefix=".proposal_pdf_", dir=PROJECT, ignore_cleanup_errors=True) as temp:
        temp_dir = Path(temp)
        source_html = temp_dir / "Proposal.html"
        source_html.write_text(rendered, encoding="utf-8")
        profile_dir = temp_dir / "chrome-profile"
        profile_dir.mkdir()
        command = [
            str(browser), "--headless=new", "--disable-gpu", "--disable-extensions",
            "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
            "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=9000", "--user-data-dir=" + windows_path(profile_dir),
            "--print-to-pdf=" + windows_path(DEST), win_file_url(source_html),
        ]
        result = subprocess.run(command, capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            raise RuntimeError(f"Chrome print failed ({result.returncode}): {(result.stderr or '')[:1500]}")
        for _ in range(20):
            if DEST.is_file() and DEST.stat().st_size > 10_000:
                break
            time.sleep(0.5)
        if not DEST.is_file():
            raise FileNotFoundError(f"PDF not created: {DEST}")
        pdf = DEST.read_bytes()
        if not pdf.startswith(b"%PDF-"):
            raise ValueError("Output is not a PDF.")
        pages = len(re.findall(rb"/Type\s*/Page\b", pdf))
        if not 5 <= pages <= 100:
            raise ValueError(f"Unexpected page count detected from PDF: {pages}")
        print("EXPORT_OK", {"source": str(SOURCE), "destination": str(DEST),
                            "input_sha256": checksum, "pdf_sha256": hashlib.sha256(pdf).hexdigest(),
                            "pdf_bytes": len(pdf), "pdf_pages": pages, **stats})


if __name__ == "__main__":
    run()
