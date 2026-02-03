import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ArchivingService } from './archiving.service';

@ApiTags('archiving')
@ApiBearerAuth('JWT-auth')
@Controller('archiving')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.supervisor)
export class ArchivingController {
  constructor(private archivingService: ArchivingService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatísticas de arquivamento' })
  @ApiResponse({ status: 200, description: 'Estatísticas de arquivamento' })
  async getStats() {
    return await this.archivingService.getArchivingStats();
  }
}


