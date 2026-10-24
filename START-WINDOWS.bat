@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
if errorlevel 1 goto :bad_folder
title V54.shop - Next.js + Caddy
echo.
echo ====================================================
echo           VIRA SHOP - LOCAL SERVER
echo ====================================================
echo.
echo Working directory: %CD%
echo The console will stay open after any error.
echo.
where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: Windows PowerShell is not available.
    echo Run: npm install ^&^& npm run dev
    goto :finished_error
)
echo Checking and starting Caddy (C:\Caddy\caddy.exe)...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-caddy-windows.ps1"
if errorlevel 1 (
    echo ERROR: Caddy could not start. Next.js was not launched.
    goto :finished_error
)
echo.
echo Starting the existing, working Next.js development server...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1"
if errorlevel 1 goto :finished_error
echo.
echo The Vira Shop server has stopped.
goto :finished

:bad_folder
echo ERROR: Cannot open the project folder.
goto :finished_error

:finished_error
echo.
echo Startup failed. See vira-startup.log in this folder.
echo You can also copy the error text from this window.
:finished
echo.
echo Press any key to close this window...
pause >nul
endlocal
