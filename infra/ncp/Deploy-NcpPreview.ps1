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
  [string]$ServerIPv4 = '',
  [string]$PrivateKeyPath = '',
  [string]$HostKeyFingerprint = '',
  [string]$Ref = 'HEAD',
  [string]$WinSCPExe = '',
  [string]$PlinkExe = '',
  [switch]$Apply
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Plan-only MUST NOT require a server, host key, private key or installed SSH tools,
# and must not package files, call git, start a child process, or touch NCP.
if (-not $Apply) {
  Write-Host 'PLAN ONLY: synthetic SSH-loopback preview, never production.'
  Write-Host 'No resources, account, IP, SSH key, package, network or paid provider are touched.'
  Write-Host 'For -Apply, provide -ServerIPv4, -PrivateKeyPath (.ppk), -HostKeyFingerprint and verify NCP ACG /32.'
  Write-Host 'Read infra/ncp/README.md and obtain separate operator approval before applying.'
  exit 0
}
. (Join-Path $PSScriptRoot 'NcpPreview.Common.ps1')
Assert-NcpPublicIPv4 $ServerIPv4
$pins = Convert-NcpHostKeyPin $HostKeyFingerprint
if ($Ref -notmatch '^(HEAD|[A-Za-z0-9_./-]+)$' -or $Ref.Contains('..')) {
  throw 'Unsafe git ref. Prepare-NcpPreview.ps1 also checks the commit.'
}
$key = Resolve-NcpLocalFile $PrivateKeyPath '.ppk'
# A local private-key path is passed directly to WinSCP/plink; never print the key or passphrase.
$winscp = Find-NcpExecutable $WinSCPExe 'WinSCP.com' @(
  (Join-Path $env:ProgramFiles 'WinSCP\WinSCP.com'),
  (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'WinSCP\WinSCP.com')
)
$plink = Find-NcpExecutable $PlinkExe 'plink.exe' @(
  (Join-Path $env:ProgramFiles 'PuTTY\plink.exe'),
  (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'PuTTY\plink.exe')
)
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$zip = Join-Path $repo 'local_only\ncp-preview.zip'
if ($zip -match '["\r\n%]') { throw 'Repository path cannot contain WinSCP script expansion or quoting characters.' }
Write-Host "Mode: SYNTHETIC-only SSH loopback preview (NOT production)"
Write-Host "Destination server: $ServerIPv4 / user=hufs-admin / TCP 22"
Write-Host "Ref: $Ref; verified host-key fingerprint required; no secrets stored."
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
  $pins.WinSCP + '" -privatekey="' + $key + '"'
$put = 'put "' + $zip + '" /home/hufs-admin/ncp-preview.zip'
Write-Host 'Uploading one allowlisted ZIP via WinSCP SFTP (host key is pinned).'
# /script avoids Windows PowerShell 5.1's native /command nested-quote loss.
# The file contains paths and the public host pin, never a key or passphrase.
$scriptFile = [IO.Path]::GetTempFileName()
try {
  [IO.File]::WriteAllLines($scriptFile, @('option batch abort', 'option confirm off', $open, $put, 'exit'), (New-Object Text.UTF8Encoding($true)))
  & $winscp '/ini=nul' ('/script=' + $scriptFile)
  if ($LASTEXITCODE -ne 0) { throw 'WinSCP SFTP upload failed; remote deploy was not attempted.' }
}
finally {
  Remove-Item -LiteralPath $scriptFile -Force -ErrorAction Stop
}

Write-Host 'Invoking limited sudo hufs-preview-deploy through pinned-host-key SSH.'
& $plink -batch -ssh -P 22 -l hufs-admin -i $key -hostkey $pins.Plink $ServerIPv4 "sudo /usr/local/sbin/hufs-preview-deploy $sha"
if ($LASTEXITCODE -ne 0) { throw 'Remote synthetic preview deployment failed. Check logs and rollback via hufs-admin.' }
Write-Host 'Remote synthetic preview deploy command completed.'
Write-Host 'Use PuTTY Local SSH tunnel Source=5174 Destination=127.0.0.1:5173, then http://127.0.0.1:5174'
Write-Host 'Do NOT expose 5173, 3000, 5432, 443 or enable real student data/AI.'
