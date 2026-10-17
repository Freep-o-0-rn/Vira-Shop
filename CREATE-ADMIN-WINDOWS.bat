@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Vira Shop - Create Admin
echo.
echo Vira Shop - Create / reset administrator
echo.
where node >nul 2>nul
if errorlevel 1 goto :failed
call npm run db:setup
if errorlevel 1 goto :failed
node scripts\create-admin.mjs
if errorlevel 1 goto :failed
echo.
echo Admin ready. Open http://localhost:3000/admin/login
goto :finish
:failed
echo.
echo Error creating admin. Check PostgreSQL and .env.local.
:finish
echo.
pause
endlocal
