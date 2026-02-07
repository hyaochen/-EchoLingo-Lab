@echo off
setlocal

set "CFG=%USERPROFILE%\.cloudflared\echolingo-config.yml"

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo [ERROR] cloudflared is not installed or not in PATH.
  echo Install: winget install Cloudflare.cloudflared
  pause
  exit /b 1
)

if not exist "%CFG%" (
  echo [ERROR] Config file not found: %CFG%
  echo Please create it first.
  pause
  exit /b 1
)

echo Starting EchoLingo tunnel...
echo Config: %CFG%
cloudflared --config "%CFG%" tunnel run

set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Tunnel exited with code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
