import { Module } from '@nestjs/common';
import { TabulationsService } from './tabulations.service';
import { TabulationsController } from './tabulations.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [TabulationsController],
  providers: [TabulationsService, PrismaService],
  exports: [TabulationsService],
})
export class TabulationsModule {}
