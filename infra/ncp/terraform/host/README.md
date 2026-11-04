# NCP approved SSH-only host provisioning (phase 02)

**Status: PR implementation / NCP resource API NOT_RUN / RELEASE_BLOCKED.**

This module follows #211 network Terraform; it does not replace the network
state and must never use the default VPC/ACG. It creates **one** approved
NIC, termination-protected Ubuntu server and billable Public IP. No NCP init
script, public HTTP/443, private repo clone, student originals, paid AI or
application process is started. Physical installation and SSH hardening are
subsequent steps; **terraform apply is not performed by CI or this PR**.

Operator workflow:

1. In the approved NCP account, obtain real SKU/Ubuntu amd64 image IDs and
   current KR zone support, credit/quotas/prices and an existing login-key name.
2. Review the separately applied #211 network state and its
   `network_contract` output. Independently check subnet, NIC/ACG, admin
   public IPv4/32, network ACL, Internet Gateway, routing and the exact
   source/head commit. Do not copy IDs from synthetic tests.
3. In a *protected, ignored* local JSON file under `local_only/`, provide
   `network` (mode/source_sha/config_sha256/subnet_no/ACG_no) and `server`
   (image/SKU/login-key/estimated hourly KRW/approved budget/hours).
4. Use `node infra/ncp/setup/02-host-plan.mjs` for a read-only preview, and
   `--vars` to obtain a separate JSON tfvars file under `local_only/`.
   The generator **always** outputs `operator_approved=false`.
5. Only after human spending/resource approval, reconcile the request hash,
   approval reference and real NCP console values. Set the exact
   `approved_config_sha256` and `operator_approved=true` **in the private
   input**, never in GitHub Actions or committed fixtures.
6. Run separately approved `terraform init/plan -var-file=<private-file>`,
   review changes and real hourly cost, then explicitly approve a manual
   `terraform apply` only if the operator has authorization. The module
   defaults to fail-closed; this PR does not issue that authorization.
7. Check real NIC/ACG rules and console server state before initial SSH key
   handoff. The NCP server login-key is **not** the PuTTY admin SSH key.
   Do not publish root login passwords, .pem, .ppk or state.
8. Use the separately reviewed Ubuntu bootstrap script and require a second
   independent hufs-admin key-login before SSH hardening. Preview deploy and
   restore are tracked in #197/#209. Keep external port 3000/5173/5432
   closed and all applications loopback-only.

The module has `prevent_destroy` and NCP server termination protection. This
does **not** prevent out-of-band console changes or guarantee billing ceilings;
teardown requires a separate, authorized and audited plan. SHA/approval
variables alone do not prove a person reviewed the operation.

CI offline check uses Terraform 1.17.1 with the pinned provider lock and
`mock_provider "ncloud"` only. It may run Terraform in-memory mock apply but
never NCP API apply, destroy, billing or host installation.

Official provider source references:
- https://github.com/NaverCloudPlatform/terraform-provider-ncloud/blob/v4.0.7/docs/resources/server.md
- https://github.com/NaverCloudPlatform/terraform-provider-ncloud/blob/v4.0.7/docs/resources/network_interface.md
- https://github.com/NaverCloudPlatform/terraform-provider-ncloud/blob/v4.0.7/docs/resources/public_ip.md
