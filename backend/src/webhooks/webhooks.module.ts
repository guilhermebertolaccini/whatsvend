import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { LinesModule } from '../lines/lines.module';
import { MediaModule } from '../media/media.module';
import { ControlPanelModule } from '../control-panel/control-panel.module';
import { BlocklistModule } from '../blocklist/blocklist.module';
import { TabulationsModule } from '../tabulations/tabulations.module';
import { SystemEventsModule } from '../system-events/system-events.module';

@Module({
  imports: [
    ConversationsModule,
    WebsocketModule,
    LinesModule,
    MediaModule,
    ControlPanelModule,
    BlocklistModule,
    TabulationsModule,
    SystemEventsModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, PrismaService],
})
export class WebhooksModule {}
