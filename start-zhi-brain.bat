@echo off
setlocal EnableExtensions EnableDelayedExpansion
title ZHI Brain Bridge

echo ==========================================
echo ZHI Windows Local Brain Bridge
echo ==========================================
echo.

set "BRIDGE_URL=http://127.0.0.1:11435"
set "OLLAMA_URL=http://127.0.0.1:11434"
set "BRIDGE_HEALTH=%BRIDGE_URL%/health"
set "BRIDGE_READY=%BRIDGE_URL%/ready"
set "OLLAMA_TAGS=%OLLAMA_URL%/api/tags"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js LTS is required.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)

where curl >nul 2>nul
if errorlevel 1 (
  echo [ERROR] curl is required.
  pause
  exit /b 1
)

echo [1/3] Checking Ollama...
curl --max-time 3 -s "%OLLAMA_TAGS%" >nul 2>nul
if errorlevel 1 (
  echo Ollama is not responding. Starting Ollama...
  start "Ollama" cmd /c "ollama serve"
  echo Waiting for Ollama...
  set /a OLLAMA_TRIES=0
  :WAIT_OLLAMA
  timeout /t 1 /nobreak >nul
  set /a OLLAMA_TRIES+=1
  curl --max-time 2 -s "%OLLAMA_TAGS%" >nul 2>nul
  if not errorlevel 1 goto OLLAMA_READY
  if !OLLAMA_TRIES! GEQ 15 (
    echo [ERROR] Ollama did not become ready within 15 seconds.
    pause
    exit /b 1
  )
  goto WAIT_OLLAMA
) else (
  echo Ollama is already running.
)

:OLLAMA_READY
echo Ollama: OK
echo.

echo [2/3] Checking ZHI Brain Bridge...
curl --max-time 3 -s "%BRIDGE_READY%" >nul 2>nul
if not errorlevel 1 (
  echo ZHI Brain Bridge and model are already READY.
  echo No second instance will be started.
  echo.
  curl --max-time 3 -s "%BRIDGE_READY%"
  echo.
  echo [3/3] Ollama - llama3.1:8b - Brain Bridge - READY.
  pause
  exit /b 0
)

curl --max-time 3 -s "%BRIDGE_HEALTH%" >nul 2>nul
if not errorlevel 1 echo Bridge is running but model is not READY. Reusing existing Bridge.

echo Starting ZHI Brain Bridge...
start "ZHI Brain Bridge" cmd /c "node ""%~dp0zhi-ollama-bridge.js"""
echo Waiting for Bridge...
set /a BRIDGE_TRIES=0

:WAIT_BRIDGE
timeout /t 1 /nobreak >nul
set /a BRIDGE_TRIES+=1
curl --max-time 2 -s "%BRIDGE_READY%" >nul 2>nul
if not errorlevel 1 goto BRIDGE_READY
if !BRIDGE_TRIES! GEQ 10 (
  echo [ERROR] ZHI Brain Bridge did not become ready within 10 seconds.
  echo Check the ZHI Brain Bridge window for the error.
  pause
  exit /b 1
)
goto WAIT_BRIDGE

:BRIDGE_READY
echo.
echo [3/3] ZHI Brain Bridge is READY.
echo.
curl --max-time 3 -s "%BRIDGE_HEALTH%"
echo.
echo.
echo HTTPS frontend can now use:
echo   %BRIDGE_URL%
echo.
echo Keep the ZHI Brain Bridge window running while using ZHI.
echo This launcher now prevents accidental duplicate instances.
echo.
pause
