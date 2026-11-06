#requires -Version 5.1
<# Real WinSCP SessionOptions validation. No Session.Open, sockets, credentials,
   executable launch or host-key discovery. The caller pins the NuGet package. #>
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$AssemblyPath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../infra/ncp/NcpPreview.Common.ps1')
Add-Type -Path $AssemblyPath

$digest = [Convert]::ToBase64String([byte[]](0..31)).TrimEnd('=')
$inputs = @(
  ('ssh-ed25519 255 SHA256:' + $digest),
  ('ssh-ed25519 256 SHA256:' + $digest + '='),
  ('ssh-rsa 2048 SHA256:' + $digest),
  ('ecdsa-sha2-nistp256 256 SHA256:' + $digest)
)
foreach ($inputPin in $inputs) {
  $pins = Convert-NcpHostKeyPin $inputPin
  $options = New-Object WinSCP.SessionOptions
  $options.SshHostKeyFingerprint = $pins.WinSCP
  if ($options.SshHostKeyFingerprint -cne $pins.WinSCP -or
      $options.SshHostKeyPolicy -ne [WinSCP.SshHostKeyPolicy]::Check) {
    throw 'WinSCP did not preserve the exact pinned fingerprint and Check policy.'
  }
  $rejected = $false
  try { $options.SshHostKeyFingerprint = $inputPin }
  catch { $rejected = $true }
  if (-not $rejected) { throw 'The original PuTTY-format regression no longer reproduces; review this compatibility test.' }
}
Write-Host ('PASS: real WinSCP fingerprint parser accepted 4 converted pins and rejected 4 original PuTTY-format pins. Assembly=' + [WinSCP.SessionOptions].Assembly.GetName().Version)
Write-Host 'Scope: local format parser only. No SSH/SFTP handshake, remote upload, host credentials or NCP operation.'
