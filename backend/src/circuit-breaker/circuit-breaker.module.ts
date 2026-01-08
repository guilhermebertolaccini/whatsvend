import { Module } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [LoggerModule],
  providers: [CircuitBreakerService],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}

