#requires -Version 5.1
# Pure validation shared by the Windows preview entrypoints. No network or files
# are changed here; callers load this only after their side-effect-free Plan exit.

function Assert-NcpPublicIPv4([string]$Value) {
  if ($Value -cnotmatch '\A(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}\z') {
    throw 'Supply a canonical public IPv4 literal, not a hostname or command.'
  }
  try { $ip = [System.Net.IPAddress]::Parse($Value) }
  catch { throw 'Invalid NCP public IPv4 address.' }
  $octets = $ip.GetAddressBytes()
  if ($ip.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
      $octets[0] -eq 0 -or $octets[0] -ge 224 -or
      $octets[0] -eq 10 -or $octets[0] -eq 127 -or
      ($octets[0] -eq 100 -and $octets[1] -ge 64 -and $octets[1] -le 127) -or
      ($octets[0] -eq 169 -and $octets[1] -eq 254) -or
      ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or
      ($octets[0] -eq 192 -and $octets[1] -eq 0 -and $octets[2] -eq 0 -and $octets[3] -notin @(9, 10)) -or
      ($octets[0] -eq 192 -and $octets[1] -eq 0 -and $octets[2] -eq 2) -or
      ($octets[0] -eq 192 -and $octets[1] -eq 168) -or
      ($octets[0] -eq 198 -and $octets[1] -in @(18, 19)) -or
      ($octets[0] -eq 198 -and $octets[1] -eq 51 -and $octets[2] -eq 100) -or
      ($octets[0] -eq 203 -and $octets[1] -eq 0 -and $octets[2] -eq 113)) {
    throw 'Private, reserved, multicast and documentation IPv4 addresses are not public SSH hosts.'
  }
}

function Convert-NcpHostKeyPin([string]$Value) {
  # The SHA256 digest is the identity. WinSCP uses padded base64 without the
  # SHA256: prefix; plink accepts SHA256: plus the same unpadded 43 characters.
  $match = [regex]::Match($Value, '\A(?<algorithm>ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) (?<bits>[0-9]{3,4}) SHA256:(?<digest>[A-Za-z0-9+/]{43})=?\z')
  if (-not $match.Success) { throw 'Supply the independently verified algorithm, key size and complete SHA256 host-key fingerprint.' }
  $algorithm = $match.Groups['algorithm'].Value
  $bits = [int]$match.Groups['bits'].Value
  if (($algorithm -eq 'ssh-ed25519' -and $bits -notin @(255, 256)) -or
      ($algorithm -eq 'ecdsa-sha2-nistp256' -and $bits -ne 256) -or
      ($algorithm -eq 'ssh-rsa' -and $bits -lt 1024)) {
    throw 'Host-key algorithm and key size do not match.'
  }
  $digest = $match.Groups['digest'].Value
  $decoded = [Convert]::FromBase64String($digest + '=')
  if ($decoded.Length -ne 32 -or
      -not [string]::Equals([Convert]::ToBase64String($decoded), $digest + '=', [StringComparison]::Ordinal)) {
    throw 'Host-key SHA256 digest is not canonical base64.'
  }
  # OpenSSH reports Ed25519 as 256 bits; PuTTY/WinSCP display 255.
  if ($algorithm -eq 'ssh-ed25519') { $bits = 255 }
  return [pscustomobject]@{
    Plink = 'SHA256:' + $digest
    WinSCP = $algorithm + ' ' + $bits + ' ' + $digest + '='
  }
}

function Resolve-NcpLocalFile([string]$Value, [string]$Extension, [switch]$Absolute) {
  # WinSCP script files expand %NAME% even inside quotes. Reject expansion and
  # line/quote injection; never reinterpret a checked path during invocation.
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match '["\r\n%]') {
    throw 'Supply a literal local file path without quotes, line breaks or environment expansions.'
  }
  if ($Absolute -and $Value -cnotmatch '\A[A-Za-z]:[\\/]') {
    throw 'Explicit executable paths must be fully qualified local drive paths.'
  }
  $resolved = Resolve-Path -LiteralPath $Value -ErrorAction Stop
  if ($resolved.Provider.Name -ne 'FileSystem') { throw 'Only local filesystem paths are accepted.' }
  $canonical = $resolved.ProviderPath
  if ($canonical -cnotmatch '\A[A-Za-z]:[\\/]' -or $canonical -match '["\r\n%]' -or
      -not $canonical.EndsWith($Extension, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Invalid local file type or path.'
  }
  $item = Get-Item -LiteralPath $canonical -Force -ErrorAction Stop
  if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'A regular local file is required, not a directory or symbolic link.'
  }
  return $canonical
}

function Find-NcpExecutable([string]$Explicit, [string]$Name, [string[]]$Locations = @()) {
  $extension = [IO.Path]::GetExtension($Name)
  if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
    return Resolve-NcpLocalFile $Explicit $extension -Absolute
  }
  $found = Get-Command -Name $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $found) { return Resolve-NcpLocalFile $found.Source $extension -Absolute }
  foreach ($location in $Locations) {
    if ($location -and (Test-Path -LiteralPath $location -PathType Leaf)) {
      return Resolve-NcpLocalFile $location $extension -Absolute
    }
  }
  throw "Install $Name or supply its absolute local executable path."
}
