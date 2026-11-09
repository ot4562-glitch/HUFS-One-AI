"""#126: fail-closed static contract for the opt-in, synthetic Chrome E2E job.

The executable local-account browser suite ships with this branch. This tests CI
configuration, not a GitHub-run browser result. It never checks out private data.
"""
import re
import unittest
from pathlib import Path

WORKFLOW=Path(__file__).resolve().parents[2]/".github/workflows/ui-browser-e2e.yml"
CHECKOUT="actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"
SETUP="actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"
UPLOAD="actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9"  # v7.0.2 independently verified tag
ALLOWED={
    "/package.json","/package-lock.json","/tsconfig.json",
    "/packages/contracts/","/packages/ai/src/","/packages/fixtures/synthetic/","/packages/core/","/packages/ui/","/apps/api/","/apps/web/",
    "/.github/workflows/ui-browser-e2e.yml",
    "/tools/check_local_account_browser.mjs","/tools/strip_build_sourcemaps.mjs",
    "/tools/check_empty_demo_browser.mjs","/tools/generate_demo_assets.mjs",
    "/tools/check_synthetic_artwork.mjs",
}
PROTECTED=("csv","local_only","templates/real5-intake","reference/hufsability/raw",
    "reference/hufsability")


def audit(text: str)->list[str]:
    issues=[]
    lines=text.splitlines()
    if "  pull_request:" not in lines or "  push:" not in lines or "    branches: [main]" not in lines:
        issues.append("unfiltered PR and main-push triggers required")
    else:
        start=lines.index("  pull_request:")
        for line in lines[start+1:]:
            if line.strip() and len(line)-len(line.lstrip())<=2:break
            if line.strip() and not line.lstrip().startswith("#"):
                issues.append("PR event must have no branch/path filters")
                break
    if "pull_request_target" in text or "workflow_dispatch:" in text:
        issues.append("no privileged/manual injection event")
    if "permissions:\n  contents: read\n\njobs:" not in text or "secrets." in text or "id-token: write" in text:
        issues.append("read-only permissions and no secrets")
    if "runs-on: ubuntu-24.04" not in text or "ubuntu-latest" in text:
        issues.append("fixed 24.04 host (latest is transitioning to 26.04)")
    uses=re.findall(r"(?m)^\s*(?:-\s*)?uses:\s*(\S+)",text)
    if sorted(uses)!=sorted([CHECKOUT,SETUP,UPLOAD]):
        issues.append("only pinned checkout, setup-node and synthetic screenshot upload actions")
    # Approve one exact PNG-only artifact step. Do not allow broader directories,
    # multiple paths, extra inputs, expressions or hidden-file uploads merely
    # because a safe-looking path also occurs somewhere in the workflow.
    upload_steps=[]
    for i,line in enumerate(lines):
        match=re.match(r"^\s*(?:-\s*)?uses:\s*(\S+)",line)
        if not match or match.group(1)!=UPLOAD:continue
        start=i
        while start>0 and not lines[start].startswith("      - "):start-=1
        end=i+1
        while end<len(lines):
            row=lines[end]
            if row.strip() and not row.lstrip().startswith("#") and len(row)-len(row.lstrip())<=6:break
            end+=1
        if not lines[start].startswith("      - name: "):
            issues.append("screenshot upload must be an explicit named step")
        upload_steps.append([row.split(" #",1)[0].rstrip() for row in lines[start+1:end]
                             if row.strip() and not row.lstrip().startswith("#")])
    expected_upload=[
        "        if: always()",
        "        uses: "+UPLOAD,
        "        with:",
        "          name: synthetic-viewport-screenshots",
        "          path: dist/playwright-results/**/*.png",
        "          if-no-files-found: ignore",
        "          retention-days: 7",
    ]
    if upload_steps!=[expected_upload]:
        issues.append("only one fixed PNG screenshot artifact with seven-day retention is allowed")
    if "persist-credentials: false" not in text or "sparse-checkout-cone-mode: false" not in text:
        issues.append("checkout must be sparse and credential-free")
    sparse=[]
    for i,line in enumerate(lines):
        if line.strip()=="sparse-checkout: |":
            indent=len(line)-len(line.lstrip())
            for row in lines[i+1:]:
                if not row.strip():continue
                if len(row)-len(row.lstrip())<=indent:break
                sparse.append(row.strip())
    if len(sparse)!=len(ALLOWED) or set(sparse)!=ALLOWED:
        issues.append("unexpected sparse checkout path: must be exact synthetic allowlist")
    for name in PROTECTED:
        if f"test ! -d {name}" not in text:
            issues.append("missing private directory absence gate")
    if "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'" not in text:
        issues.append("must disable Playwright browser download")
    if "PW_CHANNEL: chrome" not in text or "command -v google-chrome" not in text:
        issues.append("must use runner-installed Chrome")
    if "test -f tools/check_local_account_browser.mjs" not in text:
        issues.append("must fail if executable browser checks are not present")
    if "node-version: '24.15.0'" not in text:
        issues.append("must satisfy locked jsdom and Vite runtime requirements")
    if "test:e2e:web" not in text or "npm run test:e2e:web -- --reporter=list" not in text:
        issues.append("must run traceable browser E2E list reporter")
    if "npm run test:e2e:accounts" not in text:
        issues.append("must run account-switch and revoked-session browser E2E")
    if "npm run test:e2e:empty-demo" not in text or "npm run assets:check" not in text:
        issues.append("must run independent EMPTY_DEMO and original asset validation")
    if "npm ci --ignore-scripts --no-audit --no-fund" not in text:
        issues.append("must use pinned lockfile without install hooks")
    if "playwright install" in text or "npx playwright install" in text:
        issues.append("no browser installers")
    if "NO_PROXY: 127.0.0.1,localhost" not in text:
        issues.append("loopback bypass is mandatory")
    return issues


