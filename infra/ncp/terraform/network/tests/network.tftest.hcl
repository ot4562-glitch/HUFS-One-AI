# Every run uses the mock provider. No NCP API or real resources are involved.
mock_provider "ncloud" {
  override_during = plan
}

variables {
  request                     = jsondecode(file("tests/synthetic-request.json"))
  operator_approval_reference = "SYNTHETIC-REVIEW-ONLY"
}

run "approval_defaults_off" {
  command         = plan
  expect_failures = [terraform_data.operator_approval]
}

run "only_ssh_ingress_and_custom_acl" {
  # Apply is in-memory through mock_provider only; no real NCP provider is used.
  command = apply
  variables {
    operator_approved      = true
    approved_config_sha256 = sha256(jsonencode(var.request))
  }
  assert {
    condition     = output.review_config_sha256 == "d48a85d97ca866aee7730e275ac5ecfa21f7a117923cb749063c828590cc7ca6"
    error_message = "Terraform and the offline JSON compiler must agree on the reviewed configuration digest."
  }
  assert {
    condition = length(ncloud_access_control_group_rule.preview.inbound) == 1 && alltrue([
      for rule in ncloud_access_control_group_rule.preview.inbound :
      rule.protocol == "TCP" && rule.port_range == "22" && rule.ip_block == "93.184.216.34/32"
    ])
    error_message = "No HTTP, HTTPS, application or database ingress may be opened."
  }
  assert {
    condition = (ncloud_subnet.preview.network_acl_no == ncloud_network_acl.preview.id &&
      ncloud_access_control_group.preview.vpc_no == ncloud_vpc.preview.id &&
    output.network_contract.access_control_group_no == ncloud_access_control_group.preview.id)
    error_message = "Subnet must use the dedicated ACL and output the dedicated ACG for the later NIC slice."
  }
  assert {
    condition = (length(ncloud_network_acl_rule.preview.inbound) == 6 &&
      length([for rule in ncloud_network_acl_rule.preview.inbound : rule if rule.rule_action == "DROP"]) == 3 &&
      alltrue([for rule in ncloud_network_acl_rule.preview.inbound :
        !contains(["80", "443", "3000", "5173", "5432", "6379", "9229"], rule.port_range)
    if rule.rule_action == "ALLOW"]))
    error_message = "Stateless return traffic must coexist with explicit terminal drops and no public service ports."
  }
}

run "digest_cannot_be_reused_after_request_change" {
  command = plan
  variables {
    operator_approved      = true
    request                = merge(var.request, { dns_cidr = "8.8.8.8/32" })
    approved_config_sha256 = "d48a85d97ca866aee7730e275ac5ecfa21f7a117923cb749063c828590cc7ca6"
  }
  expect_failures = [terraform_data.operator_approval]
}

run "approval_reference_required" {
  command = plan
  variables {
    operator_approved           = true
    operator_approval_reference = ""
    approved_config_sha256      = sha256(jsonencode(var.request))
  }
  expect_failures = [terraform_data.operator_approval]
}

run "broad_admin_cidr_rejected" {
  command = plan
  variables { request = merge(var.request, { admin_cidr = "0.0.0.0/0" }) }
  expect_failures = [var.request]
}

run "private_admin_ip_rejected" {
  command = plan
  variables {
    operator_approved      = true
    request                = merge(var.request, { admin_cidr = "10.0.0.1/32" })
    approved_config_sha256 = sha256(jsonencode(var.request))
  }
  expect_failures = [terraform_data.operator_approval]
}

run "unaligned_vpc_rejected" {
  command = plan
  variables {
    operator_approved      = true
    request                = merge(var.request, { vpc_cidr = "10.27.0.1/16" })
    approved_config_sha256 = sha256(jsonencode(var.request))
  }
  expect_failures = [terraform_data.operator_approval]
}

run "subnet_outside_vpc_rejected" {
  command = plan
  variables {
    operator_approved      = true
    request                = merge(var.request, { subnet_cidr = "10.28.0.0/24" })
    approved_config_sha256 = sha256(jsonencode(var.request))
  }
  expect_failures = [terraform_data.operator_approval]
}

run "low_return_ports_rejected" {
  command = plan
  variables { request = merge(var.request, { server_ephemeral_min = 5432 }) }
  expect_failures = [var.request]
}

run "placeholder_source_rejected" {
  command = plan
  variables { request = merge(var.request, { source_sha = "0000000000000000000000000000000000000000" }) }
  expect_failures = [var.request]
}
