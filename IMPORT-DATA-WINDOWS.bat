@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Vira Shop - Import Data
echo.
echo VIRA SHOP: IMPORT DATABASE AND UPLOADS
echo.
echo CLOSE BOTH THE OLD AND NEW SERVER WINDOWS FIRST.
echo The old installation will not be modified.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\import-data-windows.ps1"
if errorlevel 1 (
  echo.
  echo Import was NOT completed. Read the error above.
)
echo.
pause
endlocal
