"""Multilingual extraction via the Gemini API: for FIRs/statements/OSINT text
written in Hindi or another Indian regional language, spaCy's English-only
model (see entity_extraction.py) can't parse it at all. Rather than translate
to English first - which corrupts Indian names/places and breaks the
sentence-level location_ref alignment the whole system's provenance depends
on - Gemini reads the source-language text directly and returns entities and
relations in the exact same shape entity_extraction.py / relation_extraction.py
already produce, so every downstream stage (dedupe, quality gate, graph sync,
entity resolution) needs zero changes to consume either source.

Verbatim raw_text is the one hard requirement of the prompt below: graph sync
(backend/src/graph/graph.service.ts findEntityForText) and the reconstruction
timeline both re-match a relation's subject/object text back to an extracted
entity by substring - if Gemini "helpfully" translated a name to English, that
matching breaks silently. So entities are asked for in the original script,
never translated.
"""

import logging
from typing import List, Tuple

import httpx

from app.common.schemas import ExtractedEntityPayload, ExtractedRelationPayload
from app.config import settings
from app.extraction.extract import TextUnit

logger = logging.getLogger("ai-service.gemini_extraction")

_VALID_ENTITY_TYPES = {"PERSON", "PHONE", "VEHICLE", "LOCATION", "ORGANIZATION", "BANK_ACCOUNT", "DATE", "EVENT"}

# Unicode blocks for the scripts FIRs/statements are realistically filed in
# (Devanagari covers Hindi/Marathi; the others cover the other cases this
# system is meant to serve). A meaningful share of a text unit falling in one
# of these - not just a stray word - is what routes it to Gemini instead of
# the English-only spaCy/regex/transformer ensemble.
_INDIC_SCRIPT_RANGES = [
    (0x0900, 0x097F),  # Devanagari (Hindi, Marathi)
    (0x0980, 0x09FF),  # Bengali/Assamese
    (0x0A00, 0x0A7F),  # Gurmukhi (Punjabi)
    (0x0A80, 0x0AFF),  # Gujarati
    (0x0B00, 0x0B7F),  # Oriya
    (0x0B80, 0x0BFF),  # Tamil
    (0x0C00, 0x0C7F),  # Telugu
    (0x0C80, 0x0CFF),  # Kannada
    (0x0D00, 0x0D7F),  # Malayalam
    (0x0600, 0x06FF),  # Arabic script (Urdu)
]
_MULTILINGUAL_THRESHOLD = 0.10  # share of letters that must fall in an Indic script


def needs_multilingual_extraction(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return False
    indic = sum(1 for ch in letters if any(lo <= ord(ch) <= hi for lo, hi in _INDIC_SCRIPT_RANGES))
    return (indic / len(letters)) >= _MULTILINGUAL_THRESHOLD


_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "entities": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "entity_type": {"type": "STRING", "enum": sorted(_VALID_ENTITY_TYPES)},
                    "raw_text": {"type": "STRING"},
                    "normalized": {"type": "STRING"},
                    "confidence": {"type": "NUMBER"},
                },
                "required": ["entity_type", "raw_text", "confidence"],
            },
        },
        "relations": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "source_text": {"type": "STRING"},
                    "subject_text": {"type": "STRING"},
                    "predicate": {"type": "STRING"},
                    "object_text": {"type": "STRING"},
                    "confidence": {"type": "NUMBER"},
                },
                "required": ["source_text", "subject_text", "predicate", "object_text", "confidence"],
            },
        },
    },
    "required": ["entities", "relations"],
}

_PROMPT_TEMPLATE = """You are an information-extraction engine for an Indian police investigation \
system. The text below may be in Hindi, another Indian regional language, Urdu, or a mix of one of \
those with English - read it in its original script.

Extract:
1. entities - every PERSON, PHONE (phone number), VEHICLE (registration number), LOCATION, \
ORGANIZATION, BANK_ACCOUNT, DATE, or EVENT mentioned.
2. relations - every clear subject-predicate-object fact connecting two of those entities \
(e.g. "X called Y", "X works for Y", "X lives in Y").

Critical rule: "raw_text" (for entities) and "subject_text"/"object_text"/"source_text" (for \
relations) MUST be copied character-for-character from the source text, in its original language \
and script. Do NOT translate or transliterate them into English - a downstream system matches this \
text back to the source document by exact substring, so a translated name breaks that match. Only \
"normalized" may be a cleaned-up form (e.g. a phone number with punctuation stripped).

"source_text" for each relation must be the exact original sentence it came from.

Text:
---
{text}
---
"""


def extract_with_gemini(unit: TextUnit) -> Tuple[List[ExtractedEntityPayload], List[ExtractedRelationPayload]]:
    if not settings.gemini_api_key:
        logger.warning("Multilingual text detected but GEMINI_API_KEY is not set - skipping this unit")
        return [], []

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
    )
    body = {
        "contents": [{"parts": [{"text": _PROMPT_TEMPLATE.format(text=unit.text)}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "response_schema": _RESPONSE_SCHEMA,
            "temperature": 0.1,
        },
    }

    try:
        response = httpx.post(url, json=body, timeout=30)
        response.raise_for_status()
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        import json

        parsed = json.loads(text)
    except Exception:  # noqa: BLE001 - network/quota/parse failure should degrade, not crash the pipeline
        logger.exception("Gemini extraction failed for a text unit (location_ref=%s)", unit.location_ref)
        return [], []

    entities: List[ExtractedEntityPayload] = []
    seen_entities: set[tuple[str, str]] = set()
    for raw in parsed.get("entities", []):
        entity_type = raw.get("entity_type")
        raw_text = (raw.get("raw_text") or "").strip()
        if entity_type not in _VALID_ENTITY_TYPES or len(raw_text) < 2:
            continue
        key = (entity_type, raw_text.lower())
        if key in seen_entities:
            continue
        seen_entities.add(key)
        entities.append(
            ExtractedEntityPayload(
                entity_type=entity_type,
                raw_text=raw_text,
                normalized=(raw.get("normalized") or "").strip() or None,
                location_ref=unit.location_ref,
                confidence=max(0.0, min(1.0, float(raw.get("confidence", 0.7)))),
                source="gemini",
            )
        )

    relations: List[ExtractedRelationPayload] = []
    for raw in parsed.get("relations", []):
        subject_text = (raw.get("subject_text") or "").strip()
        object_text = (raw.get("object_text") or "").strip()
        source_text = (raw.get("source_text") or "").strip()
        predicate = (raw.get("predicate") or "").strip()
        if not (subject_text and object_text and source_text and predicate):
            continue
        relations.append(
            ExtractedRelationPayload(
                source_text=source_text,
                subject_text=subject_text,
                predicate=predicate,
                object_text=object_text,
                location_ref=unit.location_ref,
                confidence=max(0.0, min(1.0, float(raw.get("confidence", 0.6)))),
            )
        )

    return entities, relations
