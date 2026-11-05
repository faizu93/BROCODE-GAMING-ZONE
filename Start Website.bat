@echo off
title Bro Code Gaming Zone - Website Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on this computer.
  echo   Install it once from https://nodejs.org  ^(choose the LTS version^)
  echo   then double click this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo   First time setup - installing required packages...
  echo.
  call npm install --no-audit --no-fund
)

echo.
echo   Starting the Bro Code Gaming Zone website...
echo.
echo   Keep this window open while the cafe is taking bookings.
echo   Close this window to stop the website.
echo.

node server.js
pause
