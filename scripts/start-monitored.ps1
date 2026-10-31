param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$TunnelExecutable = "$env:USERPROFILE\scoop\apps\cloudflared\current\cloudflared.exe"
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$managedDir = Join-Path $ProjectRoot '.data\managed'
New-Item -ItemType Directory -Force -Path $managedDir | Out-Null
$statePath = Join-Path $managedDir 'state.json'
$runDir = Join-Path $managedDir (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $runDir | Out-Null
$runtime = [ordered]@{
  status = 'building'; supervisorPid = $PID; serverPid = $null; tunnelPid = $null
  url = $null; projectRoot = $ProjectRoot; runDir = $runDir
  serverLog = (Join-Path $runDir 'server.log'); serverErrorLog = (Join-Path $runDir 'server-error.log')
  tunnelLog = (Join-Path $runDir 'tunnel.log'); tunnelErrorLog = (Join-Path $runDir 'tunnel-error.log')
  buildLog = (Join-Path $runDir 'build.log'); healthLog = (Join-Path $runDir 'health.log')
  checkedAt = [DateTime]::UtcNow.ToString('o'); localHealthy = $false; publicHealthy = $false; error = $null
}
function Save-GlintState {
  $runtime.checkedAt = [DateTime]::UtcNow.ToString('o')
  $runtime | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding utf8
}
function Test-GlintUrl([string]$Address) {
  try { return (Invoke-WebRequest -Uri $Address -UseBasicParsing -TimeoutSec 8).StatusCode -eq 200 }
  catch { return $false }
}
try {
  if (Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 3100 is already in use. No existing process was stopped.'
  }
  if (!(Test-Path -LiteralPath $TunnelExecutable)) { throw 'cloudflared executable was not found.' }
  Save-GlintState
  Set-Location -LiteralPath $ProjectRoot
  $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
  # Windows PowerShell wraps native stderr (including successful Vite
  # warnings) as error records. Decide build success from its exit code.
  $ErrorActionPreference = 'Continue'
  & $npmPath run build *> $runtime.buildLog
  $buildExit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($buildExit -ne 0) { throw 'Glint build failed; inspect build.log.' }
  $runtime.status = 'starting-tunnel'; Save-GlintState
  $tunnel = Start-Process -FilePath $TunnelExecutable -ArgumentList @('tunnel','--url','http://127.0.0.1:3100') -WindowStyle Hidden -PassThru -WorkingDirectory $ProjectRoot -RedirectStandardOutput $runtime.tunnelLog -RedirectStandardError $runtime.tunnelErrorLog
  $runtime.tunnelPid = $tunnel.Id; Save-GlintState
  $deadline = (Get-Date).AddSeconds(55)
  do {
    if ($tunnel.HasExited) { throw 'Cloudflare tunnel exited during startup.' }
    $tunnelText = ((Get-Content -LiteralPath $runtime.tunnelLog -Raw -ErrorAction SilentlyContinue) + (Get-Content -LiteralPath $runtime.tunnelErrorLog -Raw -ErrorAction SilentlyContinue))
    $match = [regex]::Match($tunnelText,'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($match.Success) { $runtime.url = $match.Value; break }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  if (!$runtime.url) { throw 'Cloudflare did not provide a tunnel URL within 55 seconds.' }
  $env:APP_ORIGIN = $runtime.url
  $env:PORT = '3100'
  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
  $server = Start-Process -FilePath $nodePath -ArgumentList @('--import','tsx','server/index.ts','--production') -WindowStyle Hidden -PassThru -WorkingDirectory $ProjectRoot -RedirectStandardOutput $runtime.serverLog -RedirectStandardError $runtime.serverErrorLog
  $runtime.serverPid = $server.Id; $runtime.status = 'starting-server'; Save-GlintState
  $lastHealth = ''
  while ($true) {
    $server.Refresh(); $tunnel.Refresh()
    if ($server.HasExited -or $tunnel.HasExited) {
      $runtime.status = 'failed'; $runtime.error = 'The server or tunnel process exited.'
      Save-GlintState; break
    }
    # Static GET only: no sessions created, no provider dispatches, no media.
    $runtime.localHealthy = Test-GlintUrl 'http://127.0.0.1:3100/'
    $runtime.publicHealthy = if ($runtime.localHealthy) { Test-GlintUrl $runtime.url } else { $false }
    $runtime.status = if ($runtime.localHealthy -and $runtime.publicHealthy) { 'running' } else { 'degraded' }
    $health = "$($runtime.status) local=$($runtime.localHealthy) public=$($runtime.publicHealthy)"
    if ($health -ne $lastHealth) {
      Add-Content -LiteralPath $runtime.healthLog -Value "$([DateTime]::UtcNow.ToString('o')) $health"
      $lastHealth = $health
    }
    Save-GlintState
    if (Test-Path -LiteralPath (Join-Path $managedDir 'stop-requested')) {
      # Stop only the exact process objects created by this supervisor.
      $server.Refresh(); $tunnel.Refresh()
      if (!$server.HasExited) { $server.Kill() }
      if (!$tunnel.HasExited) { $tunnel.Kill() }
      $runtime.status = 'stopped'; Save-GlintState; break
    }
    Start-Sleep -Seconds 10
  }
} catch {
  $runtime.status = 'failed'; $runtime.error = $_.Exception.Message; Save-GlintState
}
