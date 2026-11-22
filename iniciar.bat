@echo off
rem Abre o Nan Cine para testar em casa: computador e celular no mesmo Wi-Fi.
rem Liga o banco de teste (emuladores do Firebase) e o servidor do site.
cd /d "%~dp0"
start "" cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:8642"
node ferramentas\local.mjs
pause
