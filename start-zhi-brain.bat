@echo off
setlocal
title ZHI Brain Bridge
echo ==========================================
echo ZHI Windows Local Brain Bridge
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS is required.
  pause
  exit /b 1
)
echo Starting Ollama...
start "Ollama" cmd /c "ollama serve"
timeout /t 2 /nobreak >nul
echo Starting ZHI Brain Bridge...
node "%~dp0zhi-ollama-bridge.js"
pause
