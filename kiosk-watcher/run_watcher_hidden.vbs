' Runs kiosk_watcher.py silently in the background (no console window).
'
' Uses "pythonw" from PATH. If it silently does nothing on this machine,
' the Python install is probably a Microsoft Store "app execution alias" -
' those are known to fail silently when launched this way from a Startup
' shortcut/Scheduled Task instead of an interactive shell. Fix: replace
' pythonwPath below with the full path to the real pythonw.exe (e.g.
' C:\Users\<you>\AppData\Local\Programs\Python\Python31x\pythonw.exe).
Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
pythonwPath = "pythonw"
WshShell.Run pythonwPath & " """ & scriptDir & "\kiosk_watcher.py""", 0, False
