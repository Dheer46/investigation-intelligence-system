"""Clean + Normalize stage: deterministic transforms so downstream entity
resolution can match "98765 43210", "+91-9876543210", "09876543210" to the
same phone number, and similarly for dates/names/account/vehicle numbers.
"""

import re
from typing import Optional

import pandas as pd

_PHONE_JUNK_RE = re.compile(r"[\s\-().]")
_NON_ALNUM_RE = re.compile(r"[^A-Za-z0-9]")
_WHITESPACE_RE = re.compile(r"\s+")


def clean_whitespace(raw: str) -> str:
    return _WHITESPACE_RE.sub(" ", raw).strip()


def normalize_phone(raw: str) -> Optional[str]:
    """Normalize Indian phone numbers to E.164 (+91XXXXXXXXXX).

    "98765 43210" / "+91-9876543210" / "09876543210" -> "+919876543210"
    """
    digits = _PHONE_JUNK_RE.sub("", raw)
    digits = digits.lstrip("+")
    if not digits.isdigit():
        return None

    if digits.startswith("91") and len(digits) == 12:
        national = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        national = digits[1:]
    elif len(digits) == 10:
        national = digits
    else:
        # Not a recognizable Indian mobile number (e.g. a bank account number
        # that happens to be all digits) - reject rather than guess, so it
        # can't masquerade as a phone entity downstream.
        return None

    if len(national) != 10 or national[0] not in "6789":
        return None
    return f"+91{national}"


def normalize_date(raw: str) -> Optional[str]:
    # Try unambiguous ISO8601 first (e.g. CDR/transaction timestamps) - never
    # apply dayfirst here, since ISO's year-month-day order isn't ambiguous
    # and dayfirst can otherwise swap month/day on a string that already
    # parses correctly (2026-01-05 must stay Jan 5, not become May 1).
    try:
        parsed = pd.to_datetime(raw, format="ISO8601", errors="coerce")
    except Exception:  # noqa: BLE001
        parsed = pd.NaT
    if pd.isna(parsed):
        # Fall back to free-text / DD-MM-YYYY style dates common in FIRs,
        # where dayfirst is the correct default for Indian documents.
        try:
            parsed = pd.to_datetime(raw, dayfirst=True, errors="coerce")
        except Exception:  # noqa: BLE001
            return None
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def normalize_name(raw: str) -> str:
    return clean_whitespace(raw).title()


def normalize_account_number(raw: str) -> str:
    return _NON_ALNUM_RE.sub("", raw).upper()


def normalize_vehicle_number(raw: str) -> str:
    return _NON_ALNUM_RE.sub("", raw).upper()
