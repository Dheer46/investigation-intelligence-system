import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

export const KAFKA_TOPICS = {
  DOCUMENT_UPLOADED: 'document-uploaded',
  CDR_RECORD: 'cdr-record',
  FINANCIAL_TRANSACTION: 'financial-transaction',
  OSINT_RECORD: 'osint-record',
} as const;

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;
  private connected = false;

  constructor(private readonly config: ConfigService) {
    this.kafka = new Kafka({
      clientId: 'iis-backend',
      brokers: [this.config.get<string>('KAFKA_BOOTSTRAP_SERVERS', 'kafka:9092')],
      retry: { retries: 5 },
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.log('Kafka producer connected');
    } catch (err) {
      this.logger.warn(`Kafka producer failed to connect at startup: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.producer.disconnect();
    }
  }

  async emit(topic: string, event: Record<string, unknown>) {
    if (!this.connected) {
      try {
        await this.producer.connect();
        this.connected = true;
      } catch (err) {
        this.logger.error(`Kafka unavailable, dropping event on topic ${topic}: ${(err as Error).message}`);
        return;
      }
    }
    await this.producer.send({
      topic,
      messages: [{ value: JSON.stringify(event) }],
    });
  }
}
