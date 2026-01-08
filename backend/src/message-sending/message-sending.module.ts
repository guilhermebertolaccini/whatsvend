import { Module } from '@nestjs/common';
import { MessageSendingService } from './message-sending.service';
import { PrismaService } from '../prisma.service';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';
import { LoggerModule } from '../logger/logger.module';
import { HumanizationModule } from '../humanization/humanization.module';
import { SpintaxModule } from '../spintax/spintax.module';
import { PhoneValidationModule } from '../phone-validation/phone-validation.module';

@Module({
  imports: [
    CircuitBreakerModule,
    LoggerModule,
    HumanizationModule,
    SpintaxModule,
    PhoneValidationModule,
  ],
  providers: [MessageSendingService, PrismaService],
  exports: [MessageSendingService],
})
export class MessageSendingModule {}

