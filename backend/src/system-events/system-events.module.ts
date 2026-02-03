import { Module } from '@nestjs/common';
import { SystemEventsService } from './system-events.service';
import { SystemEventsController } from './system-events.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [SystemEventsController],
  providers: [SystemEventsService, PrismaService],
  exports: [SystemEventsService],
})
export class SystemEventsModule {}

