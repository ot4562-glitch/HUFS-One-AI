"""Private PDF worker. Invoked only by the pinned, isolated Node host.
No network, OCR, permission receipt or approval is created here.
The native renderer and its libraries/fonts remain reviewed runtime dependencies.
"""
import argparse
import hashlib
import io
import json
import logging
import math
import os
from pathlib import Path
import re
import resource
import stat
import subprocess
import sys
import time

MAX_ORIGINAL = 256 * 1024
MAX_PAGE = 256 * 1024
MAX_TOTAL = 1024 * 1024
MAX_PAGES = 4
SUPPORTED_PYPDF = "6.21.4"
logging.disable(logging.CRITICAL)

class PdfRefused(Exception):
    pass

def refuse():
    raise PdfRefused("PDF_RENDERER_UNAVAILABLE")

def digest(value):
    return hashlib.sha256(value).hexdigest()

def check_bytes(value):
    if (not isinstance(value, bytes) or not 1 <= len(value) <= MAX_ORIGINAL
            or not re.match(br"^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)", value)
            or not value.rstrip().endswith(b"%%EOF")):
        refuse()

def inspect_pdf(value, expected_version):
    """Inspect parsed objects, not a regex approximation of PDF object syntax.
    Strict v1 refuses annotations, forms, scripts, attachments, external file
    references, alternate layouts, non-unit coordinates, rotation and cropping.
    This check cannot certify the absence of every parser vulnerability or PII.
    """
    try:
        check_bytes(value)
        import pypdf
        from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject, NameObject
        import pypdf.filters
        if expected_version != SUPPORTED_PYPDF or pypdf.__version__ != expected_version:
            refuse()
        pypdf.filters.ZLIB_MAX_OUTPUT_LENGTH = 8 * 1024 * 1024
        reader = pypdf.PdfReader(io.BytesIO(value), strict=True)
        if reader.is_encrypted:
            refuse()
        forbidden_keys = {
            "/AA", "/OpenAction", "/AcroForm", "/XFA", "/JavaScript", "/JS",
            "/EmbeddedFiles", "/EmbeddedFile", "/EF", "/RF", "/RichMedia",
            "/RichMediaContent", "/RichMediaSettings", "/Launch", "/URI",
            "/SubmitForm", "/ImportData", "/Sound", "/Movie", "/Rendition",
            "/Collection", "/3D", "/F", "/FFilter", "/FDecodeParms", "/OPI",
            "/AlternatePresentations", "/Annots", "/PieceInfo", "/Metadata",
        }
        forbidden_names = {
            "/JavaScript", "/Launch", "/GoToR", "/GoToE", "/URI", "/SubmitForm",
            "/ImportData", "/Rendition", "/Sound", "/Movie", "/RichMedia",
            "/Filespec", "/EmbeddedFile", "/Crypt", "/3D",
        }
        visited_refs = set()
        visited_containers = set()
        budget = [0]
        def scan(obj, depth=0):
            budget[0] += 1
            if depth > 64 or budget[0] > 20000:
                refuse()
            if isinstance(obj, IndirectObject):
                key = (obj.idnum, obj.generation)
                if key in visited_refs:
                    return
                if obj.pdf is not reader or len(visited_refs) >= 4096:
                    refuse()
                visited_refs.add(key)
                scan(obj.get_object(), depth+1)
            elif isinstance(obj, DictionaryObject):
                if id(obj) in visited_containers:
                    return
                visited_containers.add(id(obj))
                if len(obj) > 2048 or any(str(key) in forbidden_keys for key in obj):
                    refuse()
                for key, item in obj.items():
                    scan(key, depth+1)
                    scan(item, depth+1)
            elif isinstance(obj, ArrayObject):
                if id(obj) in visited_containers:
                    return
                visited_containers.add(id(obj))
                if len(obj) > 4096:
                    refuse()
                for item in obj:
                    scan(item, depth+1)
            elif isinstance(obj, NameObject) and str(obj) in forbidden_names:
                refuse()
        scan(reader.trailer)
        # Also inspect unused objects so a hidden attachment/action is not
        # accepted merely because this parser did not follow it from the root.
        refs = {(int(number), int(generation)) for generation, entries in reader.xref.items()
                for number in entries if int(number) != 0}
        refs.update((int(number), 0) for number in reader.xref_objStm)
        if len(refs) > 4096:
            refuse()
        for number, generation in sorted(refs):
            scan(IndirectObject(number, generation, reader))
        root = reader.trailer["/Root"]
        if root.get("/Type") != "/Catalog":
            refuse()
        count = root["/Pages"]["/Count"]
        if isinstance(count, bool) or not isinstance(count, (int, float)) or count != int(count) or not 1 <= count <= MAX_PAGES:
            refuse()
        pages = reader.pages
        if len(pages) != int(count):
            refuse()
        result = []
        for index in range(int(count)):
            page = pages[index]
            rotation = page.get("/Rotate", 0)
            unit = page.get("/UserUnit", 1)
            if hasattr(rotation, "get_object"):
                rotation = rotation.get_object()
            if hasattr(unit, "get_object"):
                unit = unit.get_object()
            if isinstance(rotation, bool) or isinstance(unit, bool) or rotation != 0 or unit != 1:
                refuse()
            media = [float(number) for number in page.mediabox]
            crop = [float(number) for number in page.cropbox]
            if (len(media) != 4 or len(crop) != 4 or media != crop
                    or any(not math.isfinite(number) or abs(number) > 14400 for number in media)
                    or not 0 < media[2]-media[0] <= 14400
                    or not 0 < media[3]-media[1] <= 14400):
                refuse()
            result.append({"pageIndex":index, "mediaBox":media, "cropBox":crop,
                           "rotation":0, "userUnit":1})
        return result
    except PdfRefused:
        raise
    except Exception:
        refuse()

