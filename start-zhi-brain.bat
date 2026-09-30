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

echo Checking Ollama...
curl --max-time 3 -s http://127.0.0.1:11434/api/tags >nul 2>nul
if errorlevel 1 (
  echo Ollama is not responding. Starting Ollama...
  start "Ollama" cmd /c "ollama serve"
  timeout /t 3 /nobreak >nul
) else (
  echo Ollama is already running.
)

echo Starting ZHI Brain Bridge...
node "%~dp0zhi-ollama-bridge.js"
pause
