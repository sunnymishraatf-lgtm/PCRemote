@echo off
REM PC Remote Server launcher — double-click to start.
title PC Remote Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [PC Remote] Node.js is not installed.
  echo  Download it from https://nodejs.org (LTS) and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo  [PC Remote] First run — installing dependencies, please wait...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  [PC Remote] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
node server\index.js
echo.
echo  [PC Remote] Server stopped.
pause
