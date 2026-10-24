@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo.
echo VIRA SHOP - CACHE DEMO PRODUCT PHOTOS
echo Saving images to public\uploads\unsplash-cache
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\cache-demo-images-windows.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" (
  echo Some images were not downloaded. See the errors above.
) else (
  echo Demo photos are ready for offline delivery from V54.shop.
)
echo.
pause
exit /b %RESULT%
