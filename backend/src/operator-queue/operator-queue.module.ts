import { Module, forwardRef } from '@nestjs/common';
import { OperatorQueueService } from './operator-queue.service';
import { PrismaService } from '../prisma.service';
import { LinesModule } from '../lines/lines.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { AppLoggerService } from '../logger/logger.service';

@Module({
  imports: [
    forwardRef(() => LinesModule),
    forwardRef(() => WebsocketModule),
  ],
  providers: [OperatorQueueService, PrismaService, AppLoggerService],
  exports: [OperatorQueueService],
})
export class OperatorQueueModule {}
