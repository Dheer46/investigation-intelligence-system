@echo off
set TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\iis_kiosk_watcher.vbs
del "%TARGET%" 2>nul
echo Removed. The kiosk watcher will no longer start automatically.
pause
