import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LinesService } from './lines.service';
import { CreateLineDto } from './dto/create-line.dto';
import { UpdateLineDto } from './dto/update-line.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('lines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LinesController {
  constructor(private readonly linesService: LinesService) { }

  @Post()
  @Roles(Role.admin, Role.ativador)
  create(@Body() createLineDto: CreateLineDto, @CurrentUser() user: any) {
    console.log('📝 Dados recebidos para criar linha:', createLineDto);
    return this.linesService.create(createLineDto, user.id);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.ativador)
  findAll(@Query() filters: any) {
    return this.linesService.findAll(filters);
  }

  @Get('schema')
  @Roles(Role.admin)
  getSchema() {
    return {
      message: 'Estrutura esperada para criar uma linha',
      required: {
        phone: 'string (obrigatório) - Ex: "5511999999999"',
        evolutionName: 'string (obrigatório) - Ex: "Evolution01"',
      },
      optional: {
        segment: 'number (opcional) - ID do segmento',
        oficial: 'boolean (opcional) - Se é linha oficial',
        lineStatus: 'string (opcional) - "active" ou "ban"',
        linkedTo: 'number (opcional) - ID do usuário vinculado',
        token: 'string (opcional)',
        businessID: 'string (opcional)',
        numberId: 'string (opcional)',
      },
      example: {
        phone: '5511999999999',
        evolutionName: 'Evolution01',
        segment: 1,
        oficial: false,
      },
    };
  }

  @Get('evolutions')
  @Roles(Role.admin, Role.ativador)
  getEvolutions() {
    return this.linesService.getEvolutions();
  }

  @Get('allocations-log')
  @Roles(Role.admin)
  getAllocationsLog(@Query('limit') limit: number) {
    return this.linesService.getAllocationsLog(limit ? Number(limit) : 50);
  }

  @Get('lifespan')
  @Roles(Role.admin)
  getLineLifespan() {
    return this.linesService.getLineLifespan();
  }

  @Get('instances/:evolutionName')
  @Roles(Role.admin)
  getInstances(@Param('evolutionName') evolutionName: string) {
    return this.linesService.fetchInstancesFromEvolution(evolutionName);
  }

  @Get('available/:segment')
  @Roles(Role.admin)
  getAvailable(@Param('segment') segment: string) {
    return this.linesService.getAvailableLines(+segment);
  }

  @Get('available-for-operator/:operatorId')
  @Roles(Role.admin)
  async getAvailableForOperator(@Param('operatorId') operatorId: string) {
    return this.linesService.getAvailableLinesForOperator(+operatorId);
  }

  @Get('activators-productivity')
  @Roles(Role.admin, Role.supervisor)
  getActivatorsProductivity(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.linesService.getActivatorsProductivity(startDate, endDate);
  }

  @Get('allocation-stats')
  @Roles(Role.admin, Role.supervisor)
  getAllocationStats() {
    return this.linesService.getLinesAllocationStats();
  }

  @Get(':id')
  @Roles(Role.admin, Role.ativador)
  findOne(@Param('id') id: string) {
    return this.linesService.findOne(+id);
  }

  @Get(':id/qrcode')
  @Roles(Role.admin, Role.ativador)
  getQRCode(@Param('id') id: string) {
    return this.linesService.getQRCode(+id);
  }

  @Patch(':id')
  @Roles(Role.admin)
  update(@Param('id') id: string, @Body() updateLineDto: UpdateLineDto) {
    return this.linesService.update(+id, updateLineDto);
  }

  @Post(':id/ban')
  @Roles(Role.admin)
  handleBan(@Param('id') id: string) {
    return this.linesService.handleBannedLine(+id);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(@Param('id') id: string) {
    return this.linesService.remove(+id);
  }

  @Post(':id/assign-operator/:operatorId')
  @Roles(Role.admin)
  async assignOperator(@Param('id') lineId: string, @Param('operatorId') operatorId: string) {
    await this.linesService.assignOperatorToLine(+lineId, +operatorId);
    return { message: 'Operador atribuído à linha com sucesso' };
  }
}
