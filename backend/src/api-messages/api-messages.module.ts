import { Module, forwardRef } from '@nestjs/common';
import { ApiMessagesService } from './api-messages.service';
import { ApiMessagesController } from './api-messages.controller';
import { PrismaService } from '../prisma.service';
import { TagsModule } from '../tags/tags.module';
import { ApiLogsModule } from '../api-logs/api-logs.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ContactsModule } from '../contacts/contacts.module';
import { HumanizationModule } from '../humanization/humanization.module';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';
import { SpintaxModule } from '../spintax/spintax.module';
import { HealthCheckCacheModule } from '../health-check-cache/health-check-cache.module';
import { LineReputationModule } from '../line-reputation/line-reputation.module';
import { PhoneValidationModule } from '../phone-validation/phone-validation.module';
import { LinesModule } from '../lines/lines.module';
import { ControlPanelModule } from '../control-panel/control-panel.module';

@Module({
  imports: [
    TagsModule, 
    ApiLogsModule, 
    ConversationsModule, 
    ContactsModule, 
    HumanizationModule, 
    RateLimitingModule,
    SpintaxModule,
    HealthCheckCacheModule,
    LineReputationModule,
    PhoneValidationModule,
    forwardRef(() => LinesModule),
    ControlPanelModule,
  ],
  controllers: [ApiMessagesController],
  providers: [ApiMessagesService, PrismaService],
})
export class ApiMessagesModule {}

