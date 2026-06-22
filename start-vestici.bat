@echo off
title Vestici - Katalog Generator
cd /d "%~dp0"
echo.
echo  ==========================================
echo   VESTICI - Katalog Generator (lokal)
echo  ==========================================
echo.
echo  Server jalan di: http://localhost:8123
echo  Tutup jendela ini untuk mematikan server.
echo.
start "" "http://localhost:8123"
python -m http.server 8123
pause
