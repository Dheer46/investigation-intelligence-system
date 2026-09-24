"""Explainable Intelligence Engine: every analytics finding becomes a
Hypothesis - Hypothesis text, Evidence Sources, Confidence Score, Status
(Requires Human Verification), Provenance - never an automatic conclusion.
Communities and hidden links are inherently uncertain and go through this;
raw centrality rankings are descriptive metadata, not claims, so they don't.
"""

from datetime import datetime, timezone
from typing import List

from app.common.schemas import HypothesisPayload

ALGORITHM_VERSION = "phase6-v1"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def hidden_link_hypotheses(hidden_links: List[dict]) -> List[HypothesisPayload]:
    hypotheses = []
    for link in hidden_links:
        hypotheses.append(
            HypothesisPayload(
                hypothesis_text=(
                    f"Possible indirect association between {link['nodeAName']} and {link['nodeBName']}: "
                    "they share significant neighbourhood overlap in the graph despite no recorded direct link."
                ),
                evidence_summary={
                    "type": "HIDDEN_LINK",
                    "nodeAId": link["nodeAId"],
                    "nodeBId": link["nodeBId"],
                    "similarity": link["similarity"],
                },
                confidence=min(0.95, round(link["similarity"], 4)),
                provenance={
                    "algorithm": "gds.nodeSimilarity",
                    "algorithmVersion": ALGORITHM_VERSION,
                    "graphNodeIds": [link["nodeAId"], link["nodeBId"]],
                    "computedAt": _now(),
                },
            )
        )
    return hypotheses


def community_hypotheses(communities: List[dict]) -> List[HypothesisPayload]:
    hypotheses = []
    for community in communities:
        member_names = [m["name"] for m in community["members"]]
        hypotheses.append(
            HypothesisPayload(
                hypothesis_text=(
                    f"Possible sub-network of {len(member_names)} entities showing dense mutual connections: "
                    f"{', '.join(member_names[:6])}{'…' if len(member_names) > 6 else ''}."
                ),
                evidence_summary={
                    "type": "COMMUNITY",
                    "communityId": community["communityId"],
                    "members": community["members"],
                    "labelPropagationAgreement": community["labelPropagationAgreement"],
                },
                confidence=max(0.4, round(community["labelPropagationAgreement"], 4)),
                provenance={
                    "algorithm": "gds.louvain + gds.labelPropagation",
                    "algorithmVersion": ALGORITHM_VERSION,
                    "graphNodeIds": [m["id"] for m in community["members"]],
                    "computedAt": _now(),
                },
            )
        )
    return hypotheses


def anomaly_hypotheses(
    circular: List[dict],
    high_frequency: List[dict],
    shared_identifiers: List[dict],
    statistical_outliers: List[dict],
) -> List[HypothesisPayload]:
    hypotheses = []

    for c in circular:
        hypotheses.append(
            HypothesisPayload(
                hypothesis_text=(
                    f"Possible circular flow of funds involving {c['anchorName']}: "
                    f"a transaction path returns to the same party ({' -> '.join(c['cycleNames'])})."
                ),
                evidence_summary={"type": "ANOMALY", "subtype": "CIRCULAR_TRANSACTION", "cycle": c["cycleNames"]},
                confidence=0.7,
                provenance={
                    "algorithm": "cypher-cycle-detection",
                    "algorithmVersion": ALGORITHM_VERSION,
                    "graphNodeIds": [c["anchorId"]],
                    "computedAt": _now(),
                },
            )
        )

    for h in high_frequency:
        hypotheses.append(
            HypothesisPayload(
                hypothesis_text=(
                    f"Unusually high communication frequency for {h['name']}: {h['callCount']} calls across "
                    f"{h['distinctContacts']} contacts within this case."
                ),
                evidence_summary={"type": "ANOMALY", "subtype": "HIGH_FREQUENCY_COMMUNICATION", **h},
                confidence=0.65,
                provenance={
                    "algorithm": "rule:call-frequency-threshold",
                    "algorithmVersion": ALGORITHM_VERSION,
                    "graphNodeIds": [h["id"]],
                    "computedAt": _now(),
                },
            )
        )

    for s in shared_identifiers:
        hypotheses.append(
            HypothesisPayload(
                hypothesis_text=(
                    f"{s['entityType'].replace('_', ' ').title()} {s['name']} is linked to {len(s['people'])} "
                    f"different people ({', '.join(s['people'])}) - possible shared device/account or identity confusion."
                ),
                evidence_summary={"type": "ANOMALY", "subtype": "SHARED_IDENTIFIER", **s},
                confidence=0.6,
                provenance={
                    "algorithm": "rule:shared-identifier-collision",
                    "algorithmVersion": ALGORITHM_VERSION,
                    "graphNodeIds": [s["id"]],
                    "computedAt": _now(),
                },
            )
        )

    for o in statistical_outliers:
        hypotheses.append(
            HypothesisPayload(
                hypothesis_text=(
                    f"{o['name']} is structurally unusual relative to other entities in this case "
                    "(centrality profile flagged as an outlier) - worth a closer look."
                ),
                evidence_summary={"type": "ANOMALY", "subtype": "STRUCTURAL_OUTLIER", **o},
                confidence=min(0.85, 0.5 + o["anomalyScore"]),
                provenance={
                    "algorithm": "sklearn.IsolationForest",
                    "algorithmVersion": ALGORITHM_VERSION,
                    "graphNodeIds": [o["id"]],
                    "computedAt": _now(),
                },
            )
        )

    return hypotheses
