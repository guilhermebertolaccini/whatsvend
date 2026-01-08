import { Module } from '@nestjs/common';
import { MessageValidationService } from './message-validation.service';
import { PrismaService } from '../prisma.service';
import { ControlPanelModule } from '../control-panel/control-panel.module';
import { PhoneValidationModule } from '../phone-validation/phone-validation.module';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';
import { LineReputationModule } from '../line-reputation/line-reputation.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [
    ControlPanelModule,
    PhoneValidationModule,
    RateLimitingModule,
    LineReputationModule,
    LoggerModule,
  ],
  providers: [MessageValidationService, PrismaService],
  exports: [MessageValidationService],
})
export class MessageValidationModule {}

