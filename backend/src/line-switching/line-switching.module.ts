import { Module, forwardRef } from '@nestjs/common';
import { LineSwitchingService } from './line-switching.service';
import { PrismaService } from '../prisma.service';
import { LinesModule } from '../lines/lines.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { AppLoggerService } from '../logger/logger.service';

@Module({
  imports: [
    forwardRef(() => LinesModule),
    forwardRef(() => WebsocketModule),
  ],
  providers: [LineSwitchingService, PrismaService, AppLoggerService],
  exports: [LineSwitchingService],
})
export class LineSwitchingModule {}
