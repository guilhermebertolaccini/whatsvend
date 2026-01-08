import { Module } from '@nestjs/common';
import { BlocklistService } from './blocklist.service';
import { BlocklistController } from './blocklist.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [BlocklistController],
  providers: [BlocklistService, PrismaService],
  exports: [BlocklistService],
})
export class BlocklistModule {}
