@echo off
rem WoW Forever beta workaround: the client never loads add-on saved settings.
rem This links a folder inside RXPGuides and ForeverBank to the game's SavedVariables folder so the add-on
rem can load its own saved file. Changes nothing else. Safe to run again. Close the game first.
setlocal enabledelayedexpansion
set "WOW=C:\Program Files (x86)\World of Warcraft\_classic_beta_"
if not exist "%WOW%\Interface\AddOns\RXPGuides" (
  echo WoW Forever was not found at "%WOW%".
  set /p "WOW=Paste the full path of your _classic_beta_ folder and press Enter: "
)
set "N=0"
for /d %%D in ("%WOW%\WTF\Account\*") do if /i not "%%~nxD"=="SavedVariables" ( set "ACC=%%D" & set /a N+=1 )
if not "%N%"=="1" ( echo Found %N% account folders under WTF\Account, expected 1. Tell Andres. & pause & exit /b 1 )
for %%A in (RXPGuides ForeverBank) do if exist "%WOW%\Interface\AddOns\%%A" if not exist "%WOW%\Interface\AddOns\%%A\ForeverSV" mklink /J "%WOW%\Interface\AddOns\%%A\ForeverSV" "%ACC%\SavedVariables"
echo.
dir /b "%WOW%\Interface\AddOns\RXPGuides\ForeverSV" | findstr /i "RXPGuides.lua" && echo Link works. || echo Link made. RXPGuides.lua will appear after your first play session.
pause
