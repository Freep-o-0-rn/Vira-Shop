@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Vira Shop - Admin Password Reset
echo.
echo =============================================
echo        VIRA SHOP - ADMINISTRATOR
echo =============================================
echo.
echo Current project: %CD%
echo Database: %CD%\data\pgdata
echo.
echo Close START-WINDOWS.bat before creating or updating the admin.
echo When typing the password, the characters WILL be visible.
echo.
where node >nul 2>nul
if errorlevel 1 goto :failed
call npm run db:setup
if errorlevel 1 goto :failed
node scripts\create-admin.mjs
if errorlevel 1 goto :failed
echo.
echo Administrator is ready.
echo Start Vira Shop and open http://localhost:3000/admin/login
goto :finish
:failed
echo.
echo Unable to create or update administrator.
echo Check the messages above, verify project folder, and close the site.
:finish
echo.
pause
endlocal
