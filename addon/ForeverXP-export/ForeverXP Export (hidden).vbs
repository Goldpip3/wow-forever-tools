' Runs the Forever XP export with no window. Used by the scheduled task.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File """ & here & "\ForeverXP-Export.ps1"" -NoOpen"
CreateObject("WScript.Shell").Run cmd, 0, False
