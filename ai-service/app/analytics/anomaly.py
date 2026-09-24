"""Anomaly detection: rule-based checks (circular money flows, high-frequency
communication spikes, one identifier shared by many people) plus a
scikit-learn Isolation Forest pass over structural features, for the
statistical-outlier case no fixed rule anticipated.
"""

import logging
from typing import List

import numpy as np
from sklearn.ensemble import IsolationForest

from app.deps import get_neo4j_driver

logger = logging.getLogger("ai-service.analytics.anomaly")

HIGH_FREQUENCY_CALL_THRESHOLD = 3
MIN_SHARED_IDENTIFIER_PEOPLE = 2


def find_circular_transactions(case_id: str) -> List[dict]:
    driver = get_neo4j_driver()
    with driver.session() as session:
        result = session.run(
            """
            MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(a)
            MATCH path = (a)-[:TRANSACTED_WITH*2..5]-(a)
            WITH a, path, [node IN nodes(path) | node.name] AS cycleNames
            RETURN DISTINCT a.id AS anchorId, a.name AS anchorName, cycleNames
            LIMIT 10
            """,
            caseId=case_id,
        )
        rows = [dict(record) for record in result]
    driver.close()
    return rows


def find_high_frequency_communication(case_id: str) -> List[dict]:
    driver = get_neo4j_driver()
    with driver.session() as session:
        result = session.run(
            """
            MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n)
            MATCH (n)-[r:CALLED]-(other) WHERE (other)-[:INVOLVED_IN]->(c)
            WITH n, count(DISTINCT other) AS distinctContacts, count(r) AS callCount
            WHERE callCount >= $threshold
            RETURN n.id AS id, n.name AS name, callCount, distinctContacts
            ORDER BY callCount DESC
            """,
            caseId=case_id,
            threshold=HIGH_FREQUENCY_CALL_THRESHOLD,
        )
        rows = [dict(record) for record in result]
    driver.close()
    return rows


def find_shared_identifier_collisions(case_id: str) -> List[dict]:
    driver = get_neo4j_driver()
    with driver.session() as session:
        result = session.run(
            """
            MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(identifier)
            WHERE identifier.entityType IN ['PHONE', 'BANK_ACCOUNT']
            MATCH (identifier)-[]-(person) WHERE person.entityType = 'PERSON' AND (person)-[:INVOLVED_IN]->(c)
            WITH identifier, collect(DISTINCT person.name) AS people
            WHERE size(people) >= $minPeople
            RETURN identifier.id AS id, identifier.name AS name, identifier.entityType AS entityType, people
            """,
            caseId=case_id,
            minPeople=MIN_SHARED_IDENTIFIER_PEOPLE,
        )
        rows = [dict(record) for record in result]
    driver.close()
    return rows


def find_statistical_outliers(case_id: str) -> List[dict]:
    """Isolation Forest over [pagerank, betweenness, degree] for PERSON/
    ORGANIZATION nodes - catches structurally unusual nodes no fixed rule
    above was written to anticipate."""
    driver = get_neo4j_driver()
    with driver.session() as session:
        result = session.run(
            """
            MATCH (c:Case {id: $caseId})<-[:INVOLVED_IN]-(n)
            WHERE n.entityType IN ['PERSON', 'ORGANIZATION']
            RETURN n.id AS id, n.name AS name,
                   coalesce(n.pagerank, 0.0) AS pagerank,
                   coalesce(n.betweenness, 0.0) AS betweenness,
                   coalesce(n.degreeCentrality, 0.0) AS degree
            """,
            caseId=case_id,
        )
        rows = [dict(record) for record in result]
    driver.close()

    if len(rows) < 6:
        # Isolation Forest needs a reasonable sample to define "normal";
        # below that, every point looks equally novel - skip rather than
        # produce meaningless flags on a near-empty case.
        return []

    features = np.array([[r["pagerank"], r["betweenness"], r["degree"]] for r in rows])
    model = IsolationForest(contamination=0.15, random_state=42)
    predictions = model.fit_predict(features)
    scores = model.decision_function(features)

    outliers = []
    for row, prediction, score in zip(rows, predictions, scores):
        if prediction == -1:
            outliers.append({"id": row["id"], "name": row["name"], "anomalyScore": round(float(-score), 4)})
    return outliers
