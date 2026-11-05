"""COPY-layout regression, not a Docker build or native-renderer acceptance.

The fixture models explicit repository COPY inputs and synthetic compiled output.
It never opens private operator material or executes the renderer.
"""
from pathlib import Path
import posixpath
import re
import shlex
import unittest

ROOT = Path(__file__).resolve().parents[2]
RASTER = "infra/ai/raster-worker.mjs"
PDF = "infra/ai/pdf-render-worker.py"
PRIVATE_SENTINEL = "infra/ai/unrelated-operator-state.json"


def copy_layout(dockerfile, with_metadata=False):
    context = {name: name for name in (RASTER, PDF, PRIVATE_SENTINEL)}
    stages = {}
    metadata = {}
    stage = None
    workdir = "/"
    def directory(path, owner="root:root", mode=0o755):
        # COPY creates missing parents with its ownership/mode, preserving existing
        # directories. This models fsutil Copy/MkdirAll, not an image-build claim.
        pieces = path.strip("/").split("/") if path != "/" else []
        current = ""
        metadata[stage].setdefault("/", {"kind":"dir", "owner":"root:root", "mode":0o755})
        for piece in pieces:
            current += "/" + piece
            metadata[stage].setdefault(current, {"kind":"dir", "owner":owner, "mode":mode})
    for raw in dockerfile.splitlines():
        words = shlex.split(raw, comments=True)
        if not words:
            continue
        op, *args = words
        if op.upper() == "FROM":
            stage = args[-1]
            stages[stage] = {}
            metadata[stage] = {}
            workdir = "/"
        elif op.upper() == "WORKDIR":
            workdir = posixpath.normpath(posixpath.join(workdir, args[0]))
            directory(workdir)
        elif op.upper() == "RUN" and stage == "build":
            # Known fixture output; this test makes no compilation claim.
            stages[stage]["/app/dist/packages/ai/src/raster.js"] = "SYNTHETIC_COMPILED_RASTER"
            stages[stage]["/app/dist/web/index.html"] = "SYNTHETIC_PUBLIC_WEB"
        elif op.upper() == "COPY":
            source_stage = None
            owner, mode = "root:root", None
            while args and args[0].startswith("--"):
                flag = args.pop(0)
                if flag.startswith("--from="):
                    source_stage = flag.split("=", 1)[1]
                elif flag.startswith("--chown="):
                    owner = flag.split("=", 1)[1]
                elif flag.startswith("--chmod=") and re.fullmatch(r"[0-7]{3,4}", flag.split("=", 1)[1]):
                    mode = int(flag.split("=", 1)[1], 8)
                else:
                    raise AssertionError("Review new COPY option in artifact-layout fixture")
            if len(args) < 2 or any("*" in x or "$" in x or "[" in x for x in args):
                raise AssertionError("Artifact layout requires explicit literal COPY")
            destination = posixpath.normpath(posixpath.join(workdir, args[-1]))
            source_files = stages[source_stage] if source_stage else context
            for source in args[:-1]:
                source = posixpath.normpath(source)
                for path, provenance in list(source_files.items()):
                    if path == source:
                        target = (posixpath.join(destination, posixpath.basename(path))
                                  if args[-1].endswith("/") or len(args) > 2
                                  else destination)
                    elif path.startswith(source.rstrip("/") + "/"):
                        target = posixpath.join(destination, path[len(source.rstrip("/")) + 1:])
                    elif source == "." and not source_stage:
                        target = posixpath.join(destination, path)
                    else:
                        continue
                    target = posixpath.normpath(target)
                    directory(posixpath.dirname(target), owner, mode if mode is not None else 0o755)
                    stages[stage][target] = provenance
                    metadata[stage][target] = {"kind":"file", "owner":owner,
                                               "mode":mode if mode is not None else 0o644}
    return (stages, metadata) if with_metadata else stages


class WorkerArtifactLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dockerfile = (ROOT / "infra/deploy/Dockerfile").read_text(encoding="utf-8")
        cls.layout, cls.metadata = copy_layout(cls.dockerfile, with_metadata=True)

    def test_built_raster_worker_url_resolves_in_api_artifact(self):
        source = (ROOT / "packages/ai/src/raster-worker.ts").read_text(encoding="utf-8")
        match = re.search(
            r"const ENTRYPOINT=new URL\(import\.meta\.url\.endsWith\('\.ts'\)"
            r"\?'([^']+)':'([^']+)'", source)
        self.assertIsNotNone(match, "Review the actual raster worker URL contract")
        built_module = "/app/dist/packages/ai/src/raster-worker.js"
        target = posixpath.normpath(posixpath.join(posixpath.dirname(built_module), match[2]))
        self.assertEqual(self.layout["api"].get(target), RASTER,
                         "The built raster Worker URL must name an included helper")
        self.assertEqual(self.layout["api"].get("/app/dist/packages/ai/src/raster.js"),
                         "SYNTHETIC_COMPILED_RASTER")

    def test_pdf_worker_contract_is_in_api_artifact(self):
        self.assertEqual(self.layout["api"].get("/app/" + PDF), PDF,
                         "The PDF worker must survive both explicit COPY boundaries")

    def test_pdf_worker_is_root_owned_and_read_only(self):
        item = self.metadata["api"]["/app/" + PDF]
        self.assertEqual(item["owner"], "root:root", "verifyPdfRuntime requires a root-owned worker")
        self.assertEqual(item["mode"], 0o444, "The node process may read but never edit the pinned worker")

    def test_pdf_worker_ancestors_are_root_owned_and_traversable(self):
        for path in ["/", "/app", "/app/infra", "/app/infra/ai"]:
            with self.subTest(path=path):
                item = self.metadata["api"][path]
                self.assertEqual(item["kind"], "dir")
                self.assertEqual(item["owner"], "root:root", "trustedPath checks every ancestor")
                self.assertEqual(item["mode"] & 0o022, 0)
                self.assertTrue(item["mode"] & 0o001, "The node user must traverse the parent")

    def test_private_sentinel_is_not_copied_to_any_stage(self):
        for name, files in self.layout.items():
            with self.subTest(stage=name):
                self.assertNotIn(PRIVATE_SENTINEL, files.values(),
                                 "Do not package the entire infra directory")

    def test_workers_are_absent_from_public_web_artifact(self):
        self.assertIn("SYNTHETIC_PUBLIC_WEB", self.layout["edge"].values())
        self.assertTrue({RASTER, PDF}.isdisjoint(self.layout["edge"].values()))


if __name__ == "__main__":
    unittest.main()
