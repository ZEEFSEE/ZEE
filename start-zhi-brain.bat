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
set "OLLAMA_WARMUP=%BRIDGE_URL%/api/chat"
set "OLLAMA_MODEL=llama3.1:8b"

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

echo [1/4] Checking Ollama...
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
  if !OLLAMA_TRIES! GEQ 20 (
    echo [ERROR] Ollama did not become ready within 20 seconds.
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

echo [2/4] Checking existing ZHI Brain Bridge...
curl --max-time 3 -s "%BRIDGE_READY%" >nul 2>nul
if not errorlevel 1 (
  echo Existing Bridge is already READY. Reusing it.
  goto WARMUP
)

curl --max-time 3 -s "%BRIDGE_HEALTH%" >nul 2>nul
if not errorlevel 1 (
  echo Existing Bridge is running but not READY.
  echo Waiting for the existing Bridge instead of starting a duplicate.
  goto WAIT_EXISTING_BRIDGE
)

echo No Bridge is running. Starting ZHI Brain Bridge...
start "ZHI Brain Bridge" cmd /c "node ""%~dp0zhi-ollama-bridge.js"""
echo Waiting for Bridge...

:WAIT_EXISTING_BRIDGE
set /a BRIDGE_TRIES=0
:WAIT_BRIDGE
timeout /t 1 /nobreak >nul
set /a BRIDGE_TRIES+=1
curl --max-time 2 -s "%BRIDGE_READY%" >nul 2>nul
if not errorlevel 1 goto WARMUP
if !BRIDGE_TRIES! GEQ 20 (
  echo [ERROR] ZHI Brain Bridge did not become READY within 20 seconds.
  echo Check the ZHI Brain Bridge window and Ollama status.
  pause
  exit /b 1
)
goto WAIT_BRIDGE

:WARMUP
echo.
echo [3/4] Warming up %OLLAMA_MODEL%...
echo This loads the model before the first real conversation.
set "WARMUP_JSON={"model":"%OLLAMA_MODEL%","stream":false,"keep_alive":"15m","options":{"num_ctx":512,"num_predict":8},"messages":[{"role":"user","content":"Reply with OK."}]}"
curl --max-time 45 -s -X POST "%OLLAMA_WARMUP%" -H "Content-Type: application/json" -d "%WARMUP_JSON%" >nul 2>nul
if errorlevel 1 (
  echo [WARN] Warm-up did not complete. The Bridge is still available.
) else (
  echo Model warm-up: OK
)
echo.

echo [4/4] Final READY check...
curl --max-time 5 -s "%BRIDGE_READY%"
echo.
echo.
echo ==========================================
echo ZHI Brain is READY
echo ==========================================
echo HTTPS frontend can now use:
echo   %BRIDGE_URL%
echo.
echo Keep the ZHI Brain Bridge window running while using ZHI.
echo This launcher reuses existing instances and warms the model.
echo.
pause
