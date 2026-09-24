import { Global, Module } from '@nestjs/common';
import { Neo4jService } from './neo4j.service';
import { RedisService } from './redis.service';
import { MinioService } from './minio.service';

@Global()
@Module({
  providers: [Neo4jService, RedisService, MinioService],
  exports: [Neo4jService, RedisService, MinioService],
})
export class CommonModule {}
