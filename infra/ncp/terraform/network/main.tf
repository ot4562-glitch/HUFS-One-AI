terraform {
  required_version = ">= 1.14.0, < 2.0.0"
  required_providers {
    ncloud = {
      source  = "NaverCloudPlatform/ncloud"
      version = "= 4.0.7"
    }
  }
}

provider "ncloud" {
  support_vpc = true
  region      = "KR"
}

variable "request" {
  type = object({
    scope                 = string, project = string, prefix = string, source_sha = string,
    preflight_plan_sha256 = string, zone = string, vpc_cidr = string,
    subnet_cidr           = string, admin_cidr = string, dns_cidr = string,
    server_ephemeral_min  = number, server_ephemeral_max = number,
    client_ephemeral_min  = number, client_ephemeral_max = number
  })
  validation {
    condition = try(
      var.request.scope == "NETWORK_ONLY_V1" && var.request.project == "hufs-one-ai" &&
      var.request.prefix == "hufs-preview" && contains(["KR-1", "KR-2"], var.request.zone) &&
      can(regex("^[a-f0-9]{40}$", var.request.source_sha)) && var.request.source_sha != "0000000000000000000000000000000000000000" &&
      can(regex("^[a-f0-9]{64}$", var.request.preflight_plan_sha256)) && var.request.preflight_plan_sha256 != "0000000000000000000000000000000000000000000000000000000000000000" &&
      alltrue([for n in [var.request.server_ephemeral_min, var.request.server_ephemeral_max, var.request.client_ephemeral_min, var.request.client_ephemeral_max] : n == floor(n) && n >= 32768 && n <= 65535]) &&
      var.request.server_ephemeral_min <= var.request.server_ephemeral_max &&
      var.request.client_ephemeral_min <= var.request.client_ephemeral_max &&
      split("/", var.request.admin_cidr)[1] == "32" && split("/", var.request.dns_cidr)[1] == "32" &&
      can(cidrnetmask(var.request.admin_cidr)) && can(cidrnetmask(var.request.dns_cidr)) &&
    var.request.dns_cidr != "0.0.0.0/32", false)
    error_message = "Use the fixed network-only project, non-placeholder source/plan hashes, IPv4 /32 endpoints and bounded high return ports."
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

locals {
  cidrs = merge({ vpc = var.request.vpc_cidr, subnet = var.request.subnet_cidr, admin = var.request.admin_cidr },
  { for i, cidr in ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/3"] : "deny-${i}" => cidr })
  bounds = { for name, cidr in local.cidrs : name => {
    first = try(sum([for i, octet in split(".", cidrhost(cidr, 0)) : tonumber(octet) * pow(256, 3 - i)]), -1)
    last  = try(sum([for i, octet in split(".", cidrhost(cidr, -1)) : tonumber(octet) * pow(256, 3 - i)]), -1)
  } }
  server_return = "${var.request.server_ephemeral_min}-${var.request.server_ephemeral_max}"
  client_return = "${var.request.client_ephemeral_min}-${var.request.client_ephemeral_max}"
}

# This reference is an operator assertion, not cryptographic proof of a human
# review. The wrapper never sets it; real account/credit/source approval is external.
resource "terraform_data" "operator_approval" {
  input = sha256(jsonencode(var.request))
  lifecycle {
    precondition {
      condition     = var.operator_approved && can(regex("^[A-Za-z0-9_-]{8,80}$", var.operator_approval_reference)) && var.approved_config_sha256 == sha256(jsonencode(var.request))
      error_message = "Explicit operator approval and the reviewed exact configuration digest are required."
    }
    precondition {
      condition = try(
        can(cidrnetmask(var.request.vpc_cidr)) && can(cidrnetmask(var.request.subnet_cidr)) &&
        can(regex("^(10\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.|192\\.168\\.)", var.request.vpc_cidr)) &&
        tonumber(split("/", var.request.vpc_cidr)[1]) >= 16 && tonumber(split("/", var.request.vpc_cidr)[1]) <= 28 &&
        tonumber(split("/", var.request.subnet_cidr)[1]) >= 24 && tonumber(split("/", var.request.subnet_cidr)[1]) <= 28 &&
        cidrhost(var.request.vpc_cidr, 0) == split("/", var.request.vpc_cidr)[0] &&
        cidrhost(var.request.subnet_cidr, 0) == split("/", var.request.subnet_cidr)[0] &&
      local.bounds.subnet.first >= local.bounds.vpc.first && local.bounds.subnet.last <= local.bounds.vpc.last, false)
      error_message = "Aligned private VPC /16../28 must contain the aligned public-profile subnet /24../28."
    }
    precondition {
      condition     = local.bounds.admin.first > 0 && alltrue([for name, range in local.bounds : local.bounds.admin.first < range.first || local.bounds.admin.first > range.last if startswith(name, "deny-")])
      error_message = "SSH requires a single public administrator IPv4 /32, excluding special-use networks."
    }
  }
}

resource "ncloud_vpc" "preview" {
  name            = "${var.request.prefix}-vpc"
  ipv4_cidr_block = var.request.vpc_cidr
  depends_on      = [terraform_data.operator_approval]
  lifecycle { prevent_destroy = true }
}
resource "ncloud_network_acl" "preview" {
  name   = "${var.request.prefix}-nacl"
  vpc_no = ncloud_vpc.preview.id
  lifecycle { prevent_destroy = true }
}
resource "ncloud_network_acl_rule" "preview" {
  network_acl_no = ncloud_network_acl.preview.id
  inbound {
    priority    = 10
    protocol    = "TCP"
    ip_block    = var.request.admin_cidr
    port_range  = "22"
    rule_action = "ALLOW"
  }
  # Stateless return traffic only; the stateful ACG still denies unsolicited high ports.
  inbound {
    priority    = 20
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = local.server_return
    rule_action = "ALLOW"
  }
  inbound {
    priority    = 30
    protocol    = "UDP"
    ip_block    = var.request.dns_cidr
    port_range  = local.server_return
    rule_action = "ALLOW"
  }
  inbound {
    priority    = 197
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    rule_action = "DROP"
  }
  inbound {
    priority    = 198
    protocol    = "UDP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    rule_action = "DROP"
  }
  inbound {
    priority    = 199
    protocol    = "ICMP"
    ip_block    = "0.0.0.0/0"
    rule_action = "DROP"
  }
  outbound {
    priority    = 10
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "443"
    rule_action = "ALLOW"
  }
  # Signed distro APT may use HTTP during initial bootstrap; this is not inbound publication.
  outbound {
    priority    = 20
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "80"
    rule_action = "ALLOW"
  }
  outbound {
    priority    = 30
    protocol    = "UDP"
    ip_block    = var.request.dns_cidr
    port_range  = "53"
    rule_action = "ALLOW"
  }
  outbound {
    priority    = 40
    protocol    = "TCP"
    ip_block    = var.request.dns_cidr
    port_range  = "53"
    rule_action = "ALLOW"
  }
  outbound {
    priority    = 50
    protocol    = "TCP"
    ip_block    = var.request.admin_cidr
    port_range  = local.client_return
    rule_action = "ALLOW"
  }
  outbound {
    priority    = 197
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    rule_action = "DROP"
  }
  outbound {
    priority    = 198
    protocol    = "UDP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    rule_action = "DROP"
  }
  outbound {
    priority    = 199
    protocol    = "ICMP"
    ip_block    = "0.0.0.0/0"
    rule_action = "DROP"
  }
  lifecycle { prevent_destroy = true }
}
resource "ncloud_subnet" "preview" {
  name           = "${var.request.prefix}-subnet"
  vpc_no         = ncloud_vpc.preview.id
  subnet         = var.request.subnet_cidr
  zone           = var.request.zone
  subnet_type    = "PUBLIC"
  network_acl_no = ncloud_network_acl.preview.id
  depends_on     = [ncloud_network_acl_rule.preview]
  lifecycle { prevent_destroy = true }
}
resource "ncloud_access_control_group" "preview" {
  name   = "${var.request.prefix}-acg"
  vpc_no = ncloud_vpc.preview.id
  lifecycle { prevent_destroy = true }
}
resource "ncloud_access_control_group_rule" "preview" {
  access_control_group_no = ncloud_access_control_group.preview.id
  inbound {
    protocol   = "TCP"
    ip_block   = var.request.admin_cidr
    port_range = "22"
  }
  outbound {
    protocol   = "TCP"
    ip_block   = "0.0.0.0/0"
    port_range = "443"
  }
  outbound {
    protocol   = "TCP"
    ip_block   = "0.0.0.0/0"
    port_range = "80"
  }
  outbound {
    protocol   = "TCP"
    ip_block   = var.request.dns_cidr
    port_range = "53"
  }
  outbound {
    protocol   = "UDP"
    ip_block   = var.request.dns_cidr
    port_range = "53"
  }
  lifecycle { prevent_destroy = true }
}

output "review_config_sha256" { value = sha256(jsonencode(var.request)) }
output "network_contract" {
  value = {
    mode           = "SSH_SYNTHETIC_PREVIEW_ONLY", vpc_no = ncloud_vpc.preview.id,
    subnet_no      = ncloud_subnet.preview.id, access_control_group_no = ncloud_access_control_group.preview.id,
    network_acl_no = ncloud_network_acl.preview.id, source_sha = var.request.source_sha,
    config_sha256  = sha256(jsonencode(var.request))
  }
  depends_on = [ncloud_access_control_group_rule.preview, ncloud_network_acl_rule.preview]
}
