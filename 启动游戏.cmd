@echo off
cd /d "%~dp0"
python tools\play_local.py
if errorlevel 1 pause
