@echo off
setlocal EnableExtensions

rem Nexus AI ComfyUI Desktop install — API on 127.0.0.1:8188
set "COMFY_ROOT=%LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Installs\Nexus AI\ComfyUI"
set "PYTHON=%COMFY_ROOT%\.venv\Scripts\python.exe"
set "EXTRA_YAML=%APPDATA%\Comfy Desktop\instance-model-paths\inst-1791525844918.yaml"

if not exist "%COMFY_ROOT%\main.py" (
  echo [error] ComfyUI not found at "%COMFY_ROOT%"
  exit /b 1
)
if not exist "%PYTHON%" (
  set "PYTHON=%LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Installs\Nexus AI\standalone-env\python.exe"
)
if not exist "%PYTHON%" (
  echo [error] Python runtime not found for ComfyUI
  exit /b 1
)

echo Starting ComfyUI API on http://127.0.0.1:8188 ...
cd /d "%COMFY_ROOT%"
"%PYTHON%" main.py --listen 127.0.0.1 --port 8188 --extra-model-paths-config "%EXTRA_YAML%"
endlocal
