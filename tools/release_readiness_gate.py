"""Report actual release evidence separately from completed project authorization.

The owner confirms the permissions described by this repository are approved.
That authorization is not a fabricated live test result. This read-only reporter
has no credentials, deployment side effects or live validators; the configured
production launcher independently checks its real runtime dependencies.
"""
from __future__ import annotations

import json
import sys
from typing import Mapping

PROJECT_AUTHORIZATION = "OWNER_CONFIRMED_APPROVED"
STATUSES = frozenset({"PASS", "FAIL", "NOT_RUN", "BLOCKED"})
OFFLINE = (
    "offline_anonymous_fastify",
    "offline_session_cookie_csrf",
    "offline_compiled_publication",
    "compiled_browser_cache_and_loopback_preview",
    "offline_server_sourcemap_packaging",
    "offline_git_index_privacy",
    "disposable_postgres",
)
# Stable report identifiers, not a renewed request for owner permission.
# These entries measure deployed behavior / receipt availability, which cannot
# be established by this offline process or by inventing a passing status.
EXTERNAL_UNVERIFIED = (
    "actual_domain_dns_tls_hsts",
    "direct_ip_proxy_cdn_preview_storage_acls",
    "google_oidc_and_hufs_mail_smtp",
    "real_browser_tabs_logout_and_service_worker",
    "production_postgres_ncp_port_firewall",
    "individual_data_consent_and_publication_history",
    "independent_current_head_release_approval",
)


def evaluate_release(offline: Mapping[str, str] | None = None) -> dict:
    """Approval is recorded; successful execution must still have evidence."""
    offline = offline or {}
    statuses = []
    invalid = any(name not in OFFLINE for name in offline)
    for name in OFFLINE:
        value = offline.get(name, "NOT_RUN")
        if value not in STATUSES:
            value = "FAIL"
            invalid = True
        statuses.append({"name": name, "status": value})
    statuses.extend({"name": name, "status": "NOT_RUN"}
                    for name in EXTERNAL_UNVERIFIED)
    offline_failure = invalid or any(gate["status"] in ("FAIL", "BLOCKED")
                                     for gate in statuses[:len(OFFLINE)])
    offline_missing = any(gate["status"] == "NOT_RUN"
                          for gate in statuses[:len(OFFLINE)])
    if offline_failure:
        blocker = "BLOCKED_SECURITY"
    elif offline_missing:
        blocker = "BLOCKED_OFFLINE_EVIDENCE"
    else:
        blocker = "BLOCKED_EXTERNAL"
    return {
        "authorization": PROJECT_AUTHORIZATION,
        "execution": "LIVE_VERIFICATION_REQUIRED",
        # This is a readiness report, not a switch consulted by the runtime.
        "release": "BLOCKED",
        "status": "BLOCKED",
        "blocker": blocker,
        "gates": statuses,
        "reason_codes": (
            (["OFFLINE_GATE_FAILED"] if offline_failure else [])
            + (["OFFLINE_GATE_NOT_RUN"] if offline_missing else [])
            + ["LIVE_EXECUTION_NOT_VERIFIED"]
        ),
        "evidence": "Project authorization is owner-confirmed; this offline reporter cannot verify deployed execution",
    }


if __name__ == "__main__":
    if len(sys.argv) != 1:
        print(json.dumps({"release": "BLOCKED", "error": "NO_RUNTIME_OVERRIDE"}))
        sys.exit(2)
    print(json.dumps(evaluate_release(), ensure_ascii=True, separators=(",", ":")))
    sys.exit(2)
