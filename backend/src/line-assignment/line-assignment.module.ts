import { Module, forwardRef } from '@nestjs/common';
import { LineAssignmentService } from './line-assignment.service';
import { PrismaService } from '../prisma.service';
import { LinesModule } from '../lines/lines.module';
import { ControlPanelModule } from '../control-panel/control-panel.module';
import { LoggerModule } from '../logger/logger.module';
import { HealthCheckCacheModule } from '../health-check-cache/health-check-cache.module';
import { OperatorQueueModule } from '../operator-queue/operator-queue.module';

@Module({
  imports: [
    HealthCheckCacheModule,
    forwardRef(() => LinesModule),
    forwardRef(() => OperatorQueueModule),
    ControlPanelModule,
    LoggerModule,
  ],
  providers: [LineAssignmentService, PrismaService],
  exports: [LineAssignmentService],
})
export class LineAssignmentModule { }

