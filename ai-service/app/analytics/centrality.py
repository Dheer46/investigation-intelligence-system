"""Key structural connectors: PageRank, Degree, Betweenness centrality.
Computed primarily via Neo4j GDS (writes scores back onto the stored nodes so
the dashboard's "Top Network Connectors" can just query Neo4j directly), with
a NetworkX pass as an independent cross-check on the same subgraph.
"""

import logging
from typing import List

import networkx as nx

from app.analytics.gds_client import case_projection
from app.deps import get_neo4j_driver

logger = logging.getLogger("ai-service.analytics.centrality")


def compute_gds_centrality(case_id: str) -> None:
    with case_projection(case_id) as (session, graph_name):
        session.run(
            "CALL gds.pageRank.write($name, {writeProperty: 'pagerank'})", name=graph_name
        ).consume()
        session.run(
            "CALL gds.betweenness.write($name, {writeProperty: 'betweenness'})", name=graph_name
        ).consume()
        session.run(
            "CALL gds.degree.write($name, {writeProperty: 'degreeCentrality'})", name=graph_name
        ).consume()


def get_top_connectors(case_id: str, limit: int = 10) -> List[dict]:
    driver = get_neo4j_driver()
    with driver.session() as session:
        result = session.run(
            """
            MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n)
            RETURN n.id AS id, n.name AS name, n.entityType AS entityType,
                   coalesce(n.pagerank, 0.0) AS pagerank,
                   coalesce(n.betweenness, 0.0) AS betweenness,
                   coalesce(n.degreeCentrality, 0.0) AS degree
            ORDER BY betweenness DESC, pagerank DESC
            LIMIT $limit
            """,
            caseId=case_id,
            limit=limit,
        )
        connectors = [dict(record) for record in result]
    driver.close()
    return connectors


def cross_check_with_networkx(case_id: str) -> dict:
    """Independent NetworkX recomputation of the same three measures, used
    only to sanity-check GDS's output (not written anywhere) - a bridging
    node with modest degree but unusually high betweenness is exactly the
    kind of connector a pure degree-count view would miss.
    """
    driver = get_neo4j_driver()
    with driver.session() as session:
        result = session.run(
            """
            MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n)
            OPTIONAL MATCH (n)-[r]->(m) WHERE (m)-[:INVOLVED_IN]->(c)
            RETURN n.id AS source, m.id AS target
            """,
            caseId=case_id,
        )
        rows = [(record["source"], record["target"]) for record in result]
    driver.close()

    graph = nx.DiGraph()
    for source, target in rows:
        graph.add_node(source)
        if target:
            graph.add_edge(source, target)

    if graph.number_of_nodes() == 0:
        return {"pagerank": {}, "betweenness": {}, "degree": {}}

    return {
        "pagerank": nx.pagerank(graph) if graph.number_of_edges() > 0 else {n: 0.0 for n in graph.nodes},
        "betweenness": nx.betweenness_centrality(graph),
        "degree": nx.degree_centrality(graph),
    }
