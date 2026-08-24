@echo off
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4173" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
echo TaskList server stopped.
timeout /t 2 >nul
