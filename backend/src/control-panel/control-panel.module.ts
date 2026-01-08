import { Module } from '@nestjs/common';
import { ControlPanelService } from './control-panel.service';
import { ControlPanelController } from './control-panel.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ControlPanelController],
  providers: [ControlPanelService, PrismaService],
  exports: [ControlPanelService],
})
export class ControlPanelModule {}

