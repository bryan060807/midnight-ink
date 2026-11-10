param(
  [Parameter(Mandatory)][string]$PackageRoot,
  [ValidateSet('Validate','Deploy','Rollback')][string]$Action = 'Validate',
  [switch]$ApproveProductionSwitch
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This script never starts a daemon and never uses start/delete/save/kill.
# Environment values stay in DPAPI storage or child-process memory, never output.
$root = (Resolve-Path -LiteralPath $PackageRoot).Path
$manifest = Get-Content -Raw -LiteralPath (Join-Path $root 'release-manifest.json') | ConvertFrom-Json -AsHashtable
if ($manifest.appName -ne 'midnight-ink' -or $manifest.appId -ne 30) { throw 'Unexpected release target.' }
if ($Action -ne 'Validate' -and !$ApproveProductionSwitch) { throw 'Explicit production switch approval is required.' }
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (!$admin) { throw 'Use Administrator PowerShell under the staging account.' }
$daemonFile = Join-Path $manifest.pm2Home 'pm2.pid'
$daemonNumber = [int]([IO.File]::ReadAllText($daemonFile).Trim())
$daemon = Get-Process -Id $daemonNumber -ErrorAction Stop
if ($daemon.ProcessName -ne 'node') { throw 'Existing PM2 daemon is not verified.' }

function Invoke-Pm2([string[]]$CliArguments) {
  $start = [Diagnostics.ProcessStartInfo]::new($manifest.nodeExe)
  $start.WorkingDirectory = $manifest.originalCwd
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.Environment['PM2_HOME'] = $manifest.pm2Home
  $start.ArgumentList.Add((Join-Path $manifest.originalCwd 'scripts/release-pm2-rpc.cjs'))
  $start.ArgumentList.Add($root)
  foreach ($argument in $CliArguments) { $start.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::Start($start)
  $output = $process.StandardOutput.ReadToEndAsync()
  $errors = $process.StandardError.ReadToEndAsync()
  if (!$process.WaitForExit(150000)) { $process.Kill(); throw 'Scoped PM2 client timed out; inspect before retrying.' }
  $null = $errors.GetAwaiter().GetResult()
  $text = $output.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) { throw 'Scoped PM2 command failed; raw output was withheld.' }
  return $text
}

function Get-Target {
  try { $apps = (Invoke-Pm2 @('inspect')) | ConvertFrom-Json -AsHashtable }
  catch { throw 'Cannot read existing PM2 state; no mutation is authorized by this failure.' }
  $targets = @($apps | Where-Object { $_['name'] -eq 'midnight-ink' })
  if ($targets.Count -ne 1 -or $targets[0]['pm_id'] -ne 30) { throw 'Expected unique PM2 app 30 was not found.' }
  return $targets[0]
}

$credential = Import-Clixml -LiteralPath (Join-Path $root 'runtime-environment.clixml')
try { $environment = $credential.GetNetworkCredential().Password | ConvertFrom-Json -AsHashtable }
catch { throw 'Protected runtime environment cannot be opened by this account.' }
$saved = @{}
try {
  foreach ($key in $environment.Keys) {
    $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, [string]$environment[$key], 'Process')
  }
$target = Get-Target
$cwd = $target.pm2_env.pm_cwd
$allowed = @($manifest.originalCwd, $manifest.releasePath, $manifest.rollbackPath)
if ($cwd -notin $allowed -or $target.pm2_env.pm_exec_path -ne (Join-Path $cwd 'scripts/server.mjs')) { throw 'PM2 entrypoint differs from the approved release paths.' }
foreach ($entry in $manifest.inventory) {
  $file = [IO.Path]::GetFullPath((Join-Path $root $entry.path))
  if (!$file.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Inventory path escapes release package.' }
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw 'Release or rollback inventory has changed.' }
}
foreach ($entry in $manifest.originalConfiguration) {
  if ((Get-FileHash -LiteralPath (Join-Path $manifest.originalCwd $entry.name) -Algorithm SHA256).Hash -ne $entry.sha256) { throw 'Protected production configuration changed; restage before switching.' }
}
foreach ($binary in @(@{path=$manifest.nodeExe;hash=$manifest.nodeHash},@{path=$manifest.pm2Cli;hash=$manifest.pm2CliHash})) {
  if ((Get-FileHash -LiteralPath $binary.path -Algorithm SHA256).Hash -ne $binary.hash) { throw 'Verified runtime executable changed.' }
}
if (!$target.environmentMatches) { throw 'Production environment drift detected; restage before switching.' }
if ($Action -eq 'Validate') {
  Write-Output 'Validated: app 30, existing daemon, release/rollback hashes and protected environment. No restart performed.'
  exit 0
}
if ($Action -eq 'Deploy' -and $cwd -ne $manifest.originalCwd) { throw 'Deploy expects the original production cwd; inspect before retrying.' }
if ($Action -eq 'Rollback' -and $cwd -ne $manifest.releasePath) { throw 'Rollback expects the staged release cwd; inspect before retrying.' }
$destination = if ($Action -eq 'Deploy') { $manifest.releasePath } else { $manifest.rollbackPath }
$null = Invoke-Pm2 @($Action.ToLowerInvariant(), '--approved')
$after = Get-Target
if ($after.pm2_env.pm_cwd -ne $destination -or $after.pm2_env.status -ne 'online') { throw 'Release switch did not reach the expected online cwd; follow rollback procedure.' }
Write-Output "Scoped $Action completed for app 30. Authenticated acceptance checks are still required."

} finally {
  foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
  $environment = $null
  $credential = $null
}
