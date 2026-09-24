"""Entity Intelligence orchestrator: Extracted Entities -> Normalize (already
done at extraction time) -> Candidate Generation -> Exact Matching -> Fuzzy
Matching -> Record Linkage -> Context/Network Matching -> Confidence Scoring
-> merge (auto) / human review (queued).
"""

import logging

import httpx

from app.common.schemas import ResolutionResultsPayload
from app.config import settings
from app.resolution.context import build_document_context
from app.resolution.exact_match import find_exact_match_groups
from app.resolution.name_linkage import find_name_linkage_groups

logger = logging.getLogger("ai-service.resolve")


def _fetch_entities(case_id: str) -> list[dict]:
    url = f"{settings.backend_internal_url}/api/internal/cases/{case_id}/entities"
    headers = {"x-internal-key": settings.internal_service_key}
    response = httpx.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()


def _post_results(case_id: str, payload: ResolutionResultsPayload) -> dict:
    url = f"{settings.backend_internal_url}/api/internal/cases/{case_id}/resolution-results"
    headers = {"x-internal-key": settings.internal_service_key, "Content-Type": "application/json"}
    response = httpx.post(url, content=payload.model_dump_json(), headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()


def resolve_case_entities(case_id: str) -> dict:
    entities = _fetch_entities(case_id)
    # Entities already merged into a ResolvedEntity on a previous run are left
    # alone - re-resolving them isn't idempotent-safe in this MVP (see README).
    unresolved = [e for e in entities if not e.get("resolvedEntityId")]

    exact_groups = find_exact_match_groups(unresolved)

    document_context = build_document_context(unresolved)
    name_auto_merges, name_review_candidates = find_name_linkage_groups(unresolved, document_context)

    payload = ResolutionResultsPayload(
        auto_merges=exact_groups + name_auto_merges,
        review_candidates=name_review_candidates,
    )
    result = _post_results(case_id, payload)
    logger.info("Resolved case %s: %s", case_id, result)
    return result
