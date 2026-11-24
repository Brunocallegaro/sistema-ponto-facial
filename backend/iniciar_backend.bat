@echo off
REM Inicia a API do Sistema de Ponto (Windows)
cd /d "%~dp0"
if not exist venv\Scripts\activate.bat (
  echo [ERRO] Ambiente virtual nao encontrado. Execute primeiro: instalar_backend.bat
  pause
  exit /b 1
)
call venv\Scripts\activate.bat
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
