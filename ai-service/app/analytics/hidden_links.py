"""Hidden link discovery: Node Similarity (Neo4j GDS) surfaces node pairs
with substantial shared-neighbourhood overlap that have no direct recorded
relationship - a possible indirect association worth an investigator's eye,
never an asserted fact.
"""

import logging
from typing import List

from app.analytics.gds_client import case_projection
from app.deps import get_neo4j_driver

logger = logging.getLogger("ai-service.analytics.hidden_links")

SIMILARITY_THRESHOLD = 0.2


def find_hidden_links(case_id: str) -> List[dict]:
    with case_projection(case_id) as (session, graph_name):
        result = session.run(
            """
            CALL gds.nodeSimilarity.stream($name, {similarityCutoff: $cutoff})
            YIELD node1, node2, similarity
            RETURN gds.util.asNode(node1).id AS id1, gds.util.asNode(node1).name AS name1,
                   gds.util.asNode(node2).id AS id2, gds.util.asNode(node2).name AS name2,
                   similarity
            ORDER BY similarity DESC
            """,
            name=graph_name,
            cutoff=SIMILARITY_THRESHOLD,
        )
        candidates = [dict(record) for record in result]

    if not candidates:
        return []

    driver = get_neo4j_driver()
    with driver.session() as session:
        existing = session.run(
            """
            MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n)-[r]->(m) WHERE (m)-[:INVOLVED_IN]->(c)
            RETURN n.id AS a, m.id AS b
            """,
            caseId=case_id,
        )
        existing_pairs = {frozenset((r["a"], r["b"])) for r in existing}
    driver.close()

    hidden = []
    seen = set()
    for candidate in candidates:
        pair_key = frozenset((candidate["id1"], candidate["id2"]))
        if pair_key in existing_pairs or pair_key in seen:
            continue
        seen.add(pair_key)
        hidden.append(
            {
                "nodeAId": candidate["id1"],
                "nodeAName": candidate["name1"],
                "nodeBId": candidate["id2"],
                "nodeBName": candidate["name2"],
                "similarity": candidate["similarity"],
            }
        )
    return hidden
