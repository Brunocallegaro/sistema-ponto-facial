@echo off
REM Modo celular: abre o sistema com HTTPS na rede Wi-Fi para usar a camera do celular
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias do frontend...
  call npm install || (echo [ERRO] npm install falhou & pause & exit /b 1)
)
echo.
echo ============================================================
echo  No celular (mesma rede Wi-Fi), abra o endereco "Network"
echo  que aparecera abaixo, por exemplo: https://192.168.0.10:5173
echo  Aceite o aviso de certificado: Avancado ^> Continuar
echo  Se o Windows perguntar, PERMITA o Node.js no Firewall
echo  (marque "Redes privadas").
echo ============================================================
echo.
call npm run celular
pause
