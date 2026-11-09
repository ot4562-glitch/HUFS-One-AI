"""Synthetic review-policy tests. No GitHub calls, student data or credentials."""
import contextlib
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit, parse_qs
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/independent-pr-review.yml"
HEAD = "a" * 40
STALE = "b" * 40


def embedded_script():
    body = WORKFLOW.read_text(encoding="utf-8")
    marker = "          python3 - <<'PY'\n"
    assert marker in body, "workflow must use pinned inline script rather than checkout PR code"
    text = body.split(marker, 1)[1].split("\n          PY", 1)[0]
    return "\n".join(line[10:] if line.startswith("          ") else line
                     for line in text.splitlines()) + "\n"


def submitted(login, state, sha=HEAD, number=1):
    return {
        "id": number, "user": {"login": login}, "state": state,
        "commit_id": sha, "submitted_at": f"2026-11-09T10:{number:02d}:00Z",
    }


def run_gate(reviews, permissions=None, author="ot4562-glitch", heads=None,
             draft=False, base="main"):
    script = embedded_script()
    statuses = list(heads or [HEAD, HEAD])
    permissions = permissions or {"lhh42001": "write", "qamarrchae": "write"}
    requests = []

    def get(request, timeout=20):
        url = urlsplit(request.full_url)
        path = url.path
        requests.append(path)
        if path.endswith("/pulls/42"):
            sha = statuses.pop(0) if statuses else HEAD
            result = {"state":"open", "draft":draft, "base":{"ref":base},
                      "head":{"sha":sha}, "user":{"login":author}}
        elif path.endswith("/pulls/42/reviews"):
            page = int(parse_qs(url.query).get("page", ["1"])[0])
            result = reviews if page == 1 else []
        elif "/collaborators/" in path and path.endswith("/permission"):
            login = path.split("/collaborators/")[1].split("/")[0]
            if permissions.get(login) == "HTTP_403":
                raise HTTPError(request.full_url, 403, "forbidden", None, None)
            result = {"permission": permissions.get(login, "read")}
        else:
            raise AssertionError("Unexpected URL: " + url.geturl())
        return io.BytesIO(json.dumps(result).encode("utf-8"))

    output = io.StringIO()
    with patch.dict(os.environ, {
        "REPO": "ot4562-glitch/HUFS-One-AI", "NUMBER": "42",
        "GH_API_URL": "https://api.github.com", "GH_TOKEN": "SYNTHETIC",
    }), patch("urllib.request.urlopen", side_effect=get), contextlib.redirect_stdout(output):
        try:
            exec(compile(script, "independent-pr-review.yml", "exec"), {"__name__": "__main__"})
            return True, output.getvalue(), requests
        except SystemExit as exc:
            return False, str(exc), requests


class IndependentCollaboratorReviewTests(unittest.TestCase):
    def test_requires_external_approval(self):
        ok, _, _ = run_gate([submitted("ot4562-glitch", "APPROVED")])
        self.assertFalse(ok)

    def test_comment_not_approval(self):
        ok, _, _ = run_gate([submitted("lhh42001", "COMMENTED")])
        self.assertFalse(ok)

    def test_stale_approval_invalid_after_push(self):
        ok, _, _ = run_gate([submitted("lhh42001", "APPROVED", STALE)])
        self.assertFalse(ok)

    def test_write_collaborator_approved_current_head(self):
        ok, msg, _ = run_gate([submitted("lhh42001", "APPROVED")])
        self.assertTrue(ok, msg)

    def test_read_only_reviewer_does_not_qualify(self):
        ok, _, _ = run_gate([submitted("outside", "APPROVED")], {"outside": "read"})
        self.assertFalse(ok)

    def test_outstanding_changes_requested_blocks_second_approval(self):
        reviews = [submitted("qamarrchae", "CHANGES_REQUESTED", number=1),
                   submitted("lhh42001", "APPROVED", number=2)]
        ok, _, _ = run_gate(reviews)
        self.assertFalse(ok)

    def test_new_approval_from_same_reviewer_clears_own_changes_request(self):
        reviews = [submitted("lhh42001", "CHANGES_REQUESTED", number=1),
                   submitted("lhh42001", "APPROVED", number=2)]
        ok, msg, _ = run_gate(reviews)
        self.assertTrue(ok, msg)

    def test_review_check_rejects_concurrent_head_change(self):
        ok, _, _ = run_gate([submitted("lhh42001", "APPROVED")],
                            heads=[HEAD, STALE])
        self.assertFalse(ok)

    def test_draft_denies_even_with_valid_current_approval(self):
        ok, msg, _ = run_gate([submitted("lhh42001", "APPROVED")], draft=True)
        self.assertFalse(ok)
        self.assertIn("only open ready PRs", msg)

    def test_stacked_pr_base_retargets_fail_closed(self):
        # A skipped required job can count as success. The job must instead
        # execute and explicitly deny a non-main branch even with peer approval.
        ok, msg, _ = run_gate([submitted("lhh42001", "APPROVED")], base="feature-stack")
        self.assertFalse(ok)
        self.assertIn("into main", msg)

    def test_dismissed_approval_is_not_accepted(self):
        reviews = [submitted("lhh42001", "APPROVED", number=1),
                   submitted("lhh42001", "DISMISSED", number=2)]
        ok, _, _ = run_gate(reviews)
        self.assertFalse(ok)

    def test_dismissed_change_request_no_longer_blocks_another_peer(self):
        reviews = [submitted("qamarrchae", "CHANGES_REQUESTED", number=1),
                   submitted("qamarrchae", "DISMISSED", number=2),
                   submitted("lhh42001", "APPROVED", number=3)]
        ok, msg, _ = run_gate(reviews)
        self.assertTrue(ok, msg)

    def test_comment_never_clears_existing_change_request(self):
        reviews = [submitted("qamarrchae", "CHANGES_REQUESTED", number=1),
                   submitted("qamarrchae", "COMMENTED", number=2),
                   submitted("lhh42001", "APPROVED", number=3)]
        ok, _, _ = run_gate(reviews)
        self.assertFalse(ok)

    def test_bot_never_counts_as_independent_collaborator(self):
        ok, _, _ = run_gate([submitted("dependabot[bot]", "APPROVED")],
                            {"dependabot[bot]": "write"})
        self.assertFalse(ok)

    def test_permission_403_fails_closed(self):
        with self.assertRaises(HTTPError) as captured:
            run_gate([submitted("lhh42001", "APPROVED")],
                     {"lhh42001": "HTTP_403"})
        self.assertEqual(captured.exception.code, 403)

    def test_manual_only_has_no_pull_request_triggers(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        trigger = text.split("\npermissions:", 1)[0]
        self.assertIn("workflow_dispatch:", trigger)
        self.assertIn("pr_number:", trigger)
        self.assertNotIn("pull_request:", trigger)
        self.assertNotIn("pull_request_review:", trigger)
        self.assertIn("NUMBER: ${{ inputs.pr_number }}", text)

    def test_optional_manual_audit_does_not_checkout_student_data(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertNotIn("pull_request_target:", text)
        self.assertNotIn("actions/checkout@", text)
        self.assertIn("/collaborators/", text)
        self.assertIn("contents: read", text)
        self.assertIn("pull-requests: read", text)
        self.assertIn("only open ready PRs into main", embedded_script())


if __name__ == "__main__":
    unittest.main()
