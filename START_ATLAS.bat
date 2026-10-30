@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Install Node.js LTS first, then reopen this file. & pause & exit /b 1)
if not exist node_modules (call npm install)
if errorlevel 1 (pause & exit /b 1)
call npm run setup
call npm run db:check
if errorlevel 1 (echo. & echo Atlas connection fail hua. Upar wala message parho. & pause & exit /b 1)
call npm run seed
if errorlevel 1 (pause & exit /b 1)
call npm run dev
pause
