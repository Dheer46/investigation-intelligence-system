# Production Path (AWS)

This documents the concrete swaps needed to move each component of the local
Docker Compose stack to a production AWS deployment. Nothing here has been
deployed as part of this build — it's the deliberate handoff point between
"runs correctly on a laptop" and "runs in an AWS account," matching the
project's own design principle that MinIO/local dev tooling is a stand-in for
managed services, not the production target.

## Component-by-component mapping

| Local (this repo)              | AWS production                                                                 | Why |
|---------------------------------|---------------------------------------------------------------------------------|-----|
| MinIO                            | **S3** + S3 Object Lock (evidence bucket, versioning on)                        | Same S3 API `minio` npm/boto3 clients already speak — swap endpoint + credentials only. Object Lock gives WORM guarantees for evidence, independent of the ledger. |
| PostgreSQL (container)           | **RDS for PostgreSQL** (Multi-AZ)                                                | Automated backups/PITR, failover, patching. |
| Redis (container)                | **ElastiCache for Redis**                                                        | Managed failover; same client config, just point at the cluster endpoint. |
| Neo4j (container)                | **Neo4j Aura** (managed) or self-managed Neo4j on EC2 with EBS-backed storage    | Aura removes operational burden; self-managed needed if GDS licensing/on-prem requirements apply. |
| Kafka (container, KRaft)         | **Amazon MSK** (or keep self-hosted KRaft on EC2 if avoiding MSK's per-broker cost) | Managed brokers, IAM-based auth, encryption in transit by default. |
| NestJS backend / FastAPI ai-service / React frontend | **ECS Fargate** (simplest: no node/cluster management) or **EKS** if the team already runs Kubernetes elsewhere | Same Docker images from this repo's Dockerfiles — build once, push to **ECR**, deploy via Fargate task definitions. |
| Airflow                          | **Amazon MWAA** (Managed Workflows for Apache Airflow)                           | Removes the need to operate the webserver/scheduler/metadata-DB triplet yourself; DAGs in this repo (`airflow/dags/`) deploy unchanged to MWAA's S3 DAG bucket. |
| Hyperledger Fabric network       | Self-managed on **EC2** (Fabric has no first-party AWS managed offering) — one org's peers/CA per AWS account if orgs are genuinely separate legal entities, connected via **VPC peering / Transit Gateway** or a managed VPN | This is the one component that doesn't have an AWS managed equivalent; **Amazon Managed Blockchain's Hyperledger Fabric support was retired in 2024**, so self-hosting on EC2 (or evaluating a different managed BaaS vendor) is the real path, not a Managed Blockchain shortcut. |
| Load balancing / TLS             | **Application Load Balancer** + **ACM** certificates                            | Terminates TLS in front of ECS services; backend/frontend stay HTTP internally. |
| Secrets (`JWT_SECRET`, `INTERNAL_SERVICE_KEY`, Fabric identity keys) | **AWS Secrets Manager**, injected as ECS task environment via `secrets:` (not `environment:`) | Never bake these into images or plain task-def env vars; rotate `JWT_SECRET`/`INTERNAL_SERVICE_KEY` on a schedule via Secrets Manager rotation Lambdas. |
| Monitoring/logs                  | **CloudWatch Logs** (ECS awslogs driver) + **CloudWatch Alarms** on the same health endpoints already built (`/api/health`, `/health`) | These endpoints already check every downstream dependency — wire an ALB target-group health check and a CloudWatch alarm straight to them. |
| Container registry               | **ECR** (one repo per service: backend, ai-service, frontend) | |

## What doesn't change

- The application code itself. Every service already reads its connection info
  from environment variables (`DATABASE_URL`, `NEO4J_URI`, `REDIS_HOST`,
  `MINIO_ENDPOINT`, `KAFKA_BOOTSTRAP_SERVERS`, `AI_SERVICE_URL`,
  `LEDGER_PEER_ENDPOINT`, ...) — production deployment is a config change, not
  a code change.
- The MinIO → S3 swap is literally an endpoint + credential change in
  `backend/src/common/minio.service.ts` and `ai-service/app/deps.py` (both
  already use S3-compatible clients).
- The design boundaries in the main README (Neo4j owns the graph, the ledger
  only stores hashes, provenance is mandatory at creation time) apply
  identically in production — nothing about moving to AWS should be used as
  an excuse to relax them.

## Fabric network in production

- Replace `cryptogen` (offline, static certs) with **Fabric CA servers** per
  org, so identities can be issued/revoked without regenerating the whole
  network.
- Move from a single-node etcdraft orderer to **3 or 5 nodes** across AZs for
  real fault tolerance.
- If InvestigationAuthority and Oversight are genuinely separate
  organizations (not just logical separation within one team), each should
  run its **own peer(s) in its own AWS account/VPC**, connected via VPC
  peering or a Transit Gateway — this is what makes the "permissioned,
  multi-party" property real rather than nominal.
- Keep the endorsement policy decision from `blockchain/README.md` in mind:
  requiring every org to co-endorse every write means the investigating org's
  day-to-day operations depend on every oversight org's peer being online.
  Decide deliberately per deployment whether that tradeoff is acceptable for
  the oversight relationship in question.

## Scaling the ingestion path

- Kafka topics beyond `document-uploaded` (already wired) — `cdr-record`,
  `financial-transaction`, `osint-record` (declared in
  `backend/src/kafka/kafka-producer.service.ts`'s `KAFKA_TOPICS` but not yet
  produced to) — are where high-volume CDR/transaction/OSINT streaming
  ingestion plugs in. Each needs a producer (wherever that feed originates —
  a telecom provider's API, a bank's transaction feed, an OSINT collector)
  and a consumer in `ai-service` mirroring `kafka_consumer.py`'s existing
  pattern, feeding the same extraction pipeline documents already go through.
- MWAA DAG concurrency and worker sizing should scale with expected batch
  volume — the `batch_historical_ingestion` DAG here processes files
  sequentially in one task; at real volume, switch to Airflow's dynamic task
  mapping (one mapped task instance per file) so failures isolate per-file
  instead of failing the whole batch.
