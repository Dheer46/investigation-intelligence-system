"""Builds per-document context - which phones/locations/bank accounts were
mentioned in each source document - used as corroborating evidence for the
context/network matching stage (spec section 6: "same phone, same location,
overlapping associates" as supporting evidence for a person-identity match).
"""

from collections import defaultdict
from typing import Dict, List, Set

CONTEXT_ENTITY_TYPES = ("PHONE", "LOCATION", "BANK_ACCOUNT")


def build_document_context(entities: List[dict]) -> Dict[str, Dict[str, Set[str]]]:
    context: Dict[str, Dict[str, Set[str]]] = defaultdict(lambda: {t: set() for t in CONTEXT_ENTITY_TYPES})
    for entity in entities:
        entity_type = entity["entityType"]
        normalized = entity.get("normalized")
        if entity_type in CONTEXT_ENTITY_TYPES and normalized:
            context[entity["documentId"]][entity_type].add(normalized)
    return context


def shared_key(context: Dict[str, Dict[str, Set[str]]], document_id: str, entity_type: str) -> str:
    values = context.get(document_id, {}).get(entity_type, set())
    return "|".join(sorted(values))
