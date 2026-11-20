@echo off
setlocal EnableExtensions

rem === Edit these if your installs live elsewhere ===
set "ASSISTANT_DIR=%~dp0"
set "WEBUI_DIR=C:\sd-webui-forge"
set "FORGE_DIR=%WEBUI_DIR%"
set "COMFY_DIR=%LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Installs\Nexus AI\ComfyUI"
set "ASSISTANT_URL=http://localhost:3010"

echo.
echo === Local Privacy Assistant ===
echo.

echo Starting Ollama...
where ollama >nul 2>&1
if errorlevel 1 (
  echo   [warn] ollama not found on PATH. Install Ollama or add it to PATH.
) else (
  start "Ollama" cmd /k ollama serve
)

echo Ensuring Stable Diffusion Forge on :7860 (--api --medvram-sdxl)...
cd /d "%ASSISTANT_DIR%"
if not exist "node_modules\" (
  echo   Installing npm dependencies...
  call npm.cmd install
)
rem Starts Forge in the background if needed, then blocks until :7860 API is ready.
call npm.cmd run forge:ensure
if errorlevel 1 (
  echo   [warn] Forge not ready yet — image gen may fail until http://127.0.0.1:7860 answers.
  echo   You can retry with start-forge.bat
) else (
  echo   Forge API ready at http://127.0.0.1:7860
)

echo Starting ComfyUI on port 8188 (optional fallback)...
if exist "%COMFY_DIR%\main.py" (
  start "ComfyUI :8188" cmd /k "cd /d "%ASSISTANT_DIR%" && start-comfy.bat"
) else (
  echo   [warn] ComfyUI not found at "%COMFY_DIR%"
)

echo Starting Assistant UI...
cd /d "%ASSISTANT_DIR%"
start "Local Assistant" cmd /k "cd /d "%ASSISTANT_DIR%" && npm.cmd run dev"

echo Waiting for the UI...
timeout /t 5 /nobreak >nul

where chrome >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%ASSISTANT_URL%
  ) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=%ASSISTANT_URL%
  ) else (
    start "" %ASSISTANT_URL%
  )
) else (
  start "" chrome --app=%ASSISTANT_URL%
)

echo.
echo Opened %ASSISTANT_URL%
echo Image backend defaults to Forge at http://127.0.0.1:7860/sdapi/v1/img2img
echo Keep Ollama / Forge / Assistant running while you use the app.
echo.
endlocal
