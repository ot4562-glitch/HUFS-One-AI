terraform {
  required_version = ">= 1.14.0, < 2.0.0"
  required_providers {
    ncloud = {
      source  = "NaverCloudPlatform/ncloud"
      version = "= 4.0.7"
    }
  }
}

# Credentials are supplied only by the approved operator's environment.
provider "ncloud" {
  support_vpc = true
  region      = "KR"
}

# This is a distinct phase after the approved network module: the NCP console
# operator must independently reconcile its exact IDs and checksum.
variable "request" {
  type = object({
    scope                   = string
    project                 = string
    source_sha              = string
    network_config_sha256   = string
    subnet_no               = string
    access_control_group_no = string
    ubuntu_image_no         = string
    server_spec_code        = string
    login_key_name          = string
    estimated_hourly_krw    = number
    approved_budget_krw     = number
    approved_hours          = number
  })
  validation {
    condition = try(
      var.request.scope == "SSH_PREVIEW_HOST_ONLY_V1" &&
      var.request.project == "hufs-one-ai" &&
      can(regex("^[a-f0-9]{40}$", var.request.source_sha)) &&
      var.request.source_sha != "0000000000000000000000000000000000000000" &&
      can(regex("^[a-f0-9]{64}$", var.request.network_config_sha256)) &&
      can(regex("^[0-9]{4,20}$", var.request.subnet_no)) &&
      can(regex("^[0-9]{4,20}$", var.request.access_control_group_no)) &&
      can(regex("^[0-9]{4,20}$", var.request.ubuntu_image_no)) &&
      can(regex("^[a-zA-Z0-9._-]{3,40}$", var.request.server_spec_code)) &&
      can(regex("^[a-zA-Z0-9._-]{3,40}$", var.request.login_key_name)) &&
      var.request.estimated_hourly_krw > 0 &&
      var.request.approved_hours >= 1 && var.request.approved_hours <= 744 &&
      var.request.approved_budget_krw >= var.request.estimated_hourly_krw * var.request.approved_hours &&
      var.request.approved_budget_krw <= 10000000, false
    )
    error_message = "Supply verified approved network IDs, Ubuntu image, server SKU, existing login key and bounded budget/hours."
  }
}
variable "operator_approved" {
  type    = bool
  default = false
}
variable "operator_approval_reference" {
  type    = string
  default = ""
}
variable "approved_config_sha256" {
  type    = string
  default = ""
}

resource "terraform_data" "operator_approval" {
  input = sha256(jsonencode(var.request))
  lifecycle {
    precondition {
      condition     = (var.operator_approved && can(regex("^[A-Za-z0-9_-]{8,80}$", var.operator_approval_reference)) && var.approved_config_sha256 == sha256(jsonencode(var.request)))
      error_message = "Human-approved exact host request digest is required. This variable is not itself proof of review."
    }
  }
}

# The NIC must use the independently reviewed dedicated SSH-only ACG.
resource "ncloud_network_interface" "preview" {
  name                  = "hufs-preview-operator-nic"
  subnet_no             = var.request.subnet_no
  access_control_groups = [var.request.access_control_group_no]
  depends_on            = [terraform_data.operator_approval]
  lifecycle {
    prevent_destroy = true
  }
}

resource "ncloud_server" "preview" {
  name                          = "hufs-preview-operator"
  subnet_no                     = var.request.subnet_no
  server_image_number           = var.request.ubuntu_image_no
  server_spec_code              = var.request.server_spec_code
  login_key_name                = var.request.login_key_name
  is_protect_server_termination = true
  network_interface {
    network_interface_no = ncloud_network_interface.preview.id
    order                = 0
  }
  depends_on = [terraform_data.operator_approval]
  lifecycle {
    prevent_destroy = true
  }
}

# Public IP is needed for restricted /32 SSH only; NEVER open HTTP/API ports.
resource "ncloud_public_ip" "preview" {
  server_instance_no = ncloud_server.preview.id
  description        = "Owner-approved SSH-only HUFS synthetic preview"
  lifecycle {
    prevent_destroy = true
  }
}

output "review_config_sha256" {
  value = sha256(jsonencode(var.request))
}
output "operator_handoff" {
  value = {
    mode           = "SSH_LOOPBACK_SYNTHETIC_ONLY"
    server_id      = ncloud_server.preview.id
    network_nic_id = ncloud_network_interface.preview.id
    public_ip      = ncloud_public_ip.preview.public_ip
    source_sha     = var.request.source_sha
    config_sha256  = sha256(jsonencode(var.request))
    release        = "RELEASE_BLOCKED"
  }
}
