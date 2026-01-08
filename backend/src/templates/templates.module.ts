import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { PrismaService } from '../prisma.service';
import { PhoneValidationModule } from '../phone-validation/phone-validation.module';

@Module({
  imports: [PhoneValidationModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, PrismaService],
  exports: [TemplatesService],
})
export class TemplatesModule {}

