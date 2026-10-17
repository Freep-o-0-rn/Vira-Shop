@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Vira Shop - Backup Data
echo.
echo VIRA SHOP: BACKUP DATABASE AND UPLOADS
echo.
echo Stop START-WINDOWS.bat before making this backup.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-data-windows.ps1"
if errorlevel 1 (
  echo.
  echo Backup failed. Read the error above.
)
echo.
pause
endlocal
