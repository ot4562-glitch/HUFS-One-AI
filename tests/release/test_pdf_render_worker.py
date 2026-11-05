"""Synthetic PDF parser/render regressions; no external source or OCR service."""
import importlib.util
import io
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "infra/ai/pdf-render-worker.py"
spec = importlib.util.spec_from_file_location("pdf_render_worker", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
HAS_PYPDF = importlib.util.find_spec("pypdf") is not None

def pdf(pages=2, page_extra="", catalog_extra="", trailer_extra="", metadata="", media="[10 20 210 320]"):
    objects = [
        f"<< /Type /Catalog /Pages 2 0 R {catalog_extra} >>",
        "<< /Type /Pages /Count " + str(pages) + " /Kids [" +
        " ".join(f"{3 + i*2} 0 R" for i in range(pages)) + "] >>",
    ]
    for i in range(pages):
        shape = "0 0 1 rg 30 260 40 30 re f" if i == 0 else "1 0 0 rg 130 80 50 60 re f"
        stream = shape.encode("ascii")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox {media} /Resources << >> /Contents {4+i*2} 0 R {page_extra} >>")
        objects.append(f"<< /Length {len(stream)} >>\nstream\n{shape}\nendstream")
    if metadata:
        objects.append(metadata)
    result = b"%PDF-1.7\n"
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result += f"{i} 0 obj\n{obj}\nendobj\n".encode("ascii")
    xref = len(result)
    result += f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode("ascii")
    result += b"".join(f"{offset:010d} 00000 n \n".encode("ascii") for offset in offsets[1:])
    result += f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R {trailer_extra} >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii")
    return result

@unittest.skipUnless(HAS_PYPDF, "reviewed pypdf runtime unavailable")
class PdfInspection(unittest.TestCase):
    def inspect(self, content):
        return worker.inspect_pdf(content, "6.21.4")

    def test_two_full_pages_preserve_original_geometry(self):
        result = self.inspect(pdf())
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["mediaBox"], [10.0,20.0,210.0,320.0])
        self.assertEqual(result[1]["pageIndex"], 1)
        self.assertEqual(result[1]["cropBox"], result[1]["mediaBox"])

    def test_rejects_active_external_or_attached_content_in_parsed_objects(self):
        entries = [
            "/OpenAction << /S /JavaScript /JS (alert) >>",
            "/AA << /O << /S /URI /URI (https://example.invalid) >> >>",
            "/AcroForm << >>",
            "/Names << /EmbeddedFiles << /Names [] >> >>",
            "/Names << /JavaScript << /Names [] >> >>",
            "/Collection << >>",
            "/Metadata 7 0 R",
        ]
        for entry in entries:
            with self.subTest(entry=entry), self.assertRaises(worker.PdfRefused):
                self.inspect(pdf(catalog_extra=entry))
        for entry in ["/Annots []", "/Rotate 90", "/Rotate 360", "/UserUnit 2",
                      "/CropBox [10 20 200 320]", "/PieceInfo << >>"]:
            with self.subTest(entry=entry), self.assertRaises(worker.PdfRefused):
                self.inspect(pdf(page_extra=entry))

    def test_unreachable_dangerous_object_is_rejected(self):
        with self.assertRaises(worker.PdfRefused):
            self.inspect(pdf(metadata="<< /Type /Filespec /F (file:///etc/passwd) >>"))

    def test_pdf_name_escapes_do_not_hide_javascript(self):
        with self.assertRaises(worker.PdfRefused):
            self.inspect(pdf(catalog_extra="/OpenAction << /S /Java#53cript /J#53 (script) >>"))

    def test_literal_text_is_not_misclassified_as_an_action(self):
        self.assertEqual(len(self.inspect(pdf(metadata="<< /Title (JavaScript URI /JS harmless title) >>"))),2)

    def test_box_page_size_header_and_byte_caps(self):
        cases = [pdf(pages=5),pdf(pages=0),pdf(media="[0 0 0 300]"),
                 pdf(media="[0 0 200000 300]"),b"not PDF",pdf()+b"trailing-junk",
                 b"%PDF-1.7\n"+b" "*262144+b"%%EOF"]
        for content in cases:
            with self.subTest(length=len(content)), self.assertRaises(worker.PdfRefused):
                self.inspect(content)

    def test_encrypted_document_is_not_decrypted_or_rendered(self):
        from pypdf import PdfReader, PdfWriter
        writer=PdfWriter()
        for page in PdfReader(io.BytesIO(pdf())).pages:
            writer.add_page(page)
        writer.encrypt("SYNTHETIC-NOT-A-CREDENTIAL")
        out=io.BytesIO();writer.write(out)
        with self.assertRaises(worker.PdfRefused):
            self.inspect(out.getvalue())

    def test_version_mismatch_is_refused(self):
        with self.assertRaises(worker.PdfRefused):
            worker.inspect_pdf(pdf(),"0.0.0")

