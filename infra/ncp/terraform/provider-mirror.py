"""Acquire the exact approved NCP provider archive for an offline Terraform mirror.

Fetch *only* the publicly released Linux/AMD64 4.0.7 ZIP, independently
verify its SHA-256 (also present in both module .terraform.lock.hcl files),
and place it in Terraform's documented packed filesystem-mirror layout.
No NCP credentials, Terraform registry signatures, apply or API calls.
Download failures remain failures; never silently skip provider validation.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import tempfile
import time
import urllib.error
import urllib.request
from typing import Callable

VERSION = "4.0.7"
ARCHIVE = f"terraform-provider-ncloud_{VERSION}_linux_amd64.zip"
SHA256 = "edbaca618aa59b9e5d5b04db1c4aabc34d108015609268ea276ace34eefac285"
MIRROR_PATH = Path("registry.terraform.io/navercloudplatform/ncloud") / ARCHIVE
MAX_ARCHIVE_BYTES = 25_000_000
DOWNLOADS = (
    f"https://github.com/NaverCloudPlatform/terraform-provider-ncloud/releases/download/v{VERSION}/{ARCHIVE}",
    # Public release-asset API can use a different delivery path on a transient
    # github.com signature/redirect outage. It must pass the same exact hash.
    "https://api.github.com/repos/NaverCloudPlatform/terraform-provider-ncloud/releases/assets/491138992",
)


def verified_archive(path: Path, digest: str = SHA256) -> bool:
    if path.is_symlink() or not path.is_file():
        return False
    if not (1 <= path.stat().st_size <= MAX_ARCHIVE_BYTES):
        return False
    h = hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest() == digest


def download_verified(
    url: str,
    dest: Path,
    digest: str = SHA256,
    *,
    open_url: Callable = urllib.request.urlopen,
) -> None:
    """Download into a unique temporary file, verify exact hash, atomically move."""
    if dest.is_symlink():
        raise ValueError("provider destination must not be a symlink")
    if not url.startswith("https://"):
        raise ValueError("provider upstream must use HTTPS")
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/octet-stream",
            "User-Agent": "hufs-one-ai-verified-ncloud-mirror/1",
        },
    )
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=dest.parent, prefix=".ncloud-verified-", suffix=".tmp", delete=False
        ) as f:
            temp = Path(f.name)
            h = hashlib.sha256()
            size = 0
            with open_url(req, timeout=45) as response:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_ARCHIVE_BYTES:
                        raise ValueError("provider asset exceeded download size limit")
                    h.update(chunk)
                    f.write(chunk)
        if size == 0 or h.hexdigest() != digest:
            raise ValueError("provider asset SHA-256 does not match pinned release")
        os.replace(temp, dest)
        temp = None
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def prepare_mirror(
    mirror: Path,
    *,
    urls: tuple[str, ...] = DOWNLOADS,
    attempts_per_url: int = 3,
    digest: str = SHA256,
    download: Callable = download_verified,
    pause: Callable[[float], None] = time.sleep,
) -> tuple[Path, str]:
    """Use checked cache first; try both official paths, refusing all unverified bytes."""
    if attempts_per_url < 1 or attempts_per_url > 5 or not urls:
        raise ValueError("invalid mirror retry policy")
    target = mirror / MIRROR_PATH
    if target.is_symlink():
        raise ValueError("cached provider destination must not be a symlink")
    if verified_archive(target, digest):
        return target, "VERIFIED_CACHED"
    # Corrupted cache must not be passed to Terraform init.
    if target.exists():
        if not target.is_file():
            raise ValueError("cached provider destination is not a regular file")
        target.unlink()
    for url in urls:
        for attempt in range(attempts_per_url):
            try:
                download(url, target, digest)
                if not verified_archive(target, digest):
                    raise ValueError("verification must also pass after atomic write")
                return target, "VERIFIED_DOWNLOADED"
            except (OSError, ValueError, urllib.error.URLError):
                if target.exists():
                    target.unlink()
                if attempt + 1 < attempts_per_url:
                    pause(2.0 * (attempt + 1))
    raise RuntimeError("OFFLINE_PROVIDER_UNAVAILABLE: approved SHA-256 archive not retrievable")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mirror", type=Path, required=True)
    args = parser.parse_args()
    if args.mirror.is_symlink():
        raise SystemExit("Refusing symlinked provider mirror")
    archive, status = prepare_mirror(args.mirror)
    print(f"NCP provider {VERSION} Linux amd64: {status}; SHA-256 {SHA256}")
    print(f"Terraform packed offline mirror: {archive.parent}")


if __name__ == "__main__":
    main()
