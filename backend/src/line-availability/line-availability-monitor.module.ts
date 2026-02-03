import { Module, forwardRef } from '@nestjs/common';
import { LineAvailabilityMonitorService } from './line-availability-monitor.service';
import { LineAvailabilityController } from './line-availability-monitor.controller';
import { PrismaService } from '../prisma.service';
import { LinesModule } from '../lines/lines.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { OperatorQueueModule } from '../operator-queue/operator-queue.module';
import { LineSwitchingModule } from '../line-switching/line-switching.module';
import { HealthCheckCacheModule } from '../health-check-cache/health-check-cache.module';
import { LineAssignmentModule } from '../line-assignment/line-assignment.module';
import { AppLoggerService } from '../logger/logger.service';

@Module({
  imports: [
    forwardRef(() => LinesModule),
    forwardRef(() => WebsocketModule),
    forwardRef(() => OperatorQueueModule),
    forwardRef(() => LineSwitchingModule),
    HealthCheckCacheModule,
    LineAssignmentModule,
  ],
  providers: [LineAvailabilityMonitorService, PrismaService, AppLoggerService],
  controllers: [LineAvailabilityController],
  exports: [LineAvailabilityMonitorService],
})
export class LineAvailabilityMonitorModule {}
