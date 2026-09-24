# Permissioned Ledger (Hyperledger Fabric)

A real 2-organization Fabric network — not a simulation — providing tamper-evident
audit anchors for the Investigation Intelligence System. It runs as its own
Docker Compose project, independent of the main application stack, and the
NestJS backend connects to it as a client (see `backend/src/ledger/`).

## Why two organizations

- **InvestigationAuthorityMSP** — the operating investigative body. The backend
  always transacts as this org.
- **OversightMSP** — an independent body (e.g. judicial/audit oversight) that
  maintains its own full copy of the ledger and can independently verify any
  record was not tampered with, without depending on the investigating org's
  systems. It does not co-endorse routine writes (see chaincode endorsement
  policy below) — that would make basic operations depend on the oversight
  org's peer being online, which isn't how such relationships work in practice.
  Its value is an independently-held, byte-for-byte copy of the ledger.

## What's on-chain vs off-chain

Per the architecture spec: only hashes and minimal metadata are ever written to
the chaincode (`RecordEvent`). Full documents, PII, and bulk evidence content
never leave PostgreSQL/MinIO. The ledger is queryable for "was this tampered
with" (`VerifyHash`), never for "what does this evidence say."

## Bringing the network up

Requires Docker only — no host-installed Fabric binaries (all `cryptogen` /
`configtxgen` / `peer` CLI calls run inside `hyperledger/fabric-tools`
containers, since Fabric doesn't ship Windows binaries).

```bash
cd blockchain/network

# 1. Generate crypto material + genesis block + channel tx (idempotent - wipes
#    and regenerates ./organizations and ./channel-artifacts each run)
bash scripts/generate.sh

# 2. Start the network (orderer, 2 peers, CLI helper)
docker compose up -d

# 3. Create the channel and join both peers
bash scripts/create-channel.sh

# 4. Build, package, install, approve, and commit the chaincode
cd ../chaincode/audit-ledger && npm install && npm run build && cd ../../network
bash scripts/deploy-chaincode.sh
```

If `deploy-chaincode.sh` fails at the install step because it's already
installed (safe to ignore on a re-run), skip straight to the approve/commit
commands shown in the script.

**Windows/Git Bash note:** every `docker run`/`docker exec` call in these
scripts needs `MSYS_NO_PATHCONV=1` set (already done inside the scripts) -
otherwise Git Bash silently rewrites container paths like `/config` into
Windows paths and docker fails with confusing errors.

## Connecting the main app

The main `docker-compose.yml` (project root) attaches the `backend` service to
this network's `iis-ledger-net` (declared `external: true`) and bind-mounts
`InvestigationAuthorityMSP`'s admin identity read-only into the backend
container at `/ledger-identity`. Bring the ledger network up **before**
`docker compose up` on the main stack, or the backend will simply log a
warning and run with ledger anchoring disabled (Postgres audit logging still
works either way — see `AuditLogService`).

## Chaincode

`chaincode/audit-ledger` (TypeScript, `fabric-contract-api`) exposes:

| Function | Purpose |
|---|---|
| `RecordEvent(eventId, eventType, caseId, hash, actorId, actorRole, timestamp, metadata)` | Append-only write; errors if `eventId` already exists |
| `GetEvent(eventId)` | Read one anchored event |
| `VerifyHash(eventId, hash)` | Returns `{matches, storedHash}` — the actual tamper-detection primitive |
| `GetEventsByCase(caseId)` | All anchored events for a case (via composite-key index, works on goleveldb — no CouchDB needed) |

`eventType` is one of `EVIDENCE_REGISTRATION`, `EVIDENCE_HANDOFF`,
`INVESTIGATION_EVENT`, `APPROVAL`, `AUDIT_CHECKPOINT` (see
`backend/src/audit/ledger-event-mapping.ts` for which app actions map to which).

## Re-deploying the chaincode after a change

Bump `CC_VERSION` and `CC_SEQUENCE` in `scripts/deploy-chaincode.sh`, rebuild
(`npm run build` in the chaincode dir), then re-run the script.

## Known limitations (documented tradeoffs, not oversights)

- **cryptogen, not Fabric CA**: identities are generated offline as static
  X.509 certs rather than issued by a live CA server. Still genuinely
  permissioned (only these certs can transact), just not dynamically
  enrollable. Swapping in `fabric-ca-server` per org is the natural next step
  for a real deployment.
- **Single-node orderer**: etcdraft with one node, not the 3+ nodes a
  production deployment needs for orderer fault tolerance.
- **goleveldb, not CouchDB**: no rich JSON queries against chaincode state;
  `GetEventsByCase` uses a composite-key range query instead, which is
  sufficient for this chaincode's access patterns.