def read_regular(path, cap):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 1 <= before.st_size <= cap:
            refuse()
        value = os.read(descriptor, cap+1)
        after = os.fstat(descriptor)
        if len(value) != before.st_size or after.st_size != before.st_size or after.st_ino != before.st_ino:
            refuse()
        return value
    finally:
        os.close(descriptor)

def render_document(source, directory, pdftoppm, pypdf_version, poppler_version, python_version):
    try:
        source = Path(source)
        directory = Path(directory)
        if source.name != "input.pdf" or source.parent != directory or directory.is_symlink():
            refuse()
        if ".".join(map(str,sys.version_info[:3])) != python_version:
            refuse()
        if not re.fullmatch(r"\d+\.\d+\.\d+", poppler_version):
            refuse()
        value = read_regular(source, MAX_ORIGINAL)
        geometry = inspect_pdf(value,pypdf_version)
        if set(path.name for path in directory.iterdir()) != {"input.pdf"}:
            refuse()
        deadline = time.monotonic()+8.0
        version = subprocess.run([str(pdftoppm),"-v"],stdin=subprocess.DEVNULL,
            capture_output=True,timeout=2,check=False)
        version_text = version.stderr + version.stdout
        if (version.returncode != 0 or len(version_text)>4096
                or not re.search(rb"^pdftoppm version "+re.escape(poppler_version.encode("ascii"))+rb"(?:\r?\n|$)",version_text)):
            refuse()
        pages = []
        total = len(value)
        for index,page in enumerate(geometry):
            remaining = deadline-time.monotonic()
            if remaining <= 0:
                refuse()
            prefix = directory/f"page-{index}"
            command = [str(pdftoppm),"-f",str(index+1),"-l",str(index+1),
                       "-singlefile","-r","144","-scale-to","2000","-png",
                       str(source),str(prefix)]
            # No password bypass, cropbox, custom image profile, URL, shell or
            # caller-controlled render arguments. Node kills the process group
            # on abort/deadline; the worker is already in a networkless namespace.
            result = subprocess.run(command,stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                timeout=min(remaining,7.0),check=False)
            if result.returncode != 0:
                refuse()
            output = directory/f"page-{index}.png"
            descriptor = os.open(output,os.O_RDONLY | os.O_NOFOLLOW)
            try:
                info = os.fstat(descriptor)
                if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                    refuse()
                os.fchmod(descriptor,0o600)
            finally:
                os.close(descriptor)
            png = read_regular(output,MAX_PAGE)
            if (len(png)<33 or png[:8]!=b"\x89PNG\r\n\x1a\n"
                    or int.from_bytes(png[8:12],"big")!=13 or png[12:16]!=b"IHDR"):
                refuse()
            width = int.from_bytes(png[16:20],"big")
            height = int.from_bytes(png[20:24],"big")
            if not 1 <= width <= 2240 or not 1 <= height <= 2240 or width*height>4000000:
                refuse()
            pw = page["mediaBox"][2]-page["mediaBox"][0]
            ph = page["mediaBox"][3]-page["mediaBox"][1]
            if abs(width-height*pw/ph)>1.01 or abs(height-width*ph/pw)>1.01:
                refuse()
            total += len(png)
            if total > MAX_TOTAL:
                refuse()
            pages.append({**page,"file":output.name,"rasterSha256":digest(png),"byteLength":len(png)})
        if read_regular(source,MAX_ORIGINAL) != value:
            refuse()
        if set(path.name for path in directory.iterdir()) != {"input.pdf",*(page["file"] for page in pages)}:
            refuse()
        return {"version":"pdf-worker-v1","originalSha256":digest(value),
                "pythonVersion":python_version,"pypdfVersion":pypdf_version,
                "popplerVersion":poppler_version,"pageCount":len(pages),"pages":pages}
    except PdfRefused:
        raise
    except Exception:
        refuse()

def apply_limits():
    # These are per-process resource limits, not evidence of deployment cgroups.
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    resource.setrlimit(resource.RLIMIT_AS,(768*1024*1024,768*1024*1024))
    resource.setrlimit(resource.RLIMIT_CPU,(8,8))
    resource.setrlimit(resource.RLIMIT_FSIZE,(MAX_PAGE,MAX_PAGE))
    resource.setrlimit(resource.RLIMIT_NOFILE,(32,32))
    os.umask(0o077)

class PrivateArguments(argparse.ArgumentParser):
    def error(self, message):
        refuse()

def main():
    try:
        apply_limits()
        parser=PrivateArguments(add_help=False)
        for name in ["input","output","pdftoppm","pypdf-root","python-version","pypdf-version","poppler-version"]:
            parser.add_argument("--"+name,required=True)
        args=parser.parse_args()
        # -I -S excludes user/site packages. Import only the independently pinned
        # package tree; an absent optional encryption dependency never enables PDF decryption.
        sys.dont_write_bytecode=True
        sys.pycache_prefix="/nonexistent-hufs-pyc"
        sys.path.insert(0,args.pypdf_root)
        result=render_document(Path(args.input),Path(args.output),Path(args.pdftoppm),
            args.pypdf_version,args.poppler_version,args.python_version)
        print(json.dumps(result,allow_nan=False,separators=(",",":")))
        return 0
    except BaseException:
        print('{"error":"PDF_RENDERER_UNAVAILABLE"}')
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
