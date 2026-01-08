import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsProcessor } from './campaigns.processor';
import { PrismaService } from '../prisma.service';
import { ContactsModule } from '../contacts/contacts.module';
import { UsersModule } from '../users/users.module';
import { BlocklistModule } from '../blocklist/blocklist.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';
import { LineReputationModule } from '../line-reputation/line-reputation.module';
import { LoggerModule } from '../logger/logger.module';
import { PhoneValidationModule } from '../phone-validation/phone-validation.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'campaigns',
    }),
    ContactsModule,
    UsersModule,
    BlocklistModule,
    ConversationsModule,
    RateLimitingModule,
    LineReputationModule,
    LoggerModule,
    PhoneValidationModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignsProcessor, PrismaService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
