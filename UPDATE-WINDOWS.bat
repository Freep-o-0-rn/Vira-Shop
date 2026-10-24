@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
if errorlevel 1 goto :error
title Vira Shop - GitHub updater
echo.
echo ==============================================
echo      VIRA SHOP - SAFE WINDOWS UPDATER
echo ==============================================
echo.
echo Stop START-WINDOWS.bat (Next.js) with Ctrl+C FIRST.
echo Caddy may stay running. Data, photos and .env are preserved.
echo.
where powershell.exe >nul 2>nul
if errorlevel 1 goto :error
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-windows.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo Update failed or cancelled. See the message above.
  goto :finish
)
echo.
echo Update completed. Start START-WINDOWS.bat to open the shop.
goto :finish
:error
set "RESULT=1"
echo ERROR: Project folder or PowerShell is unavailable.
:finish
echo.
pause
exit /b %RESULT%
