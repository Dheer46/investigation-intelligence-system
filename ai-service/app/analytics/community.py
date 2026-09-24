"""Community detection: Louvain (primary, via Neo4j GDS - writes communityId
back onto nodes so the dashboard graph view can colour/highlight sub-networks)
with Label Propagation as a second pass for cross-validation.
"""

import logging
from collections import defaultdict
from typing import List

from app.analytics.gds_client import case_projection
from app.deps import get_neo4j_driver

logger = logging.getLogger("ai-service.analytics.community")

MIN_COMMUNITY_SIZE = 3


def compute_communities(case_id: str) -> List[dict]:
    with case_projection(case_id) as (session, graph_name):
        session.run(
            "CALL gds.louvain.write($name, {writeProperty: 'communityId'})", name=graph_name
        ).consume()
        lp_result = session.run(
            "CALL gds.labelPropagation.stream($name) YIELD nodeId, communityId "
            "RETURN gds.util.asNode(nodeId).id AS id, communityId AS lpCommunityId",
            name=graph_name,
        )
        lp_by_node = {record["id"]: record["lpCommunityId"] for record in lp_result}

    driver = get_neo4j_driver()
    with driver.session() as session:
        result = session.run(
            """
            MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n)
            RETURN n.id AS id, n.name AS name, n.entityType AS entityType, n.communityId AS communityId
            """,
            caseId=case_id,
        )
        rows = [dict(record) for record in result]
    driver.close()

    groups: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        groups[row["communityId"]].append({"id": row["id"], "name": row["name"], "entityType": row["entityType"]})

    communities = []
    for community_id, members in groups.items():
        if len(members) < MIN_COMMUNITY_SIZE:
            continue
        # Cross-check: how much does Label Propagation agree with Louvain's
        # grouping for this same set of members? High agreement = a more
        # confidently "real" sub-network, not a Louvain-only artifact.
        member_ids = [m["id"] for m in members]
        lp_labels = [lp_by_node.get(mid) for mid in member_ids]
        agreement = (
            max((lp_labels.count(label) for label in set(lp_labels) if label is not None), default=0)
            / len(lp_labels)
            if lp_labels
            else 0
        )
        communities.append(
            {
                "communityId": community_id,
                "members": members,
                "labelPropagationAgreement": round(agreement, 2),
            }
        )
    return communities