class BrowserE2EWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow=WORKFLOW.read_text(encoding="utf-8")

    def test_current_workflow_rejects_private_sources_and_browser_download(self):
        self.assertEqual(audit(self.workflow),[])

    def test_provider_runtime_imports_are_present_without_private_checkout(self):
        self.assertIn("/packages/ai/src/", ALLOWED)
        self.assertIn("            /packages/ai/src/", self.workflow.splitlines())
        self.assertNotIn("            /packages/ai/", self.workflow.splitlines())

    def test_unreviewed_paths_fail(self):
        self.assertTrue(audit(self.workflow.replace("            /apps/web/\n",
            "            /apps/web/\n            /csv/\n",1)))

    def test_artwork_validator_does_not_allow_the_whole_tools_directory(self):
        self.assertIn("/tools/check_synthetic_artwork.mjs",ALLOWED)
        self.assertNotIn("/tools/",ALLOWED)
        self.assertTrue(audit(self.workflow.replace("            /tools/check_synthetic_artwork.mjs\n",
            "            /tools/\n",1)))

    def test_screenshot_upload_rejects_unsafe_paths_actions_and_inputs(self):
        for original,replacement in (
            (UPLOAD,"actions/upload-artifact@v4"),
            (UPLOAD,"unreviewed/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9"),
            (UPLOAD,"actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"),
            ("path: dist/playwright-results/**/*.png","path: ."),
            ("path: dist/playwright-results/**/*.png","path: csv/**"),
            ("path: dist/playwright-results/**/*.png","path: dist/**"),
            ("path: dist/playwright-results/**/*.png","path: dist/playwright-results/**"),
            ("path: dist/playwright-results/**/*.png","path: |\n            dist/playwright-results/**/*.png\n            csv/**"),
            ("name: synthetic-viewport-screenshots","name: source-dump"),
            ("retention-days: 7","retention-days: 90"),
            ("retention-days: 7","retention-days: 7\n          include-hidden-files: true"),
            ("retention-days: 7","retention-days: 7\n          github-token: ${{ secrets.GITHUB_TOKEN }}"),
        ):
            with self.subTest(replacement=replacement):
                self.assertIn(original,self.workflow)
                self.assertTrue(audit(self.workflow.replace(original,replacement,1)))

    def test_second_upload_step_cannot_add_an_unreviewed_artifact(self):
        unsafe=self.workflow+"\n      - name: Export files\n        uses: "+UPLOAD+"\n        with:\n          path: .\n"
        self.assertTrue(audit(unsafe))

    def test_privileged_triggers_and_mutable_actions_fail(self):
        for change in (
            self.workflow.replace("  pull_request:", "  pull_request_target:",1),
            self.workflow.replace(CHECKOUT,"actions/checkout@v4",1),
            self.workflow.replace("  contents: read","  contents: write",1),
            self.workflow.replace("  pull_request:", "  pull_request:\n    branches: [main]",1),
        ):
            self.assertTrue(audit(change))

    def test_browser_download_and_unverified_browser_fail(self):
        for change in (
            self.workflow.replace("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'",
              "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '0'",1),
            self.workflow.replace("PW_CHANNEL: chrome","PW_CHANNEL: msedge",1),
            self.workflow.replace("    runs-on: ubuntu-24.04","    runs-on: ubuntu-latest",1),
            self.workflow.replace("npm run test:e2e:web -- --reporter=list","echo no-tests",1),
            self.workflow.replace("npm run test:e2e:accounts","echo skipped",1),
            self.workflow.replace("npm run test:e2e:empty-demo","echo skipped",1),
            self.workflow.replace("npm run assets:check","echo skipped",1),
            self.workflow.replace("test ! -d local_only","echo unsafe",1),
        ):
            self.assertTrue(audit(change))


if __name__=="__main__":
    unittest.main()
