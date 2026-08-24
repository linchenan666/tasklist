@echo off
cd /d "D:\deepseek harness使用文件夹\网站项目询问\task-list"

REM If server is already running, just open the browser
netstat -ano | findstr ":4173" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto open

REM Start the server in a minimized window
start "TaskList-Server" /min cmd /c "node server.js"
timeout /t 2 /nobreak >nul

:open
start "" http://localhost:4173
exit
