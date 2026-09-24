#!/bin/bash
set -e
CHANNEL_NAME=auditchannel
CC_NAME=auditledger
CC_VERSION=1.0
CC_SEQUENCE=1
ORDERER_ADDR=orderer1.orderer.iis.local:7050
ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/orderer.iis.local/msp/tlscacerts/tlsca.orderer.iis.local-cert.pem

INV_ENV="
  export CORE_PEER_LOCALMSPID=InvestigationAuthorityMSP
  export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/investigationauthority.iis.local/users/Admin@investigationauthority.iis.local/msp
  export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/investigationauthority.iis.local/peers/peer0.investigationauthority.iis.local/tls/ca.crt
  export CORE_PEER_ADDRESS=peer0.investigationauthority.iis.local:7051
"
OVR_ENV="
  export CORE_PEER_LOCALMSPID=OversightMSP
  export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/oversight.iis.local/users/Admin@oversight.iis.local/msp
  export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/oversight.iis.local/peers/peer0.oversight.iis.local/tls/ca.crt
  export CORE_PEER_ADDRESS=peer0.oversight.iis.local:9051
"

exec_cli() {
  docker exec fabric-cli bash -c "$1"
}

echo "==> Packaging chaincode"
exec_cli "
  cd /opt/gopath/src/github.com/hyperledger/fabric/peer
  peer lifecycle chaincode package ${CC_NAME}.tar.gz \
    --path ./chaincode/audit-ledger \
    --lang node \
    --label ${CC_NAME}_${CC_VERSION}
"

echo "==> Installing on InvestigationAuthority peer"
exec_cli "$INV_ENV
  cd /opt/gopath/src/github.com/hyperledger/fabric/peer
  peer lifecycle chaincode install ${CC_NAME}.tar.gz
"

echo "==> Installing on Oversight peer"
exec_cli "$OVR_ENV
  cd /opt/gopath/src/github.com/hyperledger/fabric/peer
  peer lifecycle chaincode install ${CC_NAME}.tar.gz
"

echo "==> Querying package ID"
PACKAGE_ID=$(docker exec fabric-cli bash -c "$INV_ENV
  peer lifecycle chaincode queryinstalled" | grep -o "${CC_NAME}_${CC_VERSION}:[a-f0-9]*" | head -1)
echo "Package ID: $PACKAGE_ID"

echo "==> Approving for InvestigationAuthority"
exec_cli "$INV_ENV
  peer lifecycle chaincode approveformyorg -o $ORDERER_ADDR --tls --cafile $ORDERER_CA \
    --channelID $CHANNEL_NAME --name $CC_NAME --version $CC_VERSION --sequence $CC_SEQUENCE \
    --package-id $PACKAGE_ID
"

echo "==> Approving for Oversight"
exec_cli "$OVR_ENV
  peer lifecycle chaincode approveformyorg -o $ORDERER_ADDR --tls --cafile $ORDERER_CA \
    --channelID $CHANNEL_NAME --name $CC_NAME --version $CC_VERSION --sequence $CC_SEQUENCE \
    --package-id $PACKAGE_ID
"

echo "==> Checking commit readiness"
exec_cli "$INV_ENV
  peer lifecycle chaincode checkcommitreadiness -o $ORDERER_ADDR --tls --cafile $ORDERER_CA \
    --channelID $CHANNEL_NAME --name $CC_NAME --version $CC_VERSION --sequence $CC_SEQUENCE --output json
"

echo "==> Committing chaincode definition"
exec_cli "$INV_ENV
  peer lifecycle chaincode commit -o $ORDERER_ADDR --tls --cafile $ORDERER_CA \
    --channelID $CHANNEL_NAME --name $CC_NAME --version $CC_VERSION --sequence $CC_SEQUENCE \
    --peerAddresses peer0.investigationauthority.iis.local:7051 \
    --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/investigationauthority.iis.local/peers/peer0.investigationauthority.iis.local/tls/ca.crt \
    --peerAddresses peer0.oversight.iis.local:9051 \
    --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/oversight.iis.local/peers/peer0.oversight.iis.local/tls/ca.crt
"

echo "==> Chaincode '$CC_NAME' committed to channel '$CHANNEL_NAME'"
