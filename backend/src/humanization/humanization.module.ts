import { Module } from '@nestjs/common';
import { HumanizationService } from './humanization.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [HumanizationService, PrismaService],
  exports: [HumanizationService],
})
export class HumanizationModule {}

