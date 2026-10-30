@echo off
cd /d "%~dp0"
if not exist node_modules (call npm install)
if errorlevel 1 (pause & exit /b 1)
call npm run setup
call npm run db:check
if errorlevel 1 (echo Check MONGO_URI in backend\.env and Atlas Network Access, then try again. & pause & exit /b 1)
call npm run seed
if errorlevel 1 (pause & exit /b 1)
call npm run dev
pause
