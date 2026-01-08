import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WebsocketGateway } from './websocket.gateway';
import { PrismaService } from '../prisma.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { ControlPanelModule } from '../control-panel/control-panel.module';
import { MediaModule } from '../media/media.module';
import { LinesModule } from '../lines/lines.module';
import { SystemEventsModule } from '../system-events/system-events.module';
import { HumanizationModule } from '../humanization/humanization.module';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';
import { SpintaxModule } from '../spintax/spintax.module';
import { HealthCheckCacheModule } from '../health-check-cache/health-check-cache.module';
import { LineReputationModule } from '../line-reputation/line-reputation.module';
import { PhoneValidationModule } from '../phone-validation/phone-validation.module';
import { LineAssignmentModule } from '../line-assignment/line-assignment.module';
import { MessageValidationModule } from '../message-validation/message-validation.module';
import { MessageSendingModule } from '../message-sending/message-sending.module';
import { LoggerModule } from '../logger/logger.module';
import { TemplatesModule } from '../templates/templates.module';
import { OperatorQueueModule } from '../operator-queue/operator-queue.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
      }),
    }),
    forwardRef(() => ConversationsModule),
    ControlPanelModule,
    MediaModule,
    forwardRef(() => LinesModule),
    SystemEventsModule,
    HumanizationModule,
    RateLimitingModule,
    SpintaxModule,
    HealthCheckCacheModule,
    LineReputationModule,
    PhoneValidationModule,
    LineAssignmentModule,
    MessageValidationModule,
    MessageSendingModule,
    LoggerModule,
    TemplatesModule,
    forwardRef(() => OperatorQueueModule),
  ],
  providers: [WebsocketGateway, PrismaService],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}
