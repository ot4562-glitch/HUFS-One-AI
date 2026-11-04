#requires -Version 5.1
<#
 HUFS One AI - Windows 10/11 PowerShell safe-source exporter.
 Run on your own repo checkout: powershell -ExecutionPolicy Bypass -File .\infra\ncp\Prepare-NcpPreview.ps1
 This creates ONLY a synthetic-preview ZIP under ignored local_only/. Never upload the full Git repo.
#>
[CmdletBinding()]
param(
  [string]$Ref = 'HEAD',
  [string]$Output = ''
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $repo
try {
  if ([string]::IsNullOrWhiteSpace($Output)) {
    $Output = Join-Path $repo 'local_only\ncp-preview.zip'
  }
  elseif (-not [System.IO.Path]::IsPathRooted($Output)) {
    $Output = Join-Path $repo $Output
  }
  $Output = [System.IO.Path]::GetFullPath($Output)
  $privateArea = [System.IO.Path]::GetFullPath((Join-Path $repo 'local_only')) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $Output.StartsWith($privateArea, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Output must remain under ignored local_only/. Never put preview ZIP in tracked paths."
  }
  if (-not $Output.EndsWith('.zip', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Output file must end in .zip'
  }
  if ($Ref -notmatch '^(HEAD|[A-Za-z0-9_./-]+)$' -or $Ref.Contains('..')) {
    throw 'Unsafe Git ref syntax.'
  }
  $commit = (& git rev-parse --verify "$Ref^{commit}")
  if ($LASTEXITCODE -ne 0 -or -not $commit -or $commit -notmatch '^[a-f0-9]{40}$') {
    throw 'Ref must resolve to an existing committed source tree.'
  }

  # Fixed paths: the school/student originals (csv/, templates/, reference/, private/) are excluded.
  $filePaths = @(
    'package.json', 'package-lock.json', 'tsconfig.json',
    'packages/contracts/package.json', 'packages/contracts/tsconfig.build.json',
    'apps/web/index.html', 'apps/web/vite.config.ts',
    'infra/ncp/bootstrap-ubuntu.sh', 'infra/ncp/deploy-preview.sh',
    'infra/ncp/harden-ssh.sh', 'infra/ncp/hufs-preview.service'
  )
  $dirPaths = @(
    'apps/web/src', 'packages/contracts/src', 'packages/core/src',
    'packages/ui/src', 'packages/fixtures/synthetic'
  )
  # Preserve historical approved refs that predate the optional rollback helper.
  $rollbackPath = 'infra/ncp/rollback-preview.sh'
  $rollbackEntry = @(& git ls-tree --name-only $commit -- $rollbackPath)
  if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect reviewed rollback helper.' }
  if ($rollbackEntry -contains $rollbackPath) { $filePaths += $rollbackPath }
  $allPaths = @($filePaths + $dirPaths)
  $entries = @(& git ls-tree -r --full-tree $commit -- $allPaths)
  if ($LASTEXITCODE -ne 0 -or $entries.Count -lt 20) {
    throw 'Unable to enumerate enough allowlisted Git source files.'
  }
  foreach ($entry in $entries) {
    $parts = $entry.Split([char]9, 2)
    if ($parts.Count -ne 2) { throw 'Invalid git ls-tree entry.' }
    $metadata = $parts[0]
    $name = $parts[1]
    if ($metadata -match '^120000 ') { throw "Symlink forbidden: $name" }
    if (($filePaths -notcontains $name) -and
      -not (@($dirPaths | Where-Object { $name.StartsWith($_ + '/', [System.StringComparison]::Ordinal) }).Count -gt 0)) {
      throw "Path not in allowlist: $name"
    }
    if ($name -match '(^|/)\.env|(^|/)(csv|private|secrets|local_only)/|(\.csv|\.pem|\.ppk|\.key|\.db|\.p12|\.pfx)$') {
      throw "Sensitive file path detected: $name"
    }
  }
  $targetDir = Split-Path -Parent $Output
  New-Item -Path $targetDir -ItemType Directory -Force | Out-Null
  $temp = "$Output.partial"
  if (Test-Path $temp) { throw "Existing partial archive: $temp" }
  try {
    & git archive --format=zip "--output=$temp" $commit $allPaths
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $temp)) { throw 'git archive failed.' }
    Move-Item -LiteralPath $temp -Destination $Output -Force
  }
  finally { if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Force } }

  $sha = (Get-FileHash -Path $Output -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$Output.sha256.txt" -Value "$sha  ncp-preview.zip" -Encoding Ascii
  Write-Host "SAFE SYNTHETIC ZIP: $Output"
  Write-Host "COMMIT: $commit"
  Write-Host "SHA256: $sha"
  Write-Host 'Transfer this ZIP only using WinSCP/SFTP to /home/hufs-admin/ncp-preview.zip.'
  Write-Host 'On server run: sudo /usr/local/sbin/hufs-preview-deploy <SHA256>'
  Write-Host 'This package has NO real student data, credentials, production API, or paid provider.'
}
finally { Pop-Location }
