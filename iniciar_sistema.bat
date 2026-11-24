@echo off
REM Abre backend e frontend em duas janelas e o navegador (Windows)
cd /d "%~dp0"
start "Backend - FastAPI" cmd /k "cd backend && call iniciar_backend.bat"
timeout /t 8 /nobreak >nul
start "Frontend - React" cmd /k "cd frontend && call iniciar_frontend.bat"
timeout /t 6 /nobreak >nul
start http://localhost:5173
