import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SystemEventsService } from './system-events.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

class GetEventsQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return isNaN(num) ? 100 : num;
  })
  @IsNumber()
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  })
  @IsNumber()
  offset?: number;
}

class GetMetricsQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  groupBy?: 'type' | 'module' | 'severity' | 'hour' | 'day';
}

@Controller('system-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'supervisor')
export class SystemEventsController {
  constructor(private readonly systemEventsService: SystemEventsService) {}

  @Get()
  async getEvents(@Query() query: GetEventsQueryDto) {
    return this.systemEventsService.findEvents({
      type: query.type,
      module: query.module,
      userId: query.userId,
      severity: query.severity,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('metrics')
  async getMetrics(@Query() query: GetMetricsQueryDto) {
    return this.systemEventsService.getMetrics({
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      groupBy: query.groupBy || 'type',
    });
  }

  @Get('events-per-minute')
  async getEventsPerMinute(@Query() query: GetMetricsQueryDto) {
    return this.systemEventsService.getEventsPerMinute({
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }
}

