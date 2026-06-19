@echo off
title Cervical Training
cd /d %~dp0
echo Starting server...
npx vite preview --port 8080 --host
echo Server running at http://localhost:8080
echo Close this window to stop.
pause
