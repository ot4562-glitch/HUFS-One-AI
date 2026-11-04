#requires -Version 5.1
<#
 Review-gated Windows operator orchestration for existing, approved NCP host.
 Default Plan has no SSH, Git, package, cloud or local side effect.
 Deploy reuses Deploy-NcpPreview.ps1. Rollback reuses the reviewed
 root-owned /usr/local/sbin/hufs-preview-rollback from PR #209.
 NO production API, DNS, 443, student data or paid NCP provider activation.
#>
[CmdletBinding()]
param(
  [ValidateSet('Plan','Deploy','Rollback','Verify')]
  [string]$Operation = 'Plan',
  [string]$ServerIPv4 = '',
  [string]$PrivateKeyPath = '',
  [string]$HostKeyFingerprint = '',
  [string]$PlinkExe = '',
  [string]$WinSCPExe = '',
  [string]$Ref = 'HEAD',
  [string]$Target = '',
  [string]$ExpectedCurrent = '',
  [switch]$Apply,
  [switch]$OwnerApproved
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($Operation -eq 'Plan') {
  if ($Apply -or $OwnerApproved) { throw 'Plan cannot carry apply or owner approval flags.' }
  Write-Host 'PLAN ONLY: approved synthetic ZIP -> pinned SSH/SFTP -> localhost preview -> exact-SHA recovery.'
  Write-Host 'Deploy requires an already bootstrapped NCP Ubuntu host, /32 SSH, pinned host fingerprint and limited hufs-admin sudo.'
  Write-Host 'Rollback requires a separately reviewed target SHA256 and exact current SHA256, never an arbitrary path.'
  Write-Host 'No Git, SSH, file, host, cloud or paid provider operation was executed. RELEASE_BLOCKED.'
  exit 0
}
if (-not $Apply -or -not $OwnerApproved) {
  throw 'A separate owner-approved --Apply decision is required for ANY operator host contact.'
}
if ($ServerIPv4 -notmatch '^([0-9]{1,3}\.){3}[0-9]{1,3}$') {
  throw 'Only the reviewed NCP public IPv4 literal is accepted.'
}
try { $ip = [System.Net.IPAddress]::Parse($ServerIPv4) }
catch { throw 'Invalid NCP public IPv4 address.' }
if ($ip.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
    [System.Net.IPAddress]::IsLoopback($ip) -or
    $ip.Equals([System.Net.IPAddress]::Any)) {
  throw 'The NCP host must have a reviewed public IPv4 address.'
}
$octets = $ip.GetAddressBytes()
if ($octets[0] -le 1 -or $octets[0] -ge 224 -or
    $octets[0] -eq 10 -or $octets[0] -eq 127 -or
    ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or
    ($octets[0] -eq 192 -and $octets[1] -eq 168) -or
    ($octets[0] -eq 169 -and $octets[1] -eq 254) -or
    ($octets[0] -eq 100 -and $octets[1] -ge 64 -and $octets[1] -le 127) -or
    ($octets[0] -eq 192 -and $octets[1] -eq 0 -and $octets[2] -eq 2) -or
    ($octets[0] -eq 198 -and $octets[1] -eq 51 -and $octets[2] -eq 100) -or
    ($octets[0] -eq 203 -and $octets[1] -eq 0 -and $octets[2] -eq 113)) {
  throw 'Private, reserved and documentation IPv4 ranges cannot be a public NCP SSH host.'
}
if ($HostKeyFingerprint -notmatch '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) [0-9]{3,4} SHA256:[A-Za-z0-9+/=]{20,}$') {
  throw 'Supply independently verified exact SSH host-key fingerprint.'
}
if ([string]::IsNullOrWhiteSpace($PrivateKeyPath)) { throw 'Local PuTTY private key path required.' }
$key = [System.IO.Path]::GetFullPath($PrivateKeyPath)
if (-not $key.EndsWith('.ppk', [System.StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath $key -PathType Leaf) -or $key -match '["\r\n]') {
  throw 'Local .ppk private key is required. Never upload it or print it.'
}
if ($Operation -eq 'Deploy') {
  $installer = Join-Path $PSScriptRoot 'Deploy-NcpPreview.ps1'
  if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'Reviewed deploy script missing.' }
  if ($Ref -notmatch '^(HEAD|[A-Za-z0-9_./-]+)$' -or $Ref.Contains('..')) {
    throw 'Unsafe source reference.'
  }
  $args = @{
    ServerIPv4 = $ServerIPv4
    PrivateKeyPath = $key
    HostKeyFingerprint = $HostKeyFingerprint
    Ref = $Ref
    Apply = $true
  }
  if ($WinSCPExe) { $args.WinSCPExe = $WinSCPExe }
  if ($PlinkExe) { $args.PlinkExe = $PlinkExe }
  & $installer @args
  if ($LASTEXITCODE -ne 0) { throw 'Pinned preview deploy did not complete.' }
  Write-Host 'Synthetic-only deploy command finished. Verify by pinned SSH loopback health.'
  exit 0
}
if ($PlinkExe) {
  if (-not (Test-Path -LiteralPath $PlinkExe -PathType Leaf) -or
      -not $PlinkExe.EndsWith('.exe', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Absolute existing plink.exe path required.'
  }
  $plink = [System.IO.Path]::GetFullPath($PlinkExe)
} else {
  $command = Get-Command -Name 'plink.exe' -ErrorAction SilentlyContinue
  if ($null -eq $command) { throw 'plink.exe not installed; supply -PlinkExe.' }
  $plink = $command.Source
}
if ($Operation -eq 'Rollback') {
  if ($Target -notmatch '^[a-f0-9]{64}$' -or
      $ExpectedCurrent -notmatch '^[a-f0-9]{64}$' -or
      $Target -eq $ExpectedCurrent) {
    throw 'Existing target and expected current SHA256 must be distinct exact hex digests.'
  }
  $remote = 'sudo /usr/local/sbin/hufs-preview-rollback --target ' + $Target +
    ' --expected-current ' + $ExpectedCurrent + ' --apply --ack-owner-approved'
} else {
  if ($Target -or $ExpectedCurrent) { throw 'Verify must not accept rollback targets.' }
  # Only fixed, localhost-only health checks; never use browser-provided commands.
  $remote = 'curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:5173/ >/dev/null && curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:5173/src/main.tsx >/dev/null'
}
Write-Host "Approved NCP synthetic preview $Operation via exact pinned SSH host fingerprint."
& $plink -batch -ssh -P 22 -l hufs-admin -i $key -hostkey $HostKeyFingerprint $ServerIPv4 $remote
if ($LASTEXITCODE -ne 0) { throw "Pinned synthetic preview $Operation failed. No success claimed." }
Write-Host "PASS: NCP synthetic preview $Operation command completed (loopback-only)."
