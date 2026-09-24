#!/bin/bash
# Generates crypto material (cryptogen) and the orderer genesis block +
# channel creation transaction (configtxgen) - all via the fabric-tools
# image, so no host-native Fabric binaries are required (this project runs
# on Windows/Docker Desktop, and Fabric doesn't ship Windows CLI binaries).
set -e
cd "$(dirname "$0")/.."
NETDIR="$(pwd)"
# Git Bash (MSYS) rewrites any argument that looks like a Unix path (e.g.
# "/cryptogen") into a Windows path before it reaches docker - disable that.
export MSYS_NO_PATHCONV=1

rm -rf organizations channel-artifacts
mkdir -p channel-artifacts

echo "==> Generating crypto material (cryptogen)"
docker run --rm \
  -v "$NETDIR/config/crypto-config.yaml:/cryptogen/crypto-config.yaml" \
  -v "$NETDIR/organizations:/cryptogen/organizations" \
  -w /cryptogen \
  hyperledger/fabric-tools:2.5 \
  cryptogen generate --config=./crypto-config.yaml --output=./organizations

echo "==> Generating orderer genesis block (configtxgen)"
docker run --rm \
  -v "$NETDIR/config:/config" \
  -v "$NETDIR/organizations:/organizations" \
  -v "$NETDIR/channel-artifacts:/channel-artifacts" \
  -e FABRIC_CFG_PATH=/config \
  -w /config \
  hyperledger/fabric-tools:2.5 \
  configtxgen -profile AuditOrdererGenesis -channelID system-channel -outputBlock /channel-artifacts/genesis.block

echo "==> Generating channel creation transaction (configtxgen)"
docker run --rm \
  -v "$NETDIR/config:/config" \
  -v "$NETDIR/organizations:/organizations" \
  -v "$NETDIR/channel-artifacts:/channel-artifacts" \
  -e FABRIC_CFG_PATH=/config \
  -w /config \
  hyperledger/fabric-tools:2.5 \
  configtxgen -profile AuditChannel -outputCreateChannelTx /channel-artifacts/auditchannel.tx -channelID auditchannel

echo "==> Done. Crypto material in ./organizations, artifacts in ./channel-artifacts"
