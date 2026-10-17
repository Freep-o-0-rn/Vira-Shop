@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Установите Node.js LTS: https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm не найден. Переустановите Node.js.
  pause
  exit /b 1
)
if not exist "node_modules\next" (
  call npm install --no-audit --no-fund
  if errorlevel 1 (pause & exit /b 1)
)
echo.
echo Vira Shop: http://localhost:3000
echo Закрыть сервер: Ctrl+C
call npm run dev
pause
