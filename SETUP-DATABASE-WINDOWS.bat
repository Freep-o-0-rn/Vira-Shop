@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Vira Shop - PostgreSQL Setup
echo.
echo ====================================================
echo         VIRA SHOP - DEVELOPMENT DATABASE
echo ====================================================
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-database-windows.ps1"
if errorlevel 1 (
  echo.
  echo Database setup failed. Read vira-database-setup.log.
) else (
  echo.
  echo PostgreSQL initialized. Restart START-WINDOWS.bat.
)
echo.
pause
endlocal
