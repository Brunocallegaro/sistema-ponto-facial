@echo off
REM Inicia a interface React (Windows)
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias do frontend...
  call npm install || (echo [ERRO] npm install falhou & pause & exit /b 1)
)
call npm run dev
pause
