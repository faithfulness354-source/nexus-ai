@echo off
setlocal EnableExtensions

rem Boots Stable Diffusion Forge in the background with --api --medvram-sdxl
rem (via webui-user.bat COMMANDLINE_ARGS) and waits until :7860 answers.
set "ASSISTANT_DIR=%~dp0"
set "FORGE_DIR=C:\sd-webui-forge"
set "FORGE_PORT=7860"

echo.
echo === Ensure Stable Diffusion Forge ===
echo.

cd /d "%ASSISTANT_DIR%"
if not exist "node_modules\" (
  echo Installing npm dependencies...
  call npm.cmd install
)

call npm.cmd run forge:ensure
if errorlevel 1 (
  echo.
  echo [error] Forge did not become ready on port %FORGE_PORT%.
  echo Check C:\sd-webui-forge and .forge\forge-ensure.log
  exit /b 1
)

echo.
echo Forge API: http://127.0.0.1:%FORGE_PORT%/sdapi/v1/img2img
echo.
endlocal
