import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import { connect, Contract, Gateway, Identity, Signer, signers } from '@hyperledger/fabric-gateway';

export interface LedgerEvent {
  eventId: string;
  eventType: string;
  caseId: string;
  hash: string;
  actorId: string;
  actorRole: string;
  timestamp: string;
  metadata: string;
  recordedAt: string;
}

// Wraps the permissioned Hyperledger Fabric ledger (see blockchain/network)
// as a tamper-evidence verification anchor, per the spec's design principle:
// this is queryable for "was this tampered with", never for "what does this
// evidence say" - callers only ever pass hashes and minimal metadata here.
@Injectable()
export class LedgerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LedgerService.name);
  private client: grpc.Client | null = null;
  private gateway: Gateway | null = null;
  private contract: Contract | null = null;
  private readonly enabled: boolean;
  private readonly channelName: string;
  private readonly chaincodeName: string;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<string>('LEDGER_ENABLED', 'true') === 'true';
    this.channelName = this.config.get<string>('LEDGER_CHANNEL_NAME', 'auditchannel');
    this.chaincodeName = this.config.get<string>('LEDGER_CHAINCODE_NAME', 'auditledger');
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Ledger integration disabled (LEDGER_ENABLED=false)');
      return;
    }
    try {
      const identityDir = this.config.get<string>('LEDGER_IDENTITY_DIR', '/ledger-identity');
      const mspId = this.config.get<string>('LEDGER_MSP_ID', 'InvestigationAuthorityMSP');
      const peerEndpoint = this.config.get<string>(
        'LEDGER_PEER_ENDPOINT',
        'peer0.investigationauthority.iis.local:7051',
      );
      const hostAlias = peerEndpoint.split(':')[0];

      const certPath = path.join(
        identityDir,
        'users/Admin@investigationauthority.iis.local/msp/signcerts/Admin@investigationauthority.iis.local-cert.pem',
      );
      const keyPath = path.join(
        identityDir,
        'users/Admin@investigationauthority.iis.local/msp/keystore/priv_sk',
      );
      const tlsCertPath = path.join(
        identityDir,
        'peers/peer0.investigationauthority.iis.local/tls/ca.crt',
      );

      const tlsRootCert = fs.readFileSync(tlsCertPath);
      this.client = new grpc.Client(peerEndpoint, grpc.credentials.createSsl(tlsRootCert), {
        'grpc.ssl_target_name_override': hostAlias,
      });

      const identity: Identity = { mspId, credentials: fs.readFileSync(certPath) };
      const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
      const signer: Signer = signers.newPrivateKeySigner(privateKey);

      this.gateway = connect({ client: this.client, identity, signer });
      const network = this.gateway.getNetwork(this.channelName);
      this.contract = network.getContract(this.chaincodeName);

      this.logger.log(`Connected to permissioned ledger at ${peerEndpoint} (channel=${this.channelName})`);
    } catch (err) {
      this.logger.error(
        `Failed to connect to permissioned ledger - audit events will be recorded to Postgres only: ${(err as Error).message}`,
      );
      this.gateway = null;
      this.contract = null;
    }
  }

  onModuleDestroy() {
    this.gateway?.close();
    this.client?.close();
  }

  get isConnected(): boolean {
    return this.contract !== null;
  }

  async recordEvent(input: {
    eventId: string;
    eventType: string;
    caseId: string;
    hash: string;
    actorId: string;
    actorRole: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ txId: string } | null> {
    if (!this.contract) return null;
    const result = await this.contract.submitTransaction(
      'RecordEvent',
      input.eventId,
      input.eventType,
      input.caseId,
      input.hash,
      input.actorId,
      input.actorRole,
      input.timestamp,
      JSON.stringify(input.metadata ?? {}),
    );
    void result; // RecordEvent returns void; the transaction id is what we anchor against
    return { txId: input.eventId };
  }

  async getEvent(eventId: string): Promise<LedgerEvent | null> {
    if (!this.contract) return null;
    const bytes = await this.contract.evaluateTransaction('GetEvent', eventId);
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  }

  async verifyHash(eventId: string, hash: string): Promise<{ matches: boolean; storedHash: string } | null> {
    if (!this.contract) return null;
    const bytes = await this.contract.evaluateTransaction('VerifyHash', eventId, hash);
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  }

  async getEventsByCase(caseId: string): Promise<LedgerEvent[] | null> {
    if (!this.contract) return null;
    const bytes = await this.contract.evaluateTransaction('GetEventsByCase', caseId);
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  }
}
