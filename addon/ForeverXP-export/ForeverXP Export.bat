@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ForeverXP-Export.ps1"
if errorlevel 1 pause
