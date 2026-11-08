"""Fully offline regression checks for the SHA-256-pinned Terraform provider mirror.

Only fictional byte buffers and ephemeral directories are used; no network,
cloud tokens, NCP resources or real provider install are touched here.
"""
from __future__ import annotations

import hashlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


REPO = Path(__file__).resolve().parents[2]


def module(filename: str):
    spec = importlib.util.spec_from_file_location(
        "hufs_ncp_" + filename.replace("-", "_").replace(".", "_"),
        REPO / "infra" / "ncp" / "terraform" / filename,
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class ProviderMirrorTests(unittest.TestCase):
    def setUp(self):
        self.m = module("provider-mirror.py")
        self.v = module("check-offline.py")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.payload = b"FICTIONAL_PROVIDER_ARCHIVE_FOR_SHA_ONLY"
        self.digest = hashlib.sha256(self.payload).hexdigest()
        self.mirror = self.root / "provider-mirror"

    def archive(self):
        return self.mirror / self.m.MIRROR_PATH

    def test_sha256_matches_the_repo_lockfile_pin(self):
        self.assertEqual(
            self.m.SHA256,
            self.v.PROVIDER_SHA256,
        )
        self.assertEqual(self.m.MIRROR_PATH, self.v.PROVIDER_RELATIVE_PATH)
        for name in ("network", "host"):
            lockfile = REPO / "infra" / "ncp" / "terraform" / name / ".terraform.lock.hcl"
            if not lockfile.exists():
                # Older local developer checkouts may omit NCP IaC. On GitHub
                # Actions the sparse checkout MUST include both real locks.
                self.assertNotEqual(os.environ.get("GITHUB_ACTIONS"), "true")
                continue
            lock = lockfile.read_text(encoding="utf-8")
            self.assertIn(f'"zh:{self.m.SHA256}"', lock)
            self.assertIn('version     = "4.0.7"', lock)

    def test_verified_cache_never_redownloads(self):
        path = self.archive()
        path.parent.mkdir(parents=True)
        path.write_bytes(self.payload)
        self.assertTrue(self.m.verified_archive(path, self.digest))

        def unexpected(*_args):
            raise AssertionError("verified cache should never touch network")

        out, status = self.m.prepare_mirror(
            self.mirror, digest=self.digest, download=unexpected
        )
        self.assertEqual(out, path)
        self.assertEqual(status, "VERIFIED_CACHED")

    def test_download_requires_exact_sha_and_atomic_move(self):
        destination = self.archive()
        self.m.download_verified(
            "https://example.org/fictional.zip",
            destination,
            self.digest,
            open_url=lambda _request, timeout: io.BytesIO(self.payload),
        )
        self.assertEqual(destination.read_bytes(), self.payload)
        self.assertTrue(self.m.verified_archive(destination, self.digest))

    def test_changed_digest_is_rejected_without_partial_archive(self):
        destination = self.archive()
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.m.download_verified(
                "https://example.org/fictional.zip",
                destination,
                "0" * 64,
                open_url=lambda _request, timeout: io.BytesIO(self.payload),
            )
        self.assertFalse(destination.exists())
        self.assertEqual(list(destination.parent.glob(".ncloud-verified-*")), [])

    def test_http_url_refused_without_attempting_network(self):
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            self.m.download_verified(
                "http://example.org/file.zip",
                self.archive(),
                self.digest,
                open_url=lambda _request, timeout: (_ for _ in ()).throw(
                    AssertionError("network request forbidden")
                ),
            )

    def test_oversized_or_empty_stream_is_rejected(self):
        dest = self.archive()
        with patch.object(self.m, "MAX_ARCHIVE_BYTES", 10):
            with self.assertRaisesRegex(ValueError, "size limit"):
                self.m.download_verified(
                    "https://example.org/fictional.zip",
                    dest,
                    self.digest,
                    open_url=lambda _request, timeout: io.BytesIO(self.payload),
                )
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.m.download_verified(
                "https://example.org/fictional.zip",
                dest,
                self.digest,
                open_url=lambda _request, timeout: io.BytesIO(b""),
            )
        self.assertFalse(dest.exists())

    def test_bad_cache_is_removed_and_replaced_only_with_verified_bytes(self):
        destination = self.archive()
        destination.parent.mkdir(parents=True)
        destination.write_bytes(b"malicious or corrupt archive")
        calls = []

        def fake_fetch(url, dest, digest):
            calls.append(url)
            dest.write_bytes(self.payload)

        out, status = self.m.prepare_mirror(
            self.mirror,
            urls=("https://example.org/release.zip",),
            attempts_per_url=1,
            digest=self.digest,
            download=fake_fetch,
        )
        self.assertEqual(status, "VERIFIED_DOWNLOADED")
        self.assertEqual(out.read_bytes(), self.payload)
        self.assertEqual(len(calls), 1)

    def test_two_official_distribution_routes_with_retries(self):
        calls = []

        def fake_fetch(url, dest, digest):
            calls.append(url)
            if url.endswith("/primary.zip"):
                raise OSError("transient upstream 504")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(self.payload)

        out, status = self.m.prepare_mirror(
            self.mirror,
            urls=("https://example.org/primary.zip", "https://example.org/release-asset.zip"),
            attempts_per_url=2,
            digest=self.digest,
            download=fake_fetch,
            pause=lambda _seconds: None,
        )
        self.assertEqual(status, "VERIFIED_DOWNLOADED")
        self.assertTrue(self.m.verified_archive(out, self.digest))
        self.assertEqual(len(calls), 3)

    def test_both_upstreams_down_fail_closed(self):
        def offline(_url, _dest, _digest):
            raise OSError("both release paths failed")

        with self.assertRaisesRegex(RuntimeError, "OFFLINE_PROVIDER_UNAVAILABLE"):
            self.m.prepare_mirror(
                self.mirror,
                urls=("https://example.org/release.zip", "https://example.org/asset.zip"),
                attempts_per_url=1,
                digest=self.digest,
                download=offline,
                pause=lambda _seconds: None,
            )
        self.assertFalse(self.archive().exists())

    def test_corrupted_cache_is_not_accepted_when_downloads_fail(self):
        path = self.archive()
        path.parent.mkdir(parents=True)
        path.write_bytes(b"invalid")
        with self.assertRaisesRegex(RuntimeError, "OFFLINE_PROVIDER_UNAVAILABLE"):
            self.m.prepare_mirror(
                self.mirror,
                urls=("https://example.org/asset.zip",),
                attempts_per_url=1,
                digest=self.digest,
                download=lambda *_args: (_ for _ in ()).throw(OSError("offline")),
            )
        self.assertFalse(path.exists())

    def test_symlinked_cache_is_refused(self):
        target = self.root / "outside"
        target.write_bytes(self.payload)
        dest = self.archive()
        dest.parent.mkdir(parents=True)
        dest.symlink_to(target)
        with self.assertRaisesRegex(ValueError, "symlink"):
            self.m.prepare_mirror(self.mirror, digest=self.digest)

    def test_checker_requires_the_mirror_and_lockfile_to_match(self):
        archive = self.archive()
        archive.parent.mkdir(parents=True)
        archive.write_bytes(self.payload)
        module_dir = self.root / "module"
        module_dir.mkdir()
        (module_dir / ".terraform.lock.hcl").write_text(
            f'provider "registry.terraform.io/navercloudplatform/ncloud" {{\n'
            f'  version     = "4.0.7"\n'
            f'  hashes = ["zh:{self.digest}"]\n'
            f'}}\n',
            encoding="utf-8",
        )
        with patch.object(self.v, "PROVIDER_SHA256", self.digest):
            self.assertEqual(self.v.verify_provider_mirror(self.mirror, module_dir), archive)
            archive.write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                self.v.verify_provider_mirror(self.mirror, module_dir)

    def test_checker_denies_unreviewed_module_lock(self):
        archive = self.archive()
        archive.parent.mkdir(parents=True)
        archive.write_bytes(self.payload)
        module_dir = self.root / "module"
        module_dir.mkdir()
        (module_dir / ".terraform.lock.hcl").write_text(
            'provider "registry.terraform.io/navercloudplatform/ncloud" {\n'
            '  version     = "4.0.6"\n}\n',
            encoding="utf-8",
        )
        with patch.object(self.v, "PROVIDER_SHA256", self.digest):
            with self.assertRaisesRegex(ValueError, "lockfile"):
                self.v.verify_provider_mirror(self.mirror, module_dir)

    def test_offline_cli_config_has_only_filesystem_provider_installation(self):
        cfg = self.v.offline_cli_config(self.mirror)
        self.assertIn("filesystem_mirror", cfg)
        self.assertIn(str(self.mirror), cfg)
        self.assertIn("disable_checkpoint = true", cfg)
        self.assertNotIn("direct {", cfg)
        self.assertNotIn("network_mirror", cfg)
        self.assertNotIn("credentials", cfg)
        self.assertNotIn("token =", cfg)


if __name__ == "__main__":
    unittest.main()
