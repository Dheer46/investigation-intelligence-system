"""Exact matching: deterministic rules on high-precision identifiers.
Phone/bank-account/vehicle/location values are already normalized upstream,
so an identical normalized value is treated as the same real-world identity -
no fuzzy scoring needed or wanted here.
"""

from collections import defaultdict
from typing import Dict, List, Tuple

EXACT_MATCH_TYPES = {"PHONE", "BANK_ACCOUNT", "VEHICLE", "LOCATION"}


def find_exact_match_groups(entities: List[dict]) -> List[dict]:
    groups: Dict[Tuple[str, str], List[dict]] = defaultdict(list)
    for entity in entities:
        entity_type = entity["entityType"]
        normalized = entity.get("normalized")
        if entity_type in EXACT_MATCH_TYPES and normalized:
            groups[(entity_type, normalized)].append(entity)

    return [
        {
            "entity_type": entity_type,
            "canonical_name": normalized,
            "member_entity_ids": [e["id"] for e in members],
        }
        for (entity_type, normalized), members in groups.items()
        if len(members) >= 2
    ]
