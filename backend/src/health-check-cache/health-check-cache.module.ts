import { Module } from '@nestjs/common';
import { HealthCheckCacheService } from './health-check-cache.service';

@Module({
  providers: [HealthCheckCacheService],
  exports: [HealthCheckCacheService],
})
export class HealthCheckCacheModule {}

