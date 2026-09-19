@echo off
setlocal
cd /d "%~dp0\.."
echo ================================================
echo Boostan Factory ERP - Supabase deployment
echo ================================================
echo.
echo This script deploys the database migration and Edge Function.
echo It does NOT require Docker.
echo.
if "%BOOSTAN_PROJECT_REF%"=="" set /p BOOSTAN_PROJECT_REF=Supabase Project Ref: 
if "%BOOSTAN_PROJECT_REF%"=="" goto :fail

echo.
echo Installing the official Supabase CLI for this project if needed...
call npm install --save-dev supabase
if errorlevel 1 goto :fail

echo.
echo Supabase login will open your browser if needed...
call npx supabase login
if errorlevel 1 goto :fail

echo.
echo Linking the hosted project.
echo If Supabase asks for the database password, enter it there.
call npx supabase link --project-ref %BOOSTAN_PROJECT_REF%
if errorlevel 1 goto :fail

echo.
echo Applying pending cloud database migrations.
echo Existing v2.1 data is preserved; only the first historical migration was destructive.
call npx supabase db push --include-all
if errorlevel 1 goto :fail

echo.
echo Generating a strong random JWT secret locally...
for /f "delims=" %%A in ('powershell -NoProfile -Command "$b=New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToBase64String($b)"') do set "BOOSTAN_JWT_SECRET=%%A"
if "%BOOSTAN_JWT_SECRET%"=="" goto :fail

echo Setting the Edge Function secret...
call npx supabase secrets set BOOSTAN_JWT_SECRET="%BOOSTAN_JWT_SECRET%" --project-ref %BOOSTAN_PROJECT_REF%
if errorlevel 1 goto :fail

echo.
echo Deploying ERP API...
call npx supabase functions deploy erp-api --project-ref %BOOSTAN_PROJECT_REF% --use-api
if errorlevel 1 goto :fail

echo.
echo ================================================
echo Supabase deployment completed.
echo API URL:
echo https://%BOOSTAN_PROJECT_REF%.supabase.co/functions/v1/erp-api

echo ================================================
echo.
pause
goto :end

:fail
echo.
echo Deployment stopped because a command failed.
echo Copy the last error and send it to ChatGPT.
pause
exit /b 1

:end
endlocal
