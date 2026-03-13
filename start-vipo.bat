@echo off
title VIPO Vision Server
echo ============================================
echo    VIPO Vision - Starting Production Server
echo ============================================
echo.

cd /d "%~dp0server"

echo Starting server on http://localhost:5055 ...
echo.

start "" http://localhost:5055

node src/index.js

echo.
echo Server stopped. Press any key to exit.
pause > nul
