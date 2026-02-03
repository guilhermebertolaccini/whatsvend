import { Controller, Get, Query, UseGuards, Param, ParseIntPipe } from '@nestjs/common';
import { ApiLogsService } from './api-logs.service';
import { ApiLogFilterDto } from './dto/api-log-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('api-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiLogsController {
  constructor(private readonly apiLogsService: ApiLogsService) {}

  @Get()
  @Roles('admin', 'supervisor')
  findAll(@Query() filters: ApiLogFilterDto) {
    return this.apiLogsService.findAll(filters);
  }

  @Get(':id')
  @Roles('admin', 'supervisor')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.apiLogsService.findOne(id);
  }
}

