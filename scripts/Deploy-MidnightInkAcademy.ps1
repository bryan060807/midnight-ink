param([switch]$ApproveProductionSwitch)
$ErrorActionPreference = 'Stop'
if (-not $ApproveProductionSwitch) { throw 'Pass -ApproveProductionSwitch for the production restart.' }

$repo = 'C:\Users\bryan\aibry\projects\midnight-ink'
$source = 'C:\Users\bryan\aibry\releases\midnight-ink\d7c8b8d-stage\.next'
$releaseRoot = 'C:\Users\bryan\aibry\releases\midnight-ink'
$oldBuild = 'or_zxZCot5CNy8_MwT0Zj'
$newBuild = 'x8V01e-IRV1k-prgW5MQC'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $releaseRoot ('academy-' + $stamp + '-rollback')
$failed = Join-Path $releaseRoot ('academy-' + $stamp + '-failed')
$hostAddress = '192.168.1.82'
$port = 3031
$restartAttempted = $false

function Assert-Pm2Success([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw ($step + ' failed.') }
}
function ManagedPid {
    $value = @(pm2 pid midnight-ink | Where-Object { $_ -match '^\s*\d+\s*$' })
    Assert-Pm2Success 'PM2 PID lookup'
    if ($value.Count -ne 1) { throw 'PM2 returned an ambiguous PID.' }
    return [int]$value[0].Trim()
}
function Listeners {
    return @(Get-NetTCPConnection -State Listen -LocalPort 3031 -ErrorAction SilentlyContinue)
}
function Assert-Listener([int]$id) {
    $all = @(Listeners)
    if ($all.Count -ne 1 -or $all[0].OwningProcess -ne $id -or $all[0].LocalAddress -ne '192.168.1.82') {
        throw 'Listener ownership/address mismatch; no unsafe switch is allowed.'
    }
}
function Wait-Quiet([int]$prior) {
    for ($i=0; $i -lt 45; $i++) {
        if (-not (Get-Process -Id $prior -ErrorAction SilentlyContinue) -and
            @(Listeners).Count -eq 0 -and (ManagedPid) -eq 0) { return }
        Start-Sleep -Seconds 1
    }
    throw 'Old process or port is not quiesced. Do not start a second server.'
}
function Wait-Ready {
    for ($i=0; $i -lt 45; $i++) {
        $id = ManagedPid
        if ($id -gt 0) {
            $all = @(Listeners)
            if ($all.Count -gt 0 -and ($all.Count -ne 1 -or $all[0].OwningProcess -ne $id)) {
                throw 'Port owned by unexpected PID during startup.'
            }
            if ($all.Count -eq 1 -and $all[0].OwningProcess -eq $id -and $all[0].LocalAddress -eq '192.168.1.82') {
                try {
                    $health = Invoke-RestMethod -Uri 'http://192.168.1.82:3031/api/health' -Headers @{Host='midnight-ink.aibrylabs.com'} -TimeoutSec 8
                    if ($health.status -eq 'ok' -and $health.database -eq 'postgresql' -and $health.schema -eq 'current') {
                        Start-Sleep -Seconds 3
                        if ((ManagedPid) -eq $id) {
                            Assert-Listener $id
                            return $id
                        }
                    }
                } catch { }
            }
        }
        Start-Sleep -Seconds 2
    }
    throw 'Readiness probe timed out.'
}

Set-Location -LiteralPath $repo
if ((Get-Content '.next\BUILD_ID' -Raw).Trim() -ne $newBuild) { throw 'Candidate BUILD_ID mismatch.' }
if ((Get-Content (Join-Path $source 'BUILD_ID') -Raw).Trim() -ne $oldBuild) { throw 'Rollback BUILD_ID mismatch.' }
if ((Test-Path $rollback) -or (Test-Path $failed)) { throw 'Release destination collision.' }
$originalPid = ManagedPid
if ($originalPid -le 0) { throw 'Midnight Ink is not currently managed by PM2.' }
Assert-Listener $originalPid
$process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $originalPid)
if (-not $process -or $process.ExecutablePath -ne 'C:\Program Files\nodejs\node.exe' -or
    -not $process.CommandLine -or $process.CommandLine -notmatch 'midnight-ink\\scripts\\server\.mjs') {
    throw 'PM2 process executable or entrypoint could not be verified.'
}
Write-Host ('Verified managed PID ' + $originalPid + ' owns port 3031.')
Write-Host 'Preserving the previous known-good .next build before the restart...'
Copy-Item -LiteralPath $source -Destination $rollback -Recurse -Force
if ((Get-Content (Join-Path $rollback 'BUILD_ID') -Raw).Trim() -ne $oldBuild) {
    throw 'Rollback copy verification failed. Production was not touched.'
}
Write-Host ('Rollback copy: ' + $rollback)
try {
    pm2 stop midnight-ink | Out-Null
    Assert-Pm2Success 'PM2 app-specific stop'
    Wait-Quiet $originalPid
    $restartAttempted = $true
    pm2 restart midnight-ink | Out-Null
    Assert-Pm2Success 'PM2 app-specific restart'
    $newPid = Wait-Ready
    Write-Host ('ACADEMY DEPLOYED: build ' + $newBuild + ', PID ' + $newPid) -ForegroundColor Green
    Write-Host ('Known-good rollback: ' + $rollback)
} catch {
    $cause = $_.Exception.Message
    Write-Warning ('Academy release did not verify: ' + $cause)
    if ($restartAttempted) {
        $candidatePid = ManagedPid
        if ($candidatePid -gt 0) {
            Assert-Listener $candidatePid
            pm2 stop midnight-ink | Out-Null
            Assert-Pm2Success 'Stop before rollback'
            Wait-Quiet $candidatePid
        } elseif (@(Listeners).Count -ne 0) {
            throw 'An unknown listener remains; rollback halted for manual process inspection.'
        }
    } elseif (@(Listeners).Count -ne 0 -or (Get-Process -Id $originalPid -ErrorAction SilentlyContinue) -or (ManagedPid) -ne 0) {
        throw 'Application is not fully stopped; rollback halted for manual process inspection.'
    }
    if ((Get-Content '.next\BUILD_ID' -Raw).Trim() -ne $newBuild) {
        throw 'Candidate build changed; rollback halted for inspection.'
    }
    Move-Item -LiteralPath (Join-Path $repo '.next') -Destination $failed
    Move-Item -LiteralPath $rollback -Destination (Join-Path $repo '.next')
    pm2 restart midnight-ink | Out-Null
    Assert-Pm2Success 'Restart known-good build'
    $restoredPid = Wait-Ready
    Write-Warning ('ACADEMY NOT DEPLOYED. Known-good build restored with PID ' + $restoredPid)
    Write-Host ('Failed candidate saved: ' + $failed)
    throw ('Academy switch failed but was rolled back: ' + $cause)
}
