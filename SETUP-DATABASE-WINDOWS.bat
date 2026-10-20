@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Vira Shop - Local Database
echo.
echo ================================================
echo       VIRA SHOP - LOCAL DATABASE
echo ================================================
echo No Docker or PostgreSQL installation is needed.
echo Data will be stored in .\data\pgdata
echo.
where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: Windows PowerShell is missing.
    goto :fail
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1" -CheckOnly
if errorlevel 1 (
    echo ERROR: The operating system or Node.js/npm is not ready.
    echo Check WINDOWS-SETUP.md for instructions.
    goto :fail
)
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail
call npm run db:seed
if errorlevel 1 goto :fail
echo.
echo Database is ready. Run START-WINDOWS.bat.
goto :end
:fail
echo.
echo Database setup failed. Review the error above.
:end
pause
endlocal
