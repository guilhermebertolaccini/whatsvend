import { Controller, Get, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LineAvailabilityMonitorService } from './line-availability-monitor.service';
import { OperatorQueueService } from '../operator-queue/operator-queue.service';
import { LineSwitchingService } from '../line-switching/line-switching.service';

@Controller('monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LineAvailabilityController {
  constructor(
    private monitoringService: LineAvailabilityMonitorService,
    private queueService: OperatorQueueService,
    private switchingService: LineSwitchingService,
  ) {}

  /**
   * GET /monitoring/dashboard
   * Retorna dados do dashboard de monitoramento (ADMIN ONLY)
   */
  @Get('dashboard')
  @Roles('admin')
  async getDashboard() {
    const data = await this.monitoringService.getMonitoringData();
    const queueList = await this.queueService.getQueue();
    const lineLoads = await this.switchingService.getLineLoadStats();

    return {
      ...data,
      queue: queueList,
      lineLoads: lineLoads.slice(0, 10), // Top 10 linhas mais carregadas
    };
  }

  /**
   * GET /monitoring/history
   * Retorna histórico de disponibilidade (ADMIN ONLY)
   */
  @Get('history')
  @Roles('admin')
  async getHistory(@Query('hours') hours?: string) {
    const hoursNum = hours ? parseInt(hours, 10) : 24;
    return await this.monitoringService.getAvailabilityHistory(hoursNum);
  }

  /**
   * GET /monitoring/queue
   * Retorna fila de operadores aguardando linha (ADMIN ONLY)
   */
  @Get('queue')
  @Roles('admin')
  async getQueue() {
    return await this.queueService.getQueue();
  }

  /**
   * GET /monitoring/line-loads
   * Retorna carga de todas as linhas (ADMIN ONLY)
   */
  @Get('line-loads')
  @Roles('admin')
  async getLineLoads() {
    return await this.switchingService.getLineLoadStats();
  }

  /**
   * GET /monitoring/alerts
   * Retorna alertas ativos (ADMIN ONLY)
   */
  @Get('alerts')
  @Roles('admin')
  async getAlerts() {
    const data = await this.monitoringService.getMonitoringData();
    return {
      severity: data.severity,
      alerts: data.alerts,
    };
  }
}
