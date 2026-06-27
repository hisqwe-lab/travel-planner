@echo off
cd /d "%~dp0"
echo Travel planner is running at http://localhost:8000
echo Press Ctrl+C to stop this server.
if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" server.js
) else (
  node server.js
)
