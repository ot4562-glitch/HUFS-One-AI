# All runs use mocked NCP resources only; no actual NCP API or billing.
mock_provider "ncloud" {
  override_during = plan
}

variables {
  request                     = jsondecode(file("tests/synthetic-request.json"))
  operator_approval_reference = "SYNTHETIC-HOST-REVIEW"
}

run "default_approval_disabled" {
  command         = plan
  expect_failures = [terraform_data.operator_approval]
}

run "host_nic_and_public_ip_are_pinned_to_approved_input" {
  command = apply
  variables {
    operator_approved      = true
    approved_config_sha256 = sha256(jsonencode(var.request))
  }
  assert {
    condition     = (ncloud_network_interface.preview.subnet_no == var.request.subnet_no && length(ncloud_network_interface.preview.access_control_groups) == 1 && contains(ncloud_network_interface.preview.access_control_groups, var.request.access_control_group_no) && ncloud_server.preview.subnet_no == var.request.subnet_no)
    error_message = "The server NIC and dedicated SSH-only ACG must use reviewed network IDs."
  }
  assert {
    condition     = (ncloud_server.preview.is_protect_server_termination && ncloud_public_ip.preview.server_instance_no == ncloud_server.preview.id)
    error_message = "One termination-protected server and its SSH public IP are required."
  }
  assert {
    condition     = output.operator_handoff.mode == "SSH_LOOPBACK_SYNTHETIC_ONLY"
    error_message = "No production or public application release contract may be advertised."
  }
}

run "approval_digest_cannot_be_reused_after_machine_change" {
  command = plan
  variables {
    operator_approved      = true
    request                = merge(var.request, { ubuntu_image_no = "25495368" })
    approved_config_sha256 = sha256(jsonencode(var.request))
  }
  expect_failures = [terraform_data.operator_approval]
}

run "missing_approval_reference_denied" {
  command = plan
  variables {
    operator_approved           = true
    operator_approval_reference = ""
    approved_config_sha256      = sha256(jsonencode(var.request))
  }
  expect_failures = [terraform_data.operator_approval]
}

run "nonexistent_or_unreviewed_image_denied" {
  command = plan
  variables {
    request = merge(var.request, { ubuntu_image_no = "bad-value" })
  }
  expect_failures = [var.request]
}

run "unbounded_cost_denied" {
  command = plan
  variables {
    request = merge(var.request, { approved_budget_krw = 10 })
  }
  expect_failures = [var.request]
}
