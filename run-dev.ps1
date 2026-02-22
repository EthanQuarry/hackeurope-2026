# Windows equivalent of dev.sh
# Runs backend (:8000) and frontend (:3000) in the same terminal.
# Ctrl+C stops both.

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

# --- Install frontend deps if missing ---
if (-not (Test-Path "$Root\frontend\node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location "$Root\frontend"
    npm install
    Pop-Location
}

Write-Host "Starting backend on :8000..." -ForegroundColor Cyan
$env:PYTHONPATH = "$Root\backend"
$backend = Start-Process python -ArgumentList "run.py" `
    -WorkingDirectory "$Root\backend" `
    -PassThru -NoNewWindow

Write-Host "Starting frontend on :3000..." -ForegroundColor Cyan
$frontend = Start-Process cmd -ArgumentList "/c", "npx next dev --turbopack" `
    -WorkingDirectory "$Root\frontend" `
    -PassThru -NoNewWindow

Write-Host ""
Write-Host "Both services running. Press Ctrl+C to stop both." -ForegroundColor Green
Write-Host "  Frontend: http://localhost:3000"
Write-Host "  Backend:  http://localhost:8000"
Write-Host ""

try {
    # Wait for either process to exit
    while (-not $backend.HasExited -and -not $frontend.HasExited) {
        Start-Sleep -Seconds 1
    }
} finally {
    # Kill both on Ctrl+C or if one crashes (mirrors trap 'kill 0' in bash)
    Write-Host "`nShutting down..." -ForegroundColor Yellow
    if (-not $backend.HasExited)  { Stop-Process -Id $backend.Id  -Force -ErrorAction SilentlyContinue }
    if (-not $frontend.HasExited) { Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue }
    # Kill any child processes (uvicorn reloader spawns children)
    Get-Process | Where-Object {
        $_.ProcessName -in @("python", "node") -and $_.CPU -ne $null
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "Done." -ForegroundColor Green
}
