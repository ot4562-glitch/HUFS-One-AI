"""Manual release decision for an infrastructure that has NOT been approved.

This gate deliberately has no credentials and no live validators. Neither a
successful synthetic PR CI nor an environment flag is a release attestation.
A future independently reviewed change must add REAL external probes/approved
evidence before a release can ever be marked ready.
"""
from __future__ import annotations

import json
import sys
from typing import Mapping

STATUSES = frozenset({"PASS", "FAIL", "NOT_RUN", "BLOCKED"})
OFFLINE = (
    "offline_anonymous_fastify",
    "offline_session_cookie_csrf",
    "offline_compiled_publication",
    "disposable_postgres",
)
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
    """Offline PASS is evidence of tests only, never of real authorization."""
    offline = offline or {}
    statuses = []
    invalid = False
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
    return {
        "release": "BLOCKED",
        "status": "BLOCKED",
        "blocker": "BLOCKED_SECURITY" if offline_failure else "BLOCKED_EXTERNAL",
        "gates": statuses,
        "reason_codes": (
            ["OFFLINE_GATE_FAILED"] if offline_failure else []
        ) + ["NO_EXTERNAL_VALIDATOR_OR_OPERATIONAL_APPROVAL"],
        "evidence": "No validated live ingress, provider, user consent or human release receipt",
    }


if __name__ == "__main__":
    if len(sys.argv) != 1:
        print(json.dumps({"release": "BLOCKED", "error": "NO_RUNTIME_OVERRIDE"}))
        sys.exit(2)
    print(json.dumps(evaluate_release(), ensure_ascii=True, separators=(",", ":")))
    sys.exit(2)
