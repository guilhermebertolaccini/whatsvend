import { Module } from '@nestjs/common';
import { SpintaxService } from './spintax.service';

@Module({
  providers: [SpintaxService],
  exports: [SpintaxService],
})
export class SpintaxModule {}

