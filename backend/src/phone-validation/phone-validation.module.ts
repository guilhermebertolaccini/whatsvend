import { Module } from '@nestjs/common';
import { PhoneValidationService } from './phone-validation.service';

@Module({
  providers: [PhoneValidationService],
  exports: [PhoneValidationService],
})
export class PhoneValidationModule {}

