"""Development-only fixed synthetic HTML probe. No generic file/URL input.

Install the optional dependency in a local virtualenv. This file is never a
production converter, approval, human Gold source or filesystem sandbox.
"""
import hashlib
import io
import json
import platform
import statistics
import sys
import time
from importlib.metadata import distributions, version
from pathlib import Path

attempts = {"network": 0, "subprocess": 0}


def deny_external(event, _args):
    category = ("network" if event in {"socket.connect", "socket.getaddrinfo", "socket.sendto"}
                else "subprocess" if event in {"subprocess.Popen", "os.system", "os.posix_spawn"} else None)
    if category:
        attempts[category] += 1
        raise RuntimeError("SYNTHETIC_PROBE_EXTERNAL_OPERATION_DENIED")


sys.addaudithook(deny_external)
started = time.perf_counter()
from markitdown import StreamInfo
from markitdown.converters import HtmlConverter
import_ms = (time.perf_counter() - started) * 1000

if len(sys.argv) != 1 or version("markitdown") != "0.1.9":
    raise RuntimeError("SYNTHETIC_PROBE_VERSION_REQUIRED")
fixture_bytes = Path(__file__).with_name("notice-cases.json").read_bytes()
fixture = json.loads(fixture_bytes)
converter = HtmlConverter()  # No MarkItDown dispatcher, URL fetcher, plugin, OCR, LLM or Magika instance.
results = []
for case in fixture["cases"]:
    raw = case["html"].encode("utf-8")
    samples, text = [], None
    for _ in range(25):
        before = time.perf_counter()
        result = converter.convert(io.BytesIO(raw), StreamInfo(mimetype="text/html", extension=".html", charset="utf-8"), strict=True)
        samples.append((time.perf_counter() - before) * 1000)
        if text is not None and text != result.markdown:
            raise RuntimeError("SYNTHETIC_PROBE_NONDETERMINISTIC")
        text = result.markdown
    warm = sorted(samples[1:])
    results.append({"id": case["id"], "originalSha256": hashlib.sha256(raw).hexdigest(), "text": text,
                    "timingMs": {"first": samples[0], "warmMedian": statistics.median(warm),
                                 "warmP95": warm[int(len(warm) * 0.95)], "warmSamples": len(warm)}})
print(json.dumps({"version": "markitdown-synthetic-probe-v1", "toolVersion": version("markitdown"),
                  "fixtureSha256": hashlib.sha256(fixture_bytes).hexdigest(), "python": platform.python_version(),
                  "dependencies": sorted([[d.metadata["Name"], d.version] for d in distributions()]),
                  "importMs": import_ms, "attempts": attempts, "networkGuard": "PYTHON_AUDIT_SOCKET_SUBPROCESS_DENY",
                  "cases": results}, ensure_ascii=True))
