@echo off
rem Registers a task that copies Forever XP's saved data into Documents\ForeverXP
rem every 15 minutes while you are logged in to Windows. Run once.
schtasks /Create /F /TN "ForeverXP Auto Export" /SC MINUTE /MO 15 /TR "wscript.exe \"%~dp0ForeverXP Export (hidden).vbs\""
if errorlevel 1 (
  echo.
  echo Could not create the task.
  pause
  exit /b 1
)
echo.
echo Running the first export now...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ForeverXP-Export.ps1"
echo.
echo Done. Forever XP will now export on its own every 15 minutes.
echo To stop it, run "ForeverXP Auto Export Remove.bat".
pause
