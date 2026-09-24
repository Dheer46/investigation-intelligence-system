"""Entity extraction: spaCy (NER + dependency parse backbone) + regex
(deterministic identifiers spaCy doesn't model out of the box: phone numbers,
vehicle registrations, bank accounts) + Hugging Face Transformers (supplementary
cross-check pass that can catch names/orgs/locations spaCy's small model misses).
"""

import logging
import re
from typing import List, Optional

import spacy

from app.common.schemas import ExtractedEntityPayload
from app.extraction.extract import TextUnit
from app.normalization.normalize import (
    normalize_account_number,
    normalize_date,
    normalize_name,
    normalize_phone,
    normalize_vehicle_number,
)

logger = logging.getLogger("ai-service.entity_extraction")

_nlp = spacy.load("en_core_web_sm")

_SPACY_LABEL_MAP = {
    "PERSON": "PERSON",
    "ORG": "ORGANIZATION",
    "GPE": "LOCATION",
    "LOC": "LOCATION",
    "FAC": "LOCATION",
    "DATE": "DATE",
    "EVENT": "EVENT",
}

_HF_LABEL_MAP = {
    "PER": "PERSON",
    "ORG": "ORGANIZATION",
    "LOC": "LOCATION",
}

# Phone candidates: digit runs (with optional space/dash separators typical of
# how people actually write numbers) that total exactly 10 (national), 11
# (leading trunk 0), or 12 (country code 91) digits - not an arbitrary-length
# blob, so a 12-digit bank account number doesn't also get read as a phone.
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?91[-\s]?|0)?[6-9]\d{1,4}(?:[-\s]?\d{2,5}){1,3}(?!\d)")
_VEHICLE_RE = re.compile(r"\b[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{4}\b")
_BANK_ACCOUNT_RE = re.compile(
    r"(?:account|a/c|acct)[^0-9A-Za-z]{0,5}([A-Za-z0-9]{6,18})", re.IGNORECASE
)

_MIN_ENTITY_TEXT_LENGTH = 2

_hf_ner = None


def _get_hf_ner():
    global _hf_ner
    if _hf_ner is None:
        from transformers import pipeline

        _hf_ner = pipeline("ner", model="dslim/bert-base-NER", aggregation_strategy="simple")
    return _hf_ner


def _regex_entities(unit: TextUnit) -> List[ExtractedEntityPayload]:
    entities: List[ExtractedEntityPayload] = []

    for match in _PHONE_RE.finditer(unit.text):
        candidate = match.group().strip()
        normalized = normalize_phone(candidate)
        if normalized is None:
            # Doesn't resolve to a valid 10-digit Indian mobile number (e.g.
            # it's actually a bank account or other digit string) - reject
            # rather than surface a bogus PHONE entity.
            continue
        entities.append(
            ExtractedEntityPayload(
                entity_type="PHONE",
                raw_text=candidate,
                normalized=normalized,
                location_ref=unit.location_ref,
                confidence=0.9,
                source="regex",
            )
        )

    for match in _VEHICLE_RE.finditer(unit.text):
        candidate = match.group().strip()
        entities.append(
            ExtractedEntityPayload(
                entity_type="VEHICLE",
                raw_text=candidate,
                normalized=normalize_vehicle_number(candidate),
                location_ref=unit.location_ref,
                confidence=0.85,
                source="regex",
            )
        )

    for match in _BANK_ACCOUNT_RE.finditer(unit.text):
        candidate = match.group(1).strip()
        entities.append(
            ExtractedEntityPayload(
                entity_type="BANK_ACCOUNT",
                raw_text=candidate,
                normalized=normalize_account_number(candidate),
                location_ref=unit.location_ref,
                confidence=0.8,
                source="regex",
            )
        )

    return entities


def _normalize_for_type(entity_type: str, raw_text: str) -> Optional[str]:
    if entity_type == "PERSON":
        return normalize_name(raw_text)
    if entity_type == "DATE":
        return normalize_date(raw_text)
    if entity_type in ("LOCATION", "ORGANIZATION", "EVENT"):
        return raw_text.strip()
    return None


