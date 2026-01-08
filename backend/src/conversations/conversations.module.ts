import { Module, forwardRef } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { AutoMessageService } from './auto-message.service';
import { PrismaService } from '../prisma.service';
import { ControlPanelModule } from '../control-panel/control-panel.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SystemEventsModule } from '../system-events/system-events.module';
import { HumanizationModule } from '../humanization/humanization.module';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';
import { SpintaxModule } from '../spintax/spintax.module';
import { LineReputationModule } from '../line-reputation/line-reputation.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ControlPanelModule,
    forwardRef(() => WebsocketModule),
    SystemEventsModule,
    HumanizationModule,
    RateLimitingModule,
    SpintaxModule,
    LineReputationModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, AutoMessageService, PrismaService],
  exports: [ConversationsService, AutoMessageService],
})
export class ConversationsModule {}
