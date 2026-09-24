# Investigation Intelligence System

AI-powered criminal network analysis platform — SIH 2026, Ministry of Home Affairs / NCRB,
Women Safety Division. Theme: Blockchain & Cybersecurity.

## Architecture

```
Ingestion -> Processing -> NLP -> Entity Resolution -> Neo4j -> Graph Analytics
    -> Explainable AI -> NestJS Backend -> React Dashboard
```

A permissioned Hyperledger Fabric ledger runs alongside as a tamper-evident audit
layer for selected events only (evidence registration, handoff, approvals, audit
checkpoints). It never stores full documents, PII, or bulk evidence content —
Neo4j remains the system of record for relationship/network intelligence.

## Services

| Service      | Stack                                   | Port |
|--------------|------------------------------------------|------|
| backend      | NestJS, TypeScript, Prisma                | 3000 |
| ai-service   | Python, FastAPI, spaCy, Transformers, Splink, scikit-learn | 8000 |
| frontend     | React, TypeScript, Tailwind, Cytoscape.js | 5173 |
| postgres     | PostgreSQL 16                             | 5432 |
| neo4j        | Neo4j 5.24 (APOC + GDS)                   | 7474 / 7687 |
| redis        | Redis 7                                   | 6379 |
| minio        | MinIO (S3-compatible)                     | 9000 / 9001 |
| kafka        | Apache Kafka (KRaft, no Zookeeper)         | 9092 |
| ledger       | Hyperledger Fabric (separate compose project — see `blockchain/README.md`) | 7050 / 7051 / 9051 |
| airflow      | Apache Airflow (batch/historical ingestion) | 8080 |

## Running locally

**Application stack:**

```bash
cp .env.example .env
docker compose up --build
```

**Permissioned ledger** (separate compose project — bring up first if you want
audit anchoring live; the app runs fine without it, just without ledger anchors):

```bash
cd blockchain/network
bash scripts/generate.sh && docker compose up -d && bash scripts/create-channel.sh
cd ../chaincode/audit-ledger && npm install && npm run build && cd ../../network
bash scripts/deploy-chaincode.sh
```

See `blockchain/README.md` for the full walkthrough and why it's a separate compose project.

Then:
- Frontend: http://localhost:5173
- Backend health: http://localhost:3000/api/health
- AI service health: http://localhost:8000/health
- Neo4j browser: http://localhost:7474 (neo4j / value of NEO4J_PASSWORD)
- MinIO console: http://localhost:9001 (value of MINIO_ACCESS_KEY / MINIO_SECRET_KEY)
- Airflow UI: http://localhost:8080 (admin / admin)

**Demo accounts** (seeded via `npm run prisma:seed` inside the backend container):

| Role | Email | Password |
|---|---|---|
| Investigator | investigator@iis.local | Investigator@123 |
| Supervisor | supervisor@iis.local | Supervisor@123 |
| Auditor | auditor@iis.local | Auditor@123 |
| Administrator | admin@iis.local | Admin@123 |

## Build sequence

Built incrementally; each phase left the system runnable via `docker compose up`.

1. **Local foundation** — Postgres, Neo4j, Redis, MinIO, NestJS, FastAPI wired and healthy. ✅
2. **Ingestion MVP** — file/case upload, MinIO storage, Postgres metadata, Kafka producer + consumer. ✅
3. **Processing MVP** — PDF/DOCX/CSV/XLSX/image-OCR/JSON extraction, normalization, spaCy+Transformers+regex NLP, dependency-parse relationship extraction, full provenance. ✅
4. **Entity resolution** — exact match (deterministic identifiers) + RapidFuzz + Splink probabilistic linkage + context/network matching, confidence-scored auto-merge/review queue. ✅
5. **Graph MVP** — Neo4j schema sync, Cypher queries, React/Cytoscape.js visualization with search/filter/evidence panel. ✅
6. **Analytics + explainability** — GDS PageRank/betweenness/degree + NetworkX cross-check, Louvain/LabelPropagation communities, node-similarity hidden links, rule-based + IsolationForest anomalies, Explainable Intelligence Engine (Hypothesis/Evidence/Confidence/Status/Provenance) with accept/reject/escalate UI. ✅
7. **Security hardening** — JWT auth, RBAC (INVESTIGATOR/SUPERVISOR/AUDITOR/ADMINISTRATOR), audit logging on every mutating action, role-aware UI. ✅
8. **Blockchain integration** — real 2-org Hyperledger Fabric network + TypeScript chaincode; evidence registration/access, hypothesis decisions, resolution decisions, case creation, and analytics runs auto-anchor a hash via `AuditLogService`; live tamper-detection verification from the Audit Log page. ✅
9. **Production path** — Airflow batch/historical ingestion DAG, Kafka topic expansion for CDR/financial/OSINT streams, AWS deployment notes. ✅ (see `docs/PRODUCTION.md`)

## Design boundaries (do not violate)

- Neo4j owns relationship/network intelligence. The blockchain/ledger is a parallel,
  independent tamper-evident audit mechanism — never a substitute graph store.
- The ledger stores hashes and minimal event metadata only. Full documents, PII, and
  bulk evidence content stay in PostgreSQL/MinIO (S3 in production).
- Every extracted relationship and entity-resolution decision carries provenance
  (source document/record + page/row/timestamp/event id) from the moment it's created.
- Analytics findings (centrality, communities, hidden links, anomalies) are candidates,
  never conclusions — they must pass through the Explainable Intelligence Engine with
  evidence, confidence, and a human verification requirement before being actionable.
- The frontend never calls the ai-service directly — every AI-triggered action (resolve,
  analytics) is proxied through the authenticated, RBAC-guarded NestJS backend.
