@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title V54.shop - Repair 404
echo IMPORTANT: First close the running V54 Next.js window.
echo This rebuilds Next.js, but leaves data, photos and Caddy settings untouched.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\repair-v54-404-windows.ps1"
echo.
if errorlevel 1 (
  echo Repair did not complete. Check the errors above.
) else (
  echo Repair completed. Start V54 using your existing combined BAT.
)
echo.
pause
endlocal
