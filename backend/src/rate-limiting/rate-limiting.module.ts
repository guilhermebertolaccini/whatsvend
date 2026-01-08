import { Module, forwardRef } from '@nestjs/common';
import { RateLimitingService } from './rate-limiting.service';
import { PrismaService } from '../prisma.service';
import { LineReputationModule } from '../line-reputation/line-reputation.module';

@Module({
  imports: [forwardRef(() => LineReputationModule)],
  providers: [RateLimitingService, PrismaService],
  exports: [RateLimitingService],
})
export class RateLimitingModule {}

