#Requires -RunAsAdministrator
<#
.SYNOPSIS
    VIPO Vision — One-Click Installer
.DESCRIPTION
    Downloads VIPO Vision from GitHub, installs dependencies, builds the
    frontend, and registers it as a Windows service that starts automatically.
.USAGE
    Run in an elevated PowerShell:
      irm https://raw.githubusercontent.com/vipogroup/vipo-vision-/main/install.ps1 | iex
    Or locally:
      powershell -ExecutionPolicy Bypass -File install.ps1
#>

$ErrorActionPreference = "Stop"
$installDir = "C:\VIPO-Vision"
$repo = "https://github.com/vipogroup/vipo-vision-.git"
$serviceName = "VIPO Vision"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   VIPO Vision — Installer" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Prerequisites check ──────────────────────────────────────
Write-Host "[1/7] Checking prerequisites..." -ForegroundColor Yellow

# Node.js
$nodeVersion = $null
try { $nodeVersion = (node -v 2>$null) } catch {}
if (-not $nodeVersion) {
    Write-Host "  ERROR: Node.js is not installed." -ForegroundColor Red
    Write-Host "  Download from: https://nodejs.org/" -ForegroundColor Red
    exit 1
}
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

# Git
$gitVersion = $null
try { $gitVersion = (git --version 2>$null) } catch {}
if (-not $gitVersion) {
    Write-Host "  ERROR: Git is not installed." -ForegroundColor Red
    Write-Host "  Download from: https://git-scm.com/" -ForegroundColor Red
    exit 1
}
Write-Host "  Git: $gitVersion" -ForegroundColor Green

# FFmpeg
$ffmpegOk = $null
try { $ffmpegOk = (ffmpeg -version 2>$null | Select-Object -First 1) } catch {}
if (-not $ffmpegOk) {
    Write-Host "  WARNING: FFmpeg not found in PATH." -ForegroundColor Yellow
    Write-Host "  Install FFmpeg and add to PATH for streaming to work." -ForegroundColor Yellow
} else {
    Write-Host "  FFmpeg: OK" -ForegroundColor Green
}

# ── 2. Clone or update repository ───────────────────────────────
Write-Host ""
Write-Host "[2/7] Getting source code..." -ForegroundColor Yellow

if (Test-Path "$installDir\.git") {
    Write-Host "  Existing installation found, updating..." -ForegroundColor Cyan
    Push-Location $installDir
    git pull origin main 2>&1 | Out-Null
    Pop-Location
    Write-Host "  Updated from GitHub." -ForegroundColor Green
} else {
    if (Test-Path $installDir) {
        Remove-Item $installDir -Recurse -Force
    }
    Write-Host "  Cloning from $repo ..."
    git clone $repo $installDir 2>&1 | Out-Null
    Write-Host "  Cloned to $installDir" -ForegroundColor Green
}

# ── 3. Install root dependencies ────────────────────────────────
Write-Host ""
Write-Host "[3/7] Installing frontend dependencies..." -ForegroundColor Yellow
Push-Location $installDir
npm install --production=false 2>&1 | Out-Null
Write-Host "  Done." -ForegroundColor Green

# ── 4. Install server dependencies ──────────────────────────────
Write-Host ""
Write-Host "[4/7] Installing server dependencies..." -ForegroundColor Yellow
Push-Location "$installDir\server"
npm install 2>&1 | Out-Null
Pop-Location
Write-Host "  Done." -ForegroundColor Green

# ── 5. Build frontend ───────────────────────────────────────────
Write-Host ""
Write-Host "[5/7] Building frontend for production..." -ForegroundColor Yellow
Push-Location $installDir
npm run build 2>&1 | Out-Null
Pop-Location
Write-Host "  Done." -ForegroundColor Green

# ── 6. Install Windows Service ──────────────────────────────────
Write-Host ""
Write-Host "[6/7] Installing Windows service..." -ForegroundColor Yellow

# Stop existing service if running
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  Stopping existing service..."
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    # Remove old service
    Push-Location $installDir
    node install-service.js remove 2>&1 | Out-Null
    Start-Sleep -Seconds 3
    Pop-Location
}

Push-Location $installDir
node install-service.js 2>&1 | Out-Null
Pop-Location
Write-Host "  Service installed and started." -ForegroundColor Green

# ── 7. Create desktop shortcut ──────────────────────────────────
Write-Host ""
Write-Host "[7/7] Creating desktop shortcut..." -ForegroundColor Yellow
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\VIPO Vision.lnk")
$Shortcut.TargetPath = "$installDir\start-vipo.bat"
$Shortcut.WorkingDirectory = $installDir
$Shortcut.Description = "VIPO Vision - Camera Streaming Server"
$Shortcut.Save()
Write-Host "  Desktop shortcut created." -ForegroundColor Green

# ── Done ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   VIPO Vision installed successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Dashboard: http://localhost:5055" -ForegroundColor Cyan
Write-Host "  Service:   Running as '$serviceName'" -ForegroundColor Cyan
Write-Host "  Auto-start: Yes (starts with Windows)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  The service will also check for updates" -ForegroundColor Gray
Write-Host "  from GitHub automatically every hour." -ForegroundColor Gray
Write-Host ""

# Open browser
Start-Process "http://localhost:5055"
