from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# The one setting that changes per deployment: where the central dashboard
# actually lives. On a real multi-office rollout this points at the shared
# server (e.g. "https://iis.example.gov"), not a specific kiosk's own
# address - that's the entire point of centralizing verification.
DASHBOARD_URL = "https://10.44.9.168:5173"
GATE_PATH = "/gate"

USB_TOKEN_FILENAME = "gov_token.json"
USB_POLL_SECONDS = 1
