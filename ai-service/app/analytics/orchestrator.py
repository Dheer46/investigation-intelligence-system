import logging

import httpx

from app.analytics import anomaly, centrality, community, explainability, hidden_links
from app.common.schemas import HypothesesBulkPayload
from app.config import settings

logger = logging.getLogger("ai-service.analytics.orchestrator")


def _post_hypotheses(case_id: str, payload: HypothesesBulkPayload) -> dict:
    if not payload.hypotheses:
        return {"hypothesesCreated": 0}
    url = f"{settings.backend_internal_url}/api/internal/cases/{case_id}/hypotheses"
    headers = {"x-internal-key": settings.internal_service_key, "Content-Type": "application/json"}
    response = httpx.post(url, content=payload.model_dump_json(), headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()


def run_case_analytics(case_id: str) -> dict:
    centrality.compute_gds_centrality(case_id)
    top_connectors = centrality.get_top_connectors(case_id)
    networkx_cross_check = centrality.cross_check_with_networkx(case_id)

    communities = community.compute_communities(case_id)
    links = hidden_links.find_hidden_links(case_id)

    circular = anomaly.find_circular_transactions(case_id)
    high_frequency = anomaly.find_high_frequency_communication(case_id)
    shared_identifiers = anomaly.find_shared_identifier_collisions(case_id)
    outliers = anomaly.find_statistical_outliers(case_id)

    hypotheses = (
        explainability.hidden_link_hypotheses(links)
        + explainability.community_hypotheses(communities)
        + explainability.anomaly_hypotheses(circular, high_frequency, shared_identifiers, outliers)
    )

    post_result = _post_hypotheses(case_id, HypothesesBulkPayload(hypotheses=hypotheses))

    summary = {
        "topConnectors": top_connectors,
        "communitiesDetected": len(communities),
        "hiddenLinksFound": len(links),
        "anomaliesFound": len(circular) + len(high_frequency) + len(shared_identifiers) + len(outliers),
        "hypothesesCreated": post_result.get("hypothesesCreated", len(hypotheses)),
        "networkxNodesCrossChecked": len(networkx_cross_check.get("pagerank", {})),
    }
    logger.info("Analytics run for case %s: %s", case_id, summary)
    return summary
