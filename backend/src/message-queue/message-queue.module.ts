import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MessageQueueService } from './message-queue.service';
import { PrismaService } from '../prisma.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [ScheduleModule.forRoot(), ConversationsModule, WebsocketModule],
  providers: [MessageQueueService, PrismaService],
  exports: [MessageQueueService],
})
export class MessageQueueModule {}

