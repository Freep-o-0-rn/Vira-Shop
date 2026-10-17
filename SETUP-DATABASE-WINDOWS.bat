@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Vira Shop - Local Database
echo.
echo ================================================
echo       VIRA SHOP - LOCAL DATABASE
echo ================================================
echo No Docker or PostgreSQL installation is needed.
echo Data will be stored in .\data\pgdata
echo.
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
