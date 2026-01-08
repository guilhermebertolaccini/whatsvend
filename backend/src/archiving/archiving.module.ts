import { Module } from '@nestjs/common';
import { ArchivingService } from './archiving.service';
import { ArchivingController } from './archiving.controller';
import { PrismaService } from '../prisma.service';
import { LoggerModule } from '../logger/logger.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ScheduleModule.forRoot(), LoggerModule, AuthModule],
  controllers: [ArchivingController],
  providers: [ArchivingService, PrismaService],
  exports: [ArchivingService],
})
export class ArchivingModule {}

