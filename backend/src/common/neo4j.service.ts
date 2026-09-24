import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver, Session } from 'neo4j-driver';

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private driver: Driver;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.driver = neo4j.driver(
      this.config.get<string>('NEO4J_URI', 'bolt://neo4j:7687'),
      neo4j.auth.basic(
        this.config.get<string>('NEO4J_USER', 'neo4j'),
        this.config.get<string>('NEO4J_PASSWORD', 'neo4jpassword'),
      ),
    );
  }

  async onModuleDestroy() {
    await this.driver?.close();
  }

  getSession(): Session {
    return this.driver.session();
  }

  async verifyConnectivity(): Promise<boolean> {
    try {
      await this.driver.verifyConnectivity();
      return true;
    } catch {
      return false;
    }
  }

  async run(cypher: string, params: Record<string, unknown> = {}) {
    const session = this.getSession();
    try {
      return await session.run(cypher, params);
    } finally {
      await session.close();
    }
  }
}
