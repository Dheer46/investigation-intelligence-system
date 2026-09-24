"""
Install this on any workstation you want to act as a USB/PIN/face gate.

Unlike the original local-only design, this watcher runs NO local server and
holds NO enrolled faces, PINs, or secrets - it only does two things:
  1. Watches removable drives for gov_token.json (written by the admin
     portal when an officer's USB is paired - see admin-portal's
     EnrollFacePanel.tsx).
  2. When found, opens DASHBOARD_URL + GATE_PATH with that token in a kiosk-
     style browser window. The actual PIN/face verification happens on the
     central backend (AuthService.verifyGateAuth) via biometric-service -
     this script never sees a PIN or a face frame.

This is what makes "install once, works for any officer" possible: the
watcher itself is identical on every kiosk; only the token on each officer's
own USB differs.
"""

import ctypes
import json
import subprocess
import sys
import time
from pathlib import Path

from config import BASE_DIR, DASHBOARD_URL, GATE_PATH, USB_TOKEN_FILENAME, USB_POLL_SECONDS

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]

DRIVE_REMOVABLE = 2


def log(msg: str):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line)
    with open(BASE_DIR / "kiosk_watcher.log", "a", encoding="utf-8") as f:
        f.write(line + "\n")


def list_removable_drives() -> list[str]:
    drives = []
    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
    for i in range(26):
        if not (bitmask & (1 << i)):
            continue
        letter = f"{chr(65 + i)}:\\"
        try:
            if ctypes.windll.kernel32.GetDriveTypeW(letter) == DRIVE_REMOVABLE:
                drives.append(letter)
        except Exception:
            continue
    return drives


def read_token_id(drive_root: str):
    token_file = Path(drive_root) / USB_TOKEN_FILENAME
    if not token_file.exists():
        return None
    try:
        data = json.loads(token_file.read_text(encoding="utf-8"))
        return data.get("tokenId")
    except Exception:
        return None


def gate_url(token_id: str) -> str:
    return f"{DASHBOARD_URL}{GATE_PATH}?token={token_id}"


CHROME_PROFILE_DIR = BASE_DIR / "chrome-kiosk-profile"


def open_gate(token_id: str):
    """Chrome is a singleton by default: a plain `chrome --app=URL` launch
    when Chrome is already open (near-guaranteed on any real desktop) gets
    forwarded via IPC to the EXISTING process and immediately exits, so the
    actual window ends up owned by a process whose command line never
    mentions our URL - close_gate()'s command-line match would then find
    nothing. A dedicated --user-data-dir opts this window out of that
    singleton behavior, forcing a genuinely separate, trackable process."""
    url = gate_url(token_id)
    CHROME_PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    for chrome_path in CHROME_CANDIDATES:
        if Path(chrome_path).exists():
            subprocess.Popen([
                chrome_path,
                f"--app={url}",
                f"--user-data-dir={CHROME_PROFILE_DIR}",
                "--no-first-run",
            ])
            return
    import webbrowser
    webbrowser.open(url)


def close_gate(token_id: str):
    """Finds the kiosk-mode Chrome window by its launch command line - a
    --app window keeps that same command line for its whole life even after
    the page navigates client-side (e.g. after login redirects to '/'), so
    this still finds and closes it."""
    url = gate_url(token_id)
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command",
         f"Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" -ErrorAction SilentlyContinue | "
         f"Where-Object {{ $_.CommandLine -like '*--app={url}*' }} | "
         f"ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"],
        capture_output=True,
    )


def main():
    log(f"Kiosk watcher started. Dashboard: {DASHBOARD_URL}")
    log("Insert a paired USB to open the secure access gate. Ctrl+C to stop.")

    active_token = None

    while True:
        found_token = None
        for drive in list_removable_drives():
            tid = read_token_id(drive)
            if tid:
                found_token = tid
                break

        if found_token and found_token != active_token:
            if active_token:
                close_gate(active_token)
            log(f"USB detected with token '{found_token}' - opening gate.")
            active_token = found_token
            open_gate(active_token)
        elif not found_token and active_token:
            log(f"USB removed - closing gate for token '{active_token}'.")
            close_gate(active_token)
            active_token = None

        time.sleep(USB_POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Watcher stopped.")
