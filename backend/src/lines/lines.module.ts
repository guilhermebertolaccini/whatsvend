import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LinesService } from './lines.service';
import { LinesSchedulerService } from './lines-scheduler.service';
import { LinesController } from './lines.controller';
import { PrismaService } from '../prisma.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { ControlPanelModule } from '../control-panel/control-panel.module';
import { SystemEventsModule } from '../system-events/system-events.module';
import { HealthCheckCacheModule } from '../health-check-cache/health-check-cache.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    forwardRef(() => WebsocketModule),
    ControlPanelModule,
    SystemEventsModule,
    HealthCheckCacheModule,
  ],
  controllers: [LinesController],
  providers: [LinesService, LinesSchedulerService, PrismaService],
  exports: [LinesService],
})
export class LinesModule {}
