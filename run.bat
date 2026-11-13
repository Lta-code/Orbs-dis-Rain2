@echo off
chcp 65001 >nul
title Rain2 - Discord Quest Auto Completer
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Khong tim thay Node.js! Vui long cai dat Node.js tu https://nodejs.org/
    pause
    exit /b 1
)

if not exist ".env" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env" >nul
    ) else (
        echo TOKEN=your_token_account_discord> ".env"
    )
)

if not exist "node_modules\.bin\tsx.cmd" (
    echo [INFO] Dang cai dat cac thu vien can thiet cho Rain2...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Cai dat thu vien that bai! Vui long kiem tra ket noi mang roi thu lai.
        pause
        exit /b 1
    )
)

call npx tsx farm.ts
echo.
pause
