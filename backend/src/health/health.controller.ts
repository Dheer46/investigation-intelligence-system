import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Neo4jService } from '../common/neo4j.service';
import { RedisService } from '../common/redis.service';
import { MinioService } from '../common/minio.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly neo4j: Neo4jService,
    private readonly redis: RedisService,
    private readonly minio: MinioService,
  ) {}

  @Get()
  async check() {
    const [postgres, neo4jUp, redisUp, minioUp] = await Promise.all([
      this.prisma
        .$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false),
      this.neo4j.verifyConnectivity(),
      this.redis.ping(),
      this.minio.isReachable(),
    ]);

    const dependencies = { postgres, neo4j: neo4jUp, redis: redisUp, minio: minioUp };
    const healthy = Object.values(dependencies).every(Boolean);

    return {
      status: healthy ? 'ok' : 'degraded',
      service: 'iis-backend',
      dependencies,
      timestamp: new Date().toISOString(),
    };
  }
}
