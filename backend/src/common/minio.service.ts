import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  public client: Client;
  public readonly evidenceBucket: string;

  constructor(private readonly config: ConfigService) {
    this.evidenceBucket = this.config.get<string>('MINIO_EVIDENCE_BUCKET', 'evidence');
    this.client = new Client({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', 'minio'),
      port: this.config.get<number>('MINIO_PORT', 9000),
      useSSL: false,
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.evidenceBucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.evidenceBucket).catch(() => undefined);
    }
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.client.bucketExists(this.evidenceBucket);
      return true;
    } catch {
      return false;
    }
  }
}
