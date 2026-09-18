@echo off
setlocal
cd /d "%~dp0"
echo Installing backend and frontend dependencies...
call npm install
if errorlevel 1 exit /b 1
echo Running backend unit tests...
call npm test
if errorlevel 1 exit /b 1
echo Building frontend...
call npm run build
if errorlevel 1 exit /b 1
echo.
echo Setup checks completed successfully.
