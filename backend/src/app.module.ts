import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from './prisma.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SegmentsModule } from './segments/segments.module';
import { TabulationsModule } from './tabulations/tabulations.module';
import { ContactsModule } from './contacts/contacts.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { BlocklistModule } from './blocklist/blocklist.module';
import { LinesModule } from './lines/lines.module';
import { EvolutionModule } from './evolution/evolution.module';
import { ConversationsModule } from './conversations/conversations.module';
import { WebsocketModule } from './websocket/websocket.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ReportsModule } from './reports/reports.module';
import { MediaModule } from './media/media.module';
import { TagsModule } from './tags/tags.module';
import { ApiLogsModule } from './api-logs/api-logs.module';
import { ApiMessagesModule } from './api-messages/api-messages.module';
import { TemplatesModule } from './templates/templates.module';
import { ControlPanelModule } from './control-panel/control-panel.module';
import { HealthController } from './health/health.controller';
import { MessageQueueModule } from './message-queue/message-queue.module';
import { SystemEventsModule } from './system-events/system-events.module';
import { LoggerModule } from './logger/logger.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import { LineAssignmentModule } from './line-assignment/line-assignment.module';
import { MessageValidationModule } from './message-validation/message-validation.module';
import { MessageSendingModule } from './message-sending/message-sending.module';
import { CacheModule } from './cache/cache.module';
import { ArchivingModule } from './archiving/archiving.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule,
    CircuitBreakerModule,
    LineAssignmentModule,
    MessageValidationModule,
    MessageSendingModule,
    CacheModule,
    ArchivingModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB) : undefined,
      },
    }),
    AuthModule,
    UsersModule,
    SegmentsModule,
    TabulationsModule,
    ContactsModule,
    CampaignsModule,
    BlocklistModule,
    LinesModule,
    EvolutionModule,
    ConversationsModule,
    WebsocketModule,
    WebhooksModule,
    ReportsModule,
    MediaModule,
    TagsModule,
    ApiLogsModule,
    ApiMessagesModule,
    TemplatesModule,
    ControlPanelModule,
    MessageQueueModule,
    SystemEventsModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
