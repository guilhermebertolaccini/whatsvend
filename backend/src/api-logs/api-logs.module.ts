import { Module } from '@nestjs/common';
import { ApiLogsService } from './api-logs.service';
import { ApiLogsController } from './api-logs.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ApiLogsController],
  providers: [ApiLogsService, PrismaService],
  exports: [ApiLogsService],
})
export class ApiLogsModule {}

