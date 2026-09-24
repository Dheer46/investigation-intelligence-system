@echo off
cd /d "%~dp0"
set TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\iis_kiosk_watcher.vbs
copy /Y "run_watcher_hidden.vbs" "%TARGET%" >nul
echo Installed: the kiosk watcher will now start silently every time you log into Windows.
echo Edit config.py's DASHBOARD_URL first if this isn't pointing at your central server yet.
echo To undo this, run uninstall_autostart.bat
pause
