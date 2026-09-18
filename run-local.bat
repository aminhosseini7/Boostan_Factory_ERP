@echo off
cd /d "%~dp0"
start "Boostan ERP Backend" cmd /k "cd /d "%~dp0backend" && npm start"
start "Boostan ERP Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