@unittest.skipUnless(HAS_PYPDF, "reviewed pypdf runtime unavailable")
class ActualPdfRender(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.binary = os.environ.get("HUFS_TEST_PDFTOPPM") or shutil.which("pdftoppm")
        if not cls.binary:
            raise unittest.SkipTest("native Poppler runtime unavailable")
        try:
            from PIL import Image
            cls.Image = Image
        except ImportError:
            raise unittest.SkipTest("Pillow is required for the synthetic pixel oracle")

    def test_actual_two_page_render_matches_independent_original_page_anchors(self):
        with tempfile.TemporaryDirectory(prefix="hufs-pdf-test-") as temporary:
            directory=Path(temporary)
            source=directory/"input.pdf";source.write_bytes(pdf())
            result=worker.render_document(source,directory,Path(self.binary),
                "6.21.4","26.05.0",".".join(map(str,sys.version_info[:3])))
            self.assertEqual(result["pageCount"],2)
            self.assertEqual([p["pageIndex"] for p in result["pages"]],[0,1])
            self.assertNotEqual(result["pages"][0]["rasterSha256"],result["pages"][1]["rasterSha256"])
            for index,expected in enumerate([(0.1,0.1,0.3,0.2),(0.6,0.6,0.85,0.8)]):
                image=self.Image.open(directory/f"page-{index}.png").convert("RGB")
                pixels=image.load();xs=[];ys=[]
                for y in range(image.height):
                    for x in range(image.width):
                        red,green,blue=pixels[x,y]
                        marked=(blue>200 and red<40 and green<40) if index==0 else (red>200 and green<40 and blue<40)
                        if marked: xs.append(x);ys.append(y)
                self.assertTrue(xs)
                actual=(min(xs)/image.width,min(ys)/image.height,(max(xs)+1)/image.width,(max(ys)+1)/image.height)
                for got,wanted in zip(actual,expected):
                    self.assertAlmostEqual(got,wanted,delta=2/min(image.width,image.height))
                self.assertLessEqual((directory/f"page-{index}.png").stat().st_size,262144)

    def test_packaged_cli_runs_actual_renderer_with_private_outputs_and_generic_errors(self):
        import hashlib
        import json
        import subprocess
        import pypdf
        package_root=str(Path(pypdf.__file__).resolve().parent.parent)
        with tempfile.TemporaryDirectory(prefix="hufs-pdf-test-") as temporary:
            directory=Path(temporary)
            source=directory/"input.pdf";source.write_bytes(pdf())
            command=[sys.executable,"-I","-S","-B",str(WORKER),
                "--input",str(source),"--output",str(directory),"--pdftoppm",str(self.binary),
                "--pypdf-root",package_root,"--python-version",".".join(map(str,sys.version_info[:3])),
                "--pypdf-version","6.21.4","--poppler-version","26.05.0"]
            completed=subprocess.run(command,capture_output=True,text=True,timeout=15,
                env={"PATH":"/usr/bin:/bin","LANG":"C","LC_ALL":"C"})
            self.assertEqual(completed.returncode,0,completed.stdout)
            self.assertEqual(completed.stderr,"")
            result=json.loads(completed.stdout)
            self.assertEqual(result["originalSha256"],hashlib.sha256(pdf()).hexdigest())
            self.assertEqual(result["pageCount"],2)
            for index in range(2):
                self.assertEqual((directory/f"page-{index}.png").stat().st_mode & 0o077,0)
            source.write_bytes(b"SYNTHETIC-PRIVATE-DETAIL-MUST-NOT-ESCAPE")
            refused=subprocess.run(command,capture_output=True,text=True,timeout=15,
                env={"PATH":"/usr/bin:/bin","LANG":"C","LC_ALL":"C"})
            self.assertEqual(refused.returncode,1)
            self.assertEqual(json.loads(refused.stdout),{"error":"PDF_RENDERER_UNAVAILABLE"})
            self.assertEqual(refused.stderr,"")

    def test_refuses_foreign_existing_output_and_no_partial_manifest(self):
        with tempfile.TemporaryDirectory(prefix="hufs-pdf-test-") as temporary:
            directory=Path(temporary);source=directory/"input.pdf";source.write_bytes(pdf())
            sentinel=directory/"page-0.png";sentinel.write_bytes(b"SYNTHETIC-SENTINEL")
            with self.assertRaises(worker.PdfRefused):
                worker.render_document(source,directory,Path(self.binary),
                    "6.21.4","26.05.0",".".join(map(str,sys.version_info[:3])))
            self.assertEqual(sentinel.read_bytes(),b"SYNTHETIC-SENTINEL")

if __name__ == "__main__":
    unittest.main()
