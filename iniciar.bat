@echo off
rem Abre o Nan Cine no navegador, rodando no seu computador.
cd /d "%~dp0"
start "" http://127.0.0.1:8642
node servidor.mjs
pause
