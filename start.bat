@echo off
title Cervical Training
cd /d %~dp0
echo Starting server at http://localhost:8080
start http://localhost:8080
npx serve . -p 8080
pause
