#requires -Version 5.1
<#
 One-command orchestration for an ALREADY BOOTSTRAPPED, APPROVED NCP Ubuntu host.
 Only: package allowlisted synthetic Git HEAD -> WinSCP SFTP -> localhost preview deploy over SSH.
 No VM/API creation, credentials, student data, production, DNS, 443 or paid AI.
 Defaults to plan-only. -Apply is required to transfer/run on the host.
 Prerequisites: Prepare-NcpPreview.ps1, WinSCP.com, plink.exe, verified host-key fingerprint,
 hufs-admin SSH public-key access (agent/Pageant for passphrase), Ubuntu bootstrap.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ServerIPv4,
  [Parameter(Mandatory=$true)][string]$PrivateKeyPath,
  [Parameter(Mandatory=$true)][string]$HostKeyFingerprint,
  [string]$Ref = 'HEAD',
  [string]$WinSCPExe = '',
  [string]$PlinkExe = '',
  [switch]$Apply
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Do not pass arbitrary hostnames, SSH URI, command fragments or remote shell input.
if ($ServerIPv4 -notmatch '^([0-9]{1,3}\.){3}[0-9]{1,3}$') {
  throw 'ServerIPv4 must be the NCP host literal IPv4 address, not a hostname or command.'
}
$address = [System.Net.IPAddress]::Parse($ServerIPv4)
if ($address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
    [System.Net.IPAddress]::IsLoopback($address) -or
    $address.Equals([System.Net.IPAddress]::Any)) {
  throw 'Supply the approved NCP server IPv4 address.'
}
if ($HostKeyFingerprint -notmatch '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) [0-9]{3,4} SHA256:[A-Za-z0-9+/=]{20,}$') {
  throw 'Supply the independently verified SSH host-key fingerprint, e.g. ssh-ed25519 256 SHA256:...'
}
if ($Ref -notmatch '^(HEAD|[A-Za-z0-9_./-]+)$' -or $Ref.Contains('..')) {
  throw 'Unsafe git ref. Prepare-NcpPreview.ps1 also checks the commit.'
}
$key = [System.IO.Path]::GetFullPath($PrivateKeyPath)
if (-not (Test-Path -LiteralPath $key -PathType Leaf) -or
    -not $key.EndsWith('.ppk', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Supply the LOCAL PuTTY SSH .ppk private-key FILE (never copy it onto NCP or GitHub).'
}
# A local private-key path is passed directly to WinSCP/plink; never print the key or passphrase.
if ($key -match '["\r\n]') { throw 'Invalid key path.' }

function Find-Exe([string]$Explicit, [string]$Name, [string[]]$Locations) {
  if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
    if (-not (Test-Path -LiteralPath $Explicit -PathType Leaf)) { throw "Executable not found: $Name" }
    return [System.IO.Path]::GetFullPath($Explicit)
  }
  $found = Get-Command -Name $Name -ErrorAction SilentlyContinue
  if ($null -ne $found) { return $found.Source }
  foreach ($location in $Locations) {
    if ($location -and (Test-Path -LiteralPath $location -PathType Leaf)) { return $location }
  }
  throw "Install $Name or pass its -WinSCPExe/-PlinkExe absolute path."
}
$winscp = Find-Exe $WinSCPExe 'WinSCP.com' @(
  (Join-Path $env:ProgramFiles 'WinSCP\WinSCP.com'),
  (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'WinSCP\WinSCP.com')
)
$plink = Find-Exe $PlinkExe 'plink.exe' @(
  (Join-Path $env:ProgramFiles 'PuTTY\plink.exe'),
  (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'PuTTY\plink.exe')
)
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$zip = Join-Path $repo 'local_only\ncp-preview.zip'
Write-Host "Mode: SYNTHETIC-only SSH loopback preview (NOT production)"
Write-Host "Destination server: $ServerIPv4 / user=hufs-admin / TCP 22"
Write-Host "Ref: $Ref; verified host-key fingerprint required; no secrets stored."
if (-not $Apply) {
  Write-Host 'PLAN ONLY. No packaging, transfer, remote command or billable resource action executed.'
  Write-Host 'After owner approval, NCP manual server+ACG setup and Ubuntu bootstrap, rerun with -Apply.'
  exit 0
}
# Only run against a manually provisioned authorized host. No cloud API, no daemon, no retries.
Write-Host 'Preparing a committed, fixed allowlist archive (no student originals or private repo clone).'
& (Join-Path $PSScriptRoot 'Prepare-NcpPreview.ps1') -Ref $Ref
if ($LASTEXITCODE -ne 0) { throw 'Preview source packager failed.' }
if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { throw 'Expected ZIP missing after packaging.' }
$sha = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sha -notmatch '^[a-f0-9]{64}$') { throw 'Invalid ZIP digest.' }

# Both host key pinning and SSH private key are explicit. No passwords on command line.
# Pageant can hold the passphrase-protected .ppk key for both tools.
$open = 'open sftp://hufs-admin@' + $ServerIPv4 + '/ -hostkey="' +
  $HostKeyFingerprint + '" -privatekey="' + $key + '"'
$put = 'put "' + $zip + '" /home/hufs-admin/ncp-preview.zip'
Write-Host 'Uploading one allowlisted ZIP via WinSCP SFTP (host key is pinned).'
& $winscp /ini=nul /command $open $put 'exit'
if ($LASTEXITCODE -ne 0) { throw 'WinSCP SFTP upload failed; remote deploy was not attempted.' }

Write-Host 'Invoking limited sudo hufs-preview-deploy through pinned-host-key SSH.'
& $plink -batch -ssh -P 22 -l hufs-admin -i $key -hostkey $HostKeyFingerprint $ServerIPv4 "sudo /usr/local/sbin/hufs-preview-deploy $sha"
if ($LASTEXITCODE -ne 0) { throw 'Remote synthetic preview deployment failed. Check logs and rollback via hufs-admin.' }
Write-Host 'Remote synthetic preview deploy command completed.'
Write-Host 'Use PuTTY Local SSH tunnel Source=5174 Destination=127.0.0.1:5173, then http://127.0.0.1:5174'
Write-Host 'Do NOT expose 5173, 3000, 5432, 443 or enable real student data/AI.'
