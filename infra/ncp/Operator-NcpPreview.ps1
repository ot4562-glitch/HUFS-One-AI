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
if ($Operation -ne 'Rollback' -and ($Target -or $ExpectedCurrent)) {
  throw 'Only Rollback accepts Target and ExpectedCurrent.'
}
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
. (Join-Path $PSScriptRoot 'NcpPreview.Common.ps1')
Assert-NcpPublicIPv4 $ServerIPv4
$pins = Convert-NcpHostKeyPin $HostKeyFingerprint
$key = Resolve-NcpLocalFile $PrivateKeyPath '.ppk'
if ($Operation -eq 'Deploy') {
  $installer = Join-Path $PSScriptRoot 'Deploy-NcpPreview.ps1'
  if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'Reviewed deploy script missing.' }
  if ($Ref -notmatch '^(HEAD|[A-Za-z0-9_./-]+)$' -or $Ref.Contains('..')) {
    throw 'Unsafe source reference.'
  }
  $deployParameters = @{
    ServerIPv4 = $ServerIPv4
    PrivateKeyPath = $key
    HostKeyFingerprint = $HostKeyFingerprint
    Ref = $Ref
    Apply = $true
  }
  if ($WinSCPExe) { $deployParameters.WinSCPExe = $WinSCPExe }
  if ($PlinkExe) { $deployParameters.PlinkExe = $PlinkExe }
  & $installer @deployParameters
  if ($LASTEXITCODE -ne 0) { throw 'Pinned preview deploy did not complete.' }
  Write-Host 'Synthetic-only deploy command finished. Verify by pinned SSH loopback health.'
  exit 0
}
$plink = Find-NcpExecutable $PlinkExe 'plink.exe'
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
& $plink -batch -ssh -P 22 -l hufs-admin -i $key -hostkey $pins.Plink $ServerIPv4 $remote
if ($LASTEXITCODE -ne 0) { throw "Pinned synthetic preview $Operation failed. No success claimed." }
Write-Host "PASS: NCP synthetic preview $Operation command completed (loopback-only)."
