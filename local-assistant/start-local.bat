@echo off
setlocal EnableExtensions

rem === Edit these if your installs live elsewhere ===
set "ASSISTANT_DIR=%~dp0"
set "WEBUI_DIR=C:\sd-webui"
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

echo Starting Image Generator...
if exist "%WEBUI_DIR%\webui-user.bat" (
  start "A1111 / Forge" cmd /k "cd /d "%WEBUI_DIR%" && webui-user.bat"
) else (
  echo   [warn] webui-user.bat not found at "%WEBUI_DIR%"
  echo          Update WEBUI_DIR in start-local.bat when Automatic1111 / Forge is installed.
)

echo Starting Assistant UI...
cd /d "%ASSISTANT_DIR%"
if not exist "node_modules\" (
  echo   Installing npm dependencies...
  call npm.cmd install
)
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
echo Keep the Ollama / WebUI / Assistant windows running while you use the app.
echo.
endlocal
