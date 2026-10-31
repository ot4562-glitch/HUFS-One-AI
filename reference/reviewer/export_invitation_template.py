#!/usr/bin/env python3
"""Build either an INACTIVE Git-safe PDF invitation or a PRIVATE shared-judge PDF.
Active shared-link inputs/outputs MUST remain in local_only/reviewer_invitations;
never commit an active access code or a private invitation PDF.
"""
import argparse
import hashlib
import html
import json
from datetime import datetime
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import quote, urlsplit
from zoneinfo import ZoneInfo

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
TEMPLATE=HERE/"ReviewerInvitation.TEMPLATE.html"
TEMPLATE_PDF=HERE/"ReviewerInvitation.TEMPLATE.pdf"
PRIVATE_DIR=ROOT/"local_only"/"reviewer_invitations"

def winpath(path:Path)->str:
    return subprocess.check_output(["wslpath","-w",str(path)],text=True).strip()

def format_kst(raw:str)->str:
    value=datetime.fromisoformat(raw.replace("Z","+00:00"))
    if value.tzinfo is None:raise ValueError("Explicit UTC offset required")
    return value.astimezone(ZoneInfo("Asia/Seoul")).strftime("%Y.%m.%d %H:%M")

def private_html(payload:dict, source:str)->str:
    required={"maxAccounts","accessUrl","startsAt","endsAt","invitationId","label"}
    if set(payload)!=required:raise ValueError("Private invitation JSON does not match expected schema")
    seats=payload["maxAccounts"]
    url=payload["accessUrl"]
    if not isinstance(seats,int) or isinstance(seats,bool) or not 1<=seats<=50 or not isinstance(url,str):
        raise ValueError("Invalid invitation")
    parts=urlsplit(url)
    if parts.scheme!="https" or not parts.netloc or parts.username or parts.password or parts.path!="/reviewer/invite" or parts.query or not re.fullmatch(r"code=[A-Za-z0-9_-]{43}",parts.fragment):
        raise ValueError("Invalid invitation URL")
    code=parts.fragment.split("=",1)[1]
    if len(code)!=43:raise ValueError("Missing enrollment code")
    # Safely escape all externally provided values before injecting into markup.
    title=html.escape(str(payload["label"]))
    safe_url=html.escape(url,quote=True)
    s=source
    if s.count("[YYYY.MM.DD HH:MM]") != 2:raise ValueError("Expected two date placeholders")
    # The two date fields are distinct; fill start and end in order.
    s=s.replace("[YYYY.MM.DD HH:MM]",format_kst(payload["startsAt"]),1)
    s=s.replace("[YYYY.MM.DD HH:MM]",format_kst(payload["endsAt"]),1)
    if datetime.fromisoformat(payload["endsAt"].replace("Z","+00:00")) <= datetime.fromisoformat(payload["startsAt"].replace("Z","+00:00")):
        raise ValueError("End of review must be after start")
    repl={
      "[등록 가능 Google 계정 수]":str(seats)+"명 (최초 등록 상한)",
      "본선 진출 후 확정":"공용 링크 승인 후 발급",
      "공용 심사 초대 링크는 본선 진출 후 활성화됩니다.":"심사자 공용 접속 링크",
      "제출 자료에 첨부된 보안 링크를 통해 개별 Google 계정을 등록합니다.<br>현재 이 문서는 비활성 서식이며 심사 기간과 접속 주소는 확정 전입니다.":
        "아래 링크를 열고 본인의 Google 계정을 등록하세요.<br>"
        "<a href=\""+safe_url+"\" style=\"color:#095c68;font-weight:800;text-decoration:underline;\">"
        "심사 전용 접속 페이지 열기</a> · 링크를 외부에 재공유하지 마세요.",
      "TEMPLATE · NOT ACTIVE":"SHARED INVITE · CONFIDENTIAL",
    }
    for old,new in repl.items():
        if old not in s:raise ValueError("Template marker missing")
        s=s.replace(old,new)
    # Ensure no placeholder metadata was accidentally left behind.
    if "[등록 가능 Google 계정 수]" in s or "TEMPLATE · NOT ACTIVE" in s:
        raise ValueError("Personalization incomplete")
    return s

def export(source_html:str,output:Path)->dict:
    browser=next((p for p in [
        Path("/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"),
        Path("/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe"),
    ] if p.exists()),None)
    if not browser:raise RuntimeError("Chrome or Edge required")
    with tempfile.TemporaryDirectory(prefix=".reviewer_pdf_") as d:
        temp=Path(d)
        profile=temp/"chrome"
        profile.mkdir()
        source=temp/"invite.html"
        source.write_text(source_html,encoding="utf-8")
        url="file:///"+quote(winpath(source).replace("\\","/"),safe="/:")
        cmd=[str(browser),"--headless=new","--disable-gpu","--disable-extensions",
            "--no-first-run","--no-default-browser-check","--no-pdf-header-footer",
            "--user-data-dir="+winpath(profile),"--print-to-pdf="+winpath(output),url]
        p=subprocess.run(cmd,capture_output=True,text=True,timeout=180)
        if p.returncode:raise RuntimeError("Browser export failed (details withheld)")
        for _ in range(30):
            if output.exists() and output.stat().st_size>9000:break
            time.sleep(.25)
    data=output.read_bytes()
    if not data.startswith(b"%PDF-"):raise RuntimeError("Invalid PDF output")
    pages=len(re.findall(rb"/Type\s*/Page\b",data))
    if pages!=1:raise RuntimeError("Invitation must be exactly one A4 page")
    return {"pages":pages,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--private-json",type=Path,
        help="local_only/reviewer_invitations/uuid.json created by admin:reviewer")
    args=parser.parse_args()
    raw=TEMPLATE.read_text("utf-8")
    if not args.private_json:
        if "TEMPLATE · NOT ACTIVE" not in raw:raise ValueError("Template must be disabled")
        dest=TEMPLATE_PDF
        stats=export(raw,dest)
        print("INACTIVE_PDF_TEMPLATE_OK",stats)
        return
    path=args.private_json.resolve(strict=True)
    private=PRIVATE_DIR.resolve()
    if path.parent!=private or path.suffix!=".json":
        raise ValueError("Private invitation inputs must stay in local_only")
    payload=json.loads(path.read_text("utf-8"))
    source=private_html(payload,raw)
    dest=path.with_suffix(".pdf")
    if dest.exists():raise FileExistsError("Private invitation PDF already exists")
    stats=export(source,dest)
    print("PRIVATE_INVITATION_PDF_OK",{"pages":stats["pages"],"bytes":stats["bytes"]})
    # Never print a token, shared link, or private filename in stdout.

if __name__=="__main__":
    main()
