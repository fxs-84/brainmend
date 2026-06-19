@echo off
title Cervical Training
cd /d %~dp0
echo Installing dependencies...
call npm install
echo Starting dev server...
start http://localhost:8080
npx vite --port 8080 --host
echo Server stopped.
pause
