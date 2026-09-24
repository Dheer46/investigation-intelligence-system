#!/bin/bash
set -e
CHANNEL_NAME=auditchannel
ORDERER_ADDR=orderer1.orderer.iis.local:7050
ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/orderer.iis.local/msp/tlscacerts/tlsca.orderer.iis.local-cert.pem

exec_cli() {
  docker exec fabric-cli bash -c "$1"
}

echo "==> Fetching orderer system-channel genesis and creating application channel"
exec_cli "
  export CORE_PEER_LOCALMSPID=InvestigationAuthorityMSP
  export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/investigationauthority.iis.local/users/Admin@investigationauthority.iis.local/msp
  export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/investigationauthority.iis.local/peers/peer0.investigationauthority.iis.local/tls/ca.crt
  export CORE_PEER_ADDRESS=peer0.investigationauthority.iis.local:7051
  peer channel create -o $ORDERER_ADDR -c $CHANNEL_NAME \
    -f ./channel-artifacts/auditchannel.tx \
    --outputBlock ./channel-artifacts/${CHANNEL_NAME}.block \
    --tls --cafile $ORDERER_CA
"

echo "==> Joining peer0.investigationauthority to $CHANNEL_NAME"
exec_cli "
  export CORE_PEER_LOCALMSPID=InvestigationAuthorityMSP
  export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/investigationauthority.iis.local/users/Admin@investigationauthority.iis.local/msp
  export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/investigationauthority.iis.local/peers/peer0.investigationauthority.iis.local/tls/ca.crt
  export CORE_PEER_ADDRESS=peer0.investigationauthority.iis.local:7051
  peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block
"

echo "==> Joining peer0.oversight to $CHANNEL_NAME"
exec_cli "
  export CORE_PEER_LOCALMSPID=OversightMSP
  export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/oversight.iis.local/users/Admin@oversight.iis.local/msp
  export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/oversight.iis.local/peers/peer0.oversight.iis.local/tls/ca.crt
  export CORE_PEER_ADDRESS=peer0.oversight.iis.local:9051
  peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block
"

echo "==> Channel '$CHANNEL_NAME' created and both peers joined."
