"""Thin helper around Neo4j GDS graph projections, scoped to one case's
subgraph at a time. GDS algorithms run against an in-memory projection, not
the stored graph directly, so every analytics run projects, computes, and
drops the projection rather than leaving it resident.
"""

from contextlib import contextmanager

from app.deps import get_neo4j_driver

PROJECTION_QUERY = """
MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n)
OPTIONAL MATCH (n)-[r]->(m) WHERE (m)-[:INVOLVED_IN]->(c)
WITH gds.graph.project($graphName, n, m, {}) AS g
RETURN g
"""


@contextmanager
def case_projection(case_id: str, graph_name: str = "caseGraph"):
    driver = get_neo4j_driver()
    with driver.session() as session:
        session.run("CALL gds.graph.drop($name, false)", name=graph_name).consume()
        session.run(PROJECTION_QUERY, caseId=case_id, graphName=graph_name).consume()
        try:
            yield session, graph_name
        finally:
            session.run("CALL gds.graph.drop($name, false)", name=graph_name).consume()
    driver.close()
