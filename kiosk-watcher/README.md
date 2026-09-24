# Kiosk USB/PIN/Face Gate Watcher

Install this on **any workstation** you want to work as a checkpoint - front
desk, entry gate, another office entirely. No enrolled faces, PINs, or
secrets live here; this script only detects a paired USB and opens the gate
page. All verification happens centrally (see `backend/src/auth/auth.service.ts`
`verifyGateAuth`, via `biometric-service`), so any officer enrolled through
the admin portal (`admin-portal/`, port 5174) works at any kiosk that has
this watcher installed - that's the entire point of centralizing it.

## Requirements

- Windows, Python 3.10+ (standard library only - nothing to `pip install`).
- Google Chrome, for the kiosk-mode (`--app=`) window. Falls back to your
  default browser if Chrome isn't found, but won't be able to auto-close
  the window on USB removal in that case.

## Setup

1. Edit `config.py` - set `DASHBOARD_URL` to wherever the central dashboard
   actually runs (e.g. `https://iis.example.gov`, not `localhost`, unless
   this kiosk PC is the same machine hosting the stack).
2. Run `install_autostart.bat` to have it start silently every login, or
   just run `python kiosk_watcher.py` directly to test it first.

## How it works

1. Admin enrolls an officer and pairs their personal USB through the admin
   portal - this writes `gov_token.json` (a plain, opaque token id - not a
   secret, see admin-portal's `EnrollFacePanel.tsx`) onto that USB's root.
2. Officer plugs that USB into any kiosk running this watcher.
3. Watcher finds `gov_token.json`, opens `<DASHBOARD_URL>/gate?token=...`
   in a kiosk-style Chrome window.
4. That page captures PIN + face frames and posts them to the central
   backend's `/api/auth/gate/verify` - which checks the token, that
   specific officer's PIN hash, and their face embedding, all in Postgres.
5. On success, the page signs the officer into the dashboard directly (no
   second login) and redirects there.
6. Pull the USB - the watcher closes that kiosk window automatically.

## Known limitation

This is a polling script, not a signed driver or Windows service - it
doesn't need admin rights and only watches removable drives, but it isn't
tamper-proof the way a certified endpoint agent with OS-level hooks would
be. Fine for a demo/pilot; not a substitute for a hardened agent in a real
production rollout.
