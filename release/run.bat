@echo off
REM Yuihime Standalone Launcher (Windows)
REM Usage: run.bat [--no-ui] [--port 3000]

setlocal enabledelayedexpansion

REM Ensure data directory exists
if not exist data mkdir data

REM Run server
echo Starting Yuihime...
node server.cjs %*
pause
