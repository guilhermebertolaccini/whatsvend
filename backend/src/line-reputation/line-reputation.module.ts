import { Module } from '@nestjs/common';
import { LineReputationService } from './line-reputation.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [LineReputationService, PrismaService],
  exports: [LineReputationService],
})
export class LineReputationModule {}

