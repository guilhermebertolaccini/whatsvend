import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ControlPanelService } from './control-panel.service';
import { UpdateControlPanelDto, AddBlockPhraseDto, RemoveBlockPhraseDto } from './dto/control-panel.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('control-panel')
@ApiBearerAuth('JWT-auth')
@Controller('control-panel')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ControlPanelController {
  constructor(private readonly controlPanelService: ControlPanelService) {}

  // Buscar configurações (global ou por segmento)
  @Get()
  @Roles(Role.admin, Role.supervisor)
  async findOne(@Query('segmentId') segmentId?: string) {
    const segId = segmentId ? parseInt(segmentId, 10) : undefined;
    return this.controlPanelService.findOne(segId);
  }

  // Atualizar configurações
  @Post()
  @Roles(Role.admin, Role.supervisor)
  async upsert(@Body() dto: UpdateControlPanelDto) {
    console.log('[ControlPanel] Recebendo atualização:', JSON.stringify(dto, null, 2));
    return this.controlPanelService.upsert(dto);
  }

  // Adicionar frase de bloqueio
  @Post('block-phrases')
  @Roles(Role.admin, Role.supervisor)
  async addBlockPhrase(
    @Body() dto: AddBlockPhraseDto,
    @Query('segmentId') segmentId?: string,
  ) {
    const segId = segmentId ? parseInt(segmentId, 10) : undefined;
    return this.controlPanelService.addBlockPhrase(dto.phrase, segId);
  }

  // Remover frase de bloqueio
  @Delete('block-phrases')
  @Roles(Role.admin, Role.supervisor)
  async removeBlockPhrase(
    @Body() dto: RemoveBlockPhraseDto,
    @Query('segmentId') segmentId?: string,
  ) {
    const segId = segmentId ? parseInt(segmentId, 10) : undefined;
    return this.controlPanelService.removeBlockPhrase(dto.phrase, segId);
  }

  // Verificar se pode contatar CPC
  @Get('check-cpc/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator)
  async checkCPC(
    @Param('phone') phone: string,
    @Query('segmentId') segmentId?: string,
  ) {
    const segId = segmentId ? parseInt(segmentId, 10) : undefined;
    return this.controlPanelService.canContactCPC(phone, segId);
  }

  // Verificar se pode reenviar
  @Get('check-resend/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator)
  async checkResend(
    @Param('phone') phone: string,
    @Query('segmentId') segmentId?: string,
  ) {
    const segId = segmentId ? parseInt(segmentId, 10) : undefined;
    return this.controlPanelService.canResend(phone, segId);
  }

  // Marcar contato como CPC
  @Post('mark-cpc/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator)
  async markAsCPC(
    @Param('phone') phone: string,
    @Body() body: { isCPC: boolean },
  ) {
    await this.controlPanelService.markAsCPC(phone, body.isCPC);
    return { success: true };
  }

  // Atribuição em massa de linhas aos operadores
  @Post('assign-lines-mass')
  @Roles(Role.admin, Role.supervisor)
  async assignLinesMass() {
    return this.controlPanelService.assignLinesToAllOperators();
  }

  // Desatribuir todas as linhas dos operadores e alterar todas as linhas para segmento "Padrão"
  @Post('unassign-all-lines')
  @Roles(Role.admin, Role.supervisor)
  async unassignAllLines() {
    return this.controlPanelService.unassignAllLines();
  }
}

