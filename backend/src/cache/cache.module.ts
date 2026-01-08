import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { LoggerModule } from '../logger/logger.module';
import { redisStore } from 'cache-manager-redis-yet';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisHost = configService.get('REDIS_HOST') || 'localhost';
        const redisPort = configService.get('REDIS_PORT') || 6379;
        const redisPassword = configService.get('REDIS_PASSWORD');
        const redisUsername = configService.get('REDIS_USERNAME');
        const redisDb = configService.get('REDIS_DB') || 0;

        return {
          store: redisStore,
          host: redisHost,
          port: redisPort,
          password: redisPassword,
          username: redisUsername,
          db: redisDb,
          ttl: 300, // TTL padrão: 5 minutos
          max: 1000, // Máximo de itens no cache
        };
      },
    }),
    LoggerModule,
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}

