"""Fuzzy matching (RapidFuzz) + probabilistic multi-field record linkage
(Splink) for PERSON/ORGANIZATION mentions, using shared phone/location/account
context as corroborating evidence (context/network matching).

Splink's m/u probabilities are set explicitly rather than trained via EM: a
single case rarely has enough labelled pairs for EM to converge, so we encode
the Fellegi-Sunter weights by hand (a name match is strong evidence; shared
context is supporting, not sufficient, evidence). RapidFuzz then cross-checks
Splink's candidate pairs with an independent string-similarity measure, and the
two are blended into one confidence score per cluster.
"""

import logging
from collections import defaultdict
from typing import Dict, List, Tuple

import pandas as pd
from rapidfuzz import fuzz

from app.resolution.context import shared_key

logger = logging.getLogger("ai-service.name_linkage")

NAME_LINKAGE_TYPES = {"PERSON", "ORGANIZATION"}
AUTO_MERGE_THRESHOLD = 0.85
REVIEW_THRESHOLD = 0.55


def _run_splink(df: pd.DataFrame):
    from splink import DuckDBAPI, Linker, SettingsCreator, block_on
    import splink.comparison_library as cl

    name_comparison = cl.JaroWinklerAtThresholds("name", score_threshold_or_thresholds=[0.9, 0.7]).configure(
        m_probabilities=[0.75, 0.15, 0.07, 0.03],
        u_probabilities=[0.02, 0.03, 0.10, 0.85],
    )
    context_comparisons = [
        cl.ExactMatch(col).configure(m_probabilities=[0.6, 0.4], u_probabilities=[0.05, 0.95])
        for col in ("shared_phone_key", "shared_location_key", "shared_account_key")
    ]

    settings = SettingsCreator(
        link_type="dedupe_only",
        probability_two_random_records_match=0.1,
        comparisons=[name_comparison, *context_comparisons],
        blocking_rules_to_generate_predictions=[block_on("substr(name,1,1)")],
    )
    linker = Linker(df, settings, db_api=DuckDBAPI())
    predictions = linker.inference.predict(threshold_match_probability=0.01)
    clusters = linker.clustering.cluster_pairwise_predictions_at_threshold(
        predictions, threshold_match_probability=REVIEW_THRESHOLD
    )
    return predictions.as_pandas_dataframe(), clusters.as_pandas_dataframe()


def find_name_linkage_groups(
    entities: List[dict], document_context: Dict[str, Dict[str, set]]
) -> Tuple[List[dict], List[dict]]:
    auto_merges: List[dict] = []
    review_candidates: List[dict] = []

    by_type: Dict[str, List[dict]] = defaultdict(list)
    for entity in entities:
        if entity["entityType"] in NAME_LINKAGE_TYPES and entity.get("normalized"):
            by_type[entity["entityType"]].append(entity)

    for entity_type, members in by_type.items():
        if len(members) < 2:
            continue

        rows = [
            {
                "unique_id": e["id"],
                "name": e["normalized"],
                "shared_phone_key": shared_key(document_context, e["documentId"], "PHONE"),
                "shared_location_key": shared_key(document_context, e["documentId"], "LOCATION"),
                "shared_account_key": shared_key(document_context, e["documentId"], "BANK_ACCOUNT"),
            }
            for e in members
        ]

        try:
            predictions_df, clusters_df = _run_splink(pd.DataFrame(rows))
        except Exception:
            logger.exception("Splink linkage failed for entity_type=%s; skipping this type", entity_type)
            continue

        name_by_id = {e["id"]: e["normalized"] for e in members}
        rapidfuzz_scores: Dict[frozenset, float] = {}
        for _, row in predictions_df.iterrows():
            l_id, r_id = row["unique_id_l"], row["unique_id_r"]
            rapidfuzz_scores[frozenset((l_id, r_id))] = fuzz.token_sort_ratio(name_by_id[l_id], name_by_id[r_id]) / 100

        cluster_members: Dict[str, List[str]] = defaultdict(list)
        for _, row in clusters_df.iterrows():
            cluster_members[str(row["cluster_id"])].append(row["unique_id"])

        for member_ids in cluster_members.values():
            if len(member_ids) < 2:
                continue

            pair_scores = []
            for _, row in predictions_df.iterrows():
                if row["unique_id_l"] in member_ids and row["unique_id_r"] in member_ids:
                    rf_score = rapidfuzz_scores.get(
                        frozenset((row["unique_id_l"], row["unique_id_r"])), row["match_probability"]
                    )
                    pair_scores.append(0.6 * row["match_probability"] + 0.4 * rf_score)
            if not pair_scores:
                continue

            group_score = sum(pair_scores) / len(pair_scores)
            canonical_name = max((name_by_id[i] for i in member_ids), key=len)
            group = {
                "entity_type": entity_type,
                "canonical_name": canonical_name,
                "member_entity_ids": member_ids,
            }
            if group_score >= AUTO_MERGE_THRESHOLD:
                auto_merges.append(group)
            elif group_score >= REVIEW_THRESHOLD:
                review_candidates.append({**group, "match_score": round(group_score, 4)})

    return auto_merges, review_candidates
