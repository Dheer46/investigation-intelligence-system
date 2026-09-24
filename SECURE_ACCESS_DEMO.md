# Secure Access Gate — Setup & Demo Script

The USB+face+PIN gate is now the standalone face-recognition service in
`C:\Users\USER\Desktop\face detection\` (InsightFace SCRFD detector +
ArcFace embeddings + MiniFASNetV2 anti-spoof liveness, PIN, and a secret
string standing in for the USB token). It runs on the host — not in
Docker — because it needs direct Windows webcam access.

The in-house Node/face-api.js gate that used to live in this repo
(`/secure-access`, `/officer-enrollment`, the `usb-verify`/`face-verify`/
`pin-verify` backend endpoints) has been removed. That service is the gate
now.

## How the two projects connect

```
face detection\server.py (127.0.0.1:8500)
        │  PIN + secret + 5-frame liveness + ArcFace 1:N identify
        │  all pass
        ▼
dashboard_session.py: look up the enrolled name's officer row directly
in the SAME Postgres database the IIS backend uses, then sign a JWT with
the SAME JWT_SECRET the IIS backend already trusts
        │
        ▼
web/index.html redirects the browser to
http://localhost:5173/sso-callback#token=...&user=...
        │
        ▼
SsoCallbackPage.tsx stores the token exactly like a normal /auth/login
response and lands on the dashboard - no second login, ever.
```

No new backend endpoint was added on the IIS side for this. The token the
Python service mints is byte-for-byte what `/auth/login` would have
produced for that officer, so the existing `JwtStrategy`/`RolesGuard`
accept it unmodified.

## One-time setup

1. **Bring up the IIS stack** (`docker compose up -d` from the repo root) so
   Postgres is reachable at `localhost:5432`.
2. **In `face detection\`**, install the two extra Python packages this
   bridge needs (everything else was already set up per that project's own
   README):
   ```
   pip install psycopg2-binary pyjwt
   ```
3. **Create the matching officer account in IIS.** The database was just
   cleared, so log in as admin and create yourself an officer row — the
   email must be `<name>@iis.local` where `<name>` is exactly what you'll
   pass to `enroll_face.py` (or add a mapping in
   `face detection\security\officer_map.json`, copied from
   `officer_map.json.example`, if you want a different email):
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@iis.local","password":"Admin@123"}'
   # copy the accessToken from the response, then:
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Authorization: Bearer <accessToken>" \
     -H "Content-Type: application/json" \
     -d '{"email":"<name>@iis.local","password":"Temp-1234!","fullName":"<Your Name>","role":"INVESTIGATOR"}'
   ```
4. **Set up the face-auth side itself** (all fresh — the old secret/PIN/
   enrolled faces were just wiped):
   ```
   python setup_security.py
   python setup_pin.py
   python enroll_face.py <name>
   ```
5. **Start the gate:** `python server.py`, then open `http://127.0.0.1:8500`.

## Demo script

1. Go to `http://localhost:5173/` — no session, redirected to `/login`.
   The login page has a link to the secure gate for officers.
2. Open `http://127.0.0.1:8500`. Enter the PIN and secret, let it capture 5
   frames.
3. On success: face + liveness independently verified across the 5 frames
   (at least 4 must pass, same identity across all passing frames), then
   the officer lookup runs, a session is minted, and the browser lands on
   the IIS dashboard already signed in.

**Failure scenarios still worth showing:**

| Scenario | Trigger | Result |
|---|---|---|
| Wrong PIN or secret | Type it wrong | "Invalid PIN" / "Invalid secret" — camera never even matters |
| No/multiple faces | Step out of frame, or have two people in shot | "Exactly one face required" |
| Photo/screen replay | Hold up a printed photo or phone screen | MiniFASNetV2 anti-spoof denies it — "Spoof detected" |
| Unknown face | Someone not enrolled sits down | "Unknown face" |
| Verified face, no IIS account | An enrolled name with no matching `users` row | "Face verified as '<name>' but no matching active officer account exists in IIS" — proves identity and authorization are checked separately |

## What I could not test myself

This sandbox has no webcam and no display for OpenCV's `imshow` window, so
`enroll_face.py` and the actual live gate at `:8500` need to be run and
verified by you on your machine. I've typechecked and confirmed the IIS
side (backend cleanly recompiled with the old auth-gate code removed,
frontend redeploys and picks up `/sso-callback`) but the Python↔IIS handoff
itself — a real face triggering a real redirect into a real dashboard
session — is unverified until you run it once.

## Known limitations to say before a judge finds them

- This is a normal USB with a copyable secret string, not a FIDO2/PIV
  hardware key — explicitly a hackathon stand-in for the possession factor.
- `FACE_THRESHOLD` / `LIVENESS_THRESHOLD` in `face detection\config.py`
  (0.55 / 0.65) were shipped as conservative starting points — tune them
  against your actual lighting/webcam before presenting.
- MiniFASNetV2 reduces common printed-photo/screen-replay attacks but is
  not certified presentation-attack detection; a good video replay or a
  physical mask is a known gap for any RGB-only webcam liveness system.