def _spacy_entities(unit: TextUnit) -> List[ExtractedEntityPayload]:
    doc = _nlp(unit.text)
    entities: List[ExtractedEntityPayload] = []
    for ent in doc.ents:
        mapped_type = _SPACY_LABEL_MAP.get(ent.label_)
        if not mapped_type:
            continue
        entities.append(
            ExtractedEntityPayload(
                entity_type=mapped_type,
                raw_text=ent.text,
                normalized=_normalize_for_type(mapped_type, ent.text),
                location_ref=unit.location_ref,
                confidence=0.75,
                source="spacy",
            )
        )
    return entities


def _transformer_entities(unit: TextUnit, enabled: bool) -> List[ExtractedEntityPayload]:
    if not enabled:
        return []
    try:
        ner = _get_hf_ner()
    except Exception as exc:  # noqa: BLE001 - model unavailable, degrade gracefully
        logger.warning("Transformer NER unavailable, skipping supplementary pass: %s", exc)
        return []

    entities: List[ExtractedEntityPayload] = []
    for result in ner(unit.text):
        mapped_type = _HF_LABEL_MAP.get(result["entity_group"])
        if not mapped_type:
            continue
        raw_text = result["word"].strip()
        entities.append(
            ExtractedEntityPayload(
                entity_type=mapped_type,
                raw_text=raw_text,
                normalized=_normalize_for_type(mapped_type, raw_text),
                location_ref=unit.location_ref,
                confidence=float(result["score"]),
                source="transformers",
            )
        )
    return entities


def _dedupe(entities: List[ExtractedEntityPayload]) -> List[ExtractedEntityPayload]:
    best: dict[tuple[str, str], ExtractedEntityPayload] = {}
    for entity in entities:
        key = (entity.entity_type, (entity.normalized or entity.raw_text).strip().lower())
        existing = best.get(key)
        if existing is None or entity.confidence > existing.confidence:
            best[key] = entity
    return list(best.values())


def _passes_quality_gate(entity: ExtractedEntityPayload) -> bool:
    text = entity.raw_text.strip()
    if len(text) < _MIN_ENTITY_TEXT_LENGTH:
        return False
    if "##" in text:
        # Unmerged WordPiece fragment from the transformer tokenizer - not a
        # real word, never worth surfacing to an investigator.
        return False
    if entity.source == "transformers" and entity.confidence < 0.5:
        return False
    if entity.entity_type == "DATE" and entity.normalized is None:
        # spaCy occasionally mislabels an arbitrary digit string as DATE; if
        # it doesn't parse as a real date it isn't one.
        return False
    if entity.entity_type != "VEHICLE" and _VEHICLE_RE.fullmatch(text.replace(" ", "")):
        # A vehicle registration mislabeled as PERSON/LOCATION/etc by spaCy or
        # the transformer model - the regex pass already captured it correctly.
        return False
    return True


def _drop_fragments(entities: List[ExtractedEntityPayload]) -> List[ExtractedEntityPayload]:
    """Discard any entity whose text is a strict substring of another entity
    found in the same unit - guards against a transformer WordPiece merge that
    only partially reassembled a word (e.g. "Lu" alongside "Ludhiana")."""
    texts_lower = [e.raw_text.strip().lower() for e in entities]
    return [
        entity
        for i, entity in enumerate(entities)
        if not any(
            i != j and texts_lower[i] != other and texts_lower[i] in other
            for j, other in enumerate(texts_lower)
        )
    ]


def extract_entities(unit: TextUnit, use_transformers: bool = True) -> List[ExtractedEntityPayload]:
    entities = _spacy_entities(unit) + _regex_entities(unit) + _transformer_entities(unit, use_transformers)
    entities = [e for e in entities if _passes_quality_gate(e)]
    entities = _drop_fragments(entities)
    return _dedupe(entities)
