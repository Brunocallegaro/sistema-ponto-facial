@echo off
REM Instala o backend (Windows). Requer Python 3.12 ou 3.13 (64 bits) no PATH.
cd /d "%~dp0"
py -3.12 --version >nul 2>&1 && (set PY=py -3.12) || (set PY=python)
%PY% -m venv venv || goto erro
call venv\Scripts\activate.bat
python -m pip install --upgrade pip || goto erro
pip install -r requirements.txt || goto erro
if not exist .env copy .env.example .env
python -c "from app.database import criar_tabelas; criar_tabelas(); print('Banco de dados criado.')" || goto erro
python -c "from app import recognition; recognition.carregar_modelo(); print(recognition.status_modelo())" || goto erro
echo.
echo Instalacao concluida! Execute iniciar_backend.bat
pause
exit /b 0
:erro
echo.
echo [ERRO] A instalacao falhou. Consulte a secao "Solucao de problemas" do README.md
pause
exit /b 1
