@echo off
cd /d "%~dp0"
title Smart Healthcare FIXED 2026-10-25
where node >nul 2>nul
if errorlevel 1 (echo Install Node.js LTS first. & pause & exit /b 1)
echo Build: healthcare-fixed-2026-10-25
echo Folder: %CD%
echo Close old project terminals with Ctrl+C before continuing.
if not exist node_modules (call npm ci)
if errorlevel 1 (pause & exit /b 1)
call npm run setup
if errorlevel 1 (pause & exit /b 1)
call npm run seed
if errorlevel 1 (pause & exit /b 1)
echo Open http://localhost:4000 after the server starts.
call npm start
pause
