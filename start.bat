@echo off
title Cervical Training
cd /d %~dp0
echo Starting server...
start http://localhost:8080
python -m http.server 8080
echo Server stopped.
pause
