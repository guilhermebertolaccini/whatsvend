import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LinesService } from '../lines/lines.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { OperatorQueueService } from '../operator-queue/operator-queue.service';
import { LineSwitchingService } from '../line-switching/line-switching.service';
import { AppLoggerService } from '../logger/logger.service';
import { HealthCheckCacheService } from '../health-check-cache/health-check-cache.service';
import { LineAssignmentService } from '../line-assignment/line-assignment.service';
import { Cron, CronExpression } from '@nestjs/schedule';

interface MonitoringData {
  totalActiveLines: number;
  linesWithZeroOperators: number;
  linesWithOneOperator: number;
  linesWithTwoOperators: number;
  reserveLines: number;
  operatorsOnline: number;
  operatorsWithoutLine: number;
  operatorsInQueue: number;
  availabilityPercent: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  evolutionsStatus: {
    name: string;
    active: boolean;
    linesCount: number;
  }[];
  alerts: {
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
    timestamp: Date;
  }[];
}

@Injectable()
export class LineAvailabilityMonitorService {
  private readonly EMERGENCY_MODE_ENABLED = false; // Flag de modo emergência

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => LinesService))
    private linesService: LinesService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => OperatorQueueService))
    private queueService: OperatorQueueService,
    @Inject(forwardRef(() => LineSwitchingService))
    private switchingService: LineSwitchingService,
    private healthCheckCacheService: HealthCheckCacheService,
    private lineAssignmentService: LineAssignmentService,
    private logger: AppLoggerService,
  ) { }

  /**
   * Cron job: Verificar disponibilidade a cada 1 minuto
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAvailability(): Promise<void> {
    try {
      const data = await this.getMonitoringData();

      // Salvar log no histórico
      await this.prisma.lineAvailabilityLog.create({
        data: {
          totalActiveLines: data.totalActiveLines,
          linesWithZeroOperators: data.linesWithZeroOperators,
          linesWithOneOperator: data.linesWithOneOperator,
          linesWithTwoOperators: data.linesWithTwoOperators,
          operatorsOnline: data.operatorsOnline,
          operatorsWithoutLine: data.operatorsWithoutLine,
          operatorsInQueue: data.operatorsInQueue,
          availabilityPercent: data.availabilityPercent,
          severity: data.severity,
        },
      });

      // Processar alertas
      if (data.severity === 'CRITICAL') {
        await this.handleCriticalAlert(data);
      } else if (data.severity === 'WARNING') {
        await this.handleWarningAlert(data);
      }

      this.logger.log(
        `Monitoramento concluído: ${data.availabilityPercent.toFixed(1)}% disponível (${data.severity})`,
        'LineAvailability',
        {
          availabilityPercent: data.availabilityPercent,
          severity: data.severity,
          operatorsWithoutLine: data.operatorsWithoutLine,
        },
      );
    } catch (error) {
      this.logger.error(
        'Erro ao verificar disponibilidade de linhas',
        error.stack,
        'LineAvailability',
        { error: error.message },
      );
    }
  }

  /**
   * Cron job: Verificar linhas banidas a cada 15 segundos e realocar automaticamente
   */
  @Cron('*/15 * * * * *') // A cada 15 segundos
  async checkOperatorLinesStatus(): Promise<void> {
    try {
      // Buscar todos os operadores online que têm linha vinculada
      const onlineOperators = await this.prisma.user.findMany({
        where: {
          role: 'operator',
          status: 'Online',
        },
        include: {
          lineOperators: {
            include: {
              line: true,
            },
          },
        },
      });

      // Filtrar apenas operadores com linha vinculada
      const operatorsWithLines = onlineOperators.filter(op => op.lineOperators.length > 0);

      for (const operator of operatorsWithLines) {
        const lineOperator = operator.lineOperators[0]; // Pegar primeira linha (operador pode ter mais de uma, mas normalmente só uma)
        const line = lineOperator.line;

        // Verificar status da linha na Evolution
        const evolution = await this.prisma.evolution.findUnique({
          where: { evolutionName: line.evolutionName },
        });

        if (evolution) {
          const instanceName = `line_${line.phone.replace(/\D/g, '')}`;
          const lineStatus = await this.healthCheckCacheService.getConnectionStatus(
            evolution.evolutionUrl,
            evolution.evolutionKey,
            instanceName
          );

          // Se linha está banida ou desconectada, realocar
          if (!lineStatus || lineStatus === 'ban' || lineStatus === 'disconnected' || lineStatus.toLowerCase() === 'ban' || lineStatus.toLowerCase() === 'disconnected') {
            this.logger.warn(
              `Linha ${line.phone} está ${lineStatus || 'desconectada'} na Evolution. Realocando para operador ${operator.name}...`,
              'LineAvailability',
              {
                operatorId: operator.id,
                operatorName: operator.name,
                lineId: line.id,
                linePhone: line.phone,
                lineStatus: lineStatus || 'unknown',
              },
            );

            try {
              // Realocar nova linha (mesma regra: mesmo segmento ou "Padrão")
              // A função reallocateLineForOperator vai desvincular e marcar a linha como banida
              const reallocationResult = await this.lineAssignmentService.reallocateLineForOperator(
                operator.id,
                operator.segment || null,
                line.id, // oldLineId - linha banida
                undefined, // traceId
                true // markAsBanned = true - marca linha como banida e desvincula TODOS os operadores
              );

              if (reallocationResult.success && reallocationResult.lineId) {
                const newLine = await this.prisma.linesStock.findUnique({
                  where: { id: reallocationResult.lineId },
                });

                if (newLine) {
                  this.logger.log(
                    `Linha ${newLine.phone} realocada automaticamente para operador ${operator.name} após detectar linha banida`,
                    'LineAvailability',
                    {
                      operatorId: operator.id,
                      operatorName: operator.name,
                      oldLineId: line.id,
                      oldLinePhone: line.phone,
                      newLineId: newLine.id,
                      newLinePhone: newLine.phone,
                    },
                  );
                } else {
                  this.logger.error(
                    `Linha ${reallocationResult.lineId} não encontrada após realocação para operador ${operator.name}`,
                    '',
                    'LineAvailability',
                    {
                      operatorId: operator.id,
                      lineId: reallocationResult.lineId,
                    },
                  );
                }
              } else {
                this.logger.error(
                  `Não foi possível realocar linha para operador ${operator.name}: ${reallocationResult.reason}`,
                  '',
                  'LineAvailability',
                  {
                    operatorId: operator.id,
                    operatorName: operator.name,
                    oldLineId: line.id,
                    reason: reallocationResult.reason,
                  },
                );
              }
            } catch (error: any) {
              this.logger.error(
                `Erro ao realocar linha para operador ${operator.name}`,
                error.stack,
                'LineAvailability',
                {
                  operatorId: operator.id,
                  error: error.message,
                },
              );
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        'Erro ao verificar status das linhas dos operadores',
        error.stack,
        'LineAvailability',
        { error: error.message },
      );
    }
  }

  /**
   * Cron job: Processar fila de operadores a cada 5 segundos (otimizado para alocação rápida)
   */
  @Cron('*/5 * * * * *') // A cada 5 segundos
  async processOperatorQueue(): Promise<void> {
    try {
      await this.queueService.processQueue();
    } catch (error) {
      this.logger.error(
        'Erro ao processar fila de operadores',
        error.stack,
        'LineAvailability',
        { error: error.message },
      );
    }
  }

  /**
   * Cron job: Balancear carga das linhas a cada 5 minutos
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async balanceLineLoad(): Promise<void> {
    try {
      await this.switchingService.balanceAllLines();
    } catch (error) {
      this.logger.error(
        'Erro ao balancear carga de linhas',
        error.stack,
        'LineAvailability',
        { error: error.message },
      );
    }
  }

  /**
   * Retorna dados de monitoramento
   */
  async getMonitoringData(): Promise<MonitoringData> {
    // Buscar todas as linhas ativas
    const activeLines = await this.prisma.linesStock.findMany({
      where: {
        lineStatus: 'active',
      },
      include: {
        operators: {
          include: {
            user: true,
          },
        },
      },
    });

    const totalActiveLines = activeLines.length;
    const linesWithZeroOperators = activeLines.filter(l => l.operators.length === 0).length;
    const linesWithOneOperator = activeLines.filter(l => l.operators.length === 1).length;
    const linesWithTwoOperators = activeLines.filter(l => l.operators.length === 2).length;
    const reserveLines = activeLines.filter(l => l.isReserve).length;

    // Operadores online
    const operatorsOnline = await this.prisma.user.count({
      where: {
        role: 'operator',
        status: 'Online',
      },
    });

    // Operadores sem linha (online mas sem vínculo em LineOperator)
    const onlineOperators = await this.prisma.user.findMany({
      where: {
        role: 'operator',
        status: 'Online',
      },
      include: {
        lineOperators: true,
      },
    });

    const operatorsWithoutLine = onlineOperators.filter(op => op.lineOperators.length === 0).length;

    // Operadores na fila
    const operatorsInQueue = await this.prisma.operatorQueue.count({
      where: {
        status: 'waiting',
      },
    });

    // Calcular disponibilidade
    const reserveLinesAvailable = activeLines.filter(l => l.isReserve && l.operators.length === 0).length;
    const normalLinesAvailable = activeLines.filter(l => !l.isReserve && l.operators.length < 2).length;
    const totalSlotsAvailable = reserveLinesAvailable + (normalLinesAvailable * 2);
    const totalSlotsMax = reserveLines + ((totalActiveLines - reserveLines) * 2);

    const availabilityPercent = totalSlotsMax > 0 ? (totalSlotsAvailable / totalSlotsMax) * 100 : 0;

    // Determinar severidade
    let severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';
    if (availabilityPercent < 5) {
      severity = 'CRITICAL';
    } else if (availabilityPercent < 10) {
      severity = 'WARNING';
    }

    // Buscar status das evolutions
    const evolutions = await this.prisma.evolution.findMany();
    const evolutionsStatus = await Promise.all(
      evolutions.map(async (evo) => {
        const linesCount = await this.prisma.linesStock.count({
          where: {
            evolutionName: evo.evolutionName,
            lineStatus: 'active',
          },
        });

        // Verificar se está ativa no Control Panel
        const controlPanel = await this.prisma.controlPanel.findFirst({
          where: { segmentId: null },
        });

        const activeEvolutions = controlPanel?.activeEvolutions
          ? JSON.parse(controlPanel.activeEvolutions)
          : null;

        const isActive = activeEvolutions === null || activeEvolutions.includes(evo.evolutionName);

        return {
          name: evo.evolutionName,
          active: isActive,
          linesCount,
        };
      })
    );

    // Gerar alertas
    const alerts: MonitoringData['alerts'] = [];

    if (operatorsWithoutLine > 0) {
      alerts.push({
        severity: operatorsWithoutLine > 5 ? 'CRITICAL' : 'WARNING',
        message: `${operatorsWithoutLine} operador(es) online sem linha disponível`,
        timestamp: new Date(),
      });
    }

    if (operatorsInQueue > 0) {
      alerts.push({
        severity: operatorsInQueue > 10 ? 'CRITICAL' : 'WARNING',
        message: `${operatorsInQueue} operador(es) aguardando na fila`,
        timestamp: new Date(),
      });
    }

    if (availabilityPercent < 10) {
      alerts.push({
        severity: availabilityPercent < 5 ? 'CRITICAL' : 'WARNING',
        message: `Disponibilidade crítica: apenas ${availabilityPercent.toFixed(1)}% de capacidade`,
        timestamp: new Date(),
      });
    }

    // Alertas de evolutions inativas
    evolutionsStatus.forEach(evo => {
      if (!evo.active && evo.linesCount > 0) {
        alerts.push({
          severity: 'WARNING',
          message: `Evolution '${evo.name}' está inativa mas possui ${evo.linesCount} linha(s) cadastrada(s)`,
          timestamp: new Date(),
        });
      }
    });

    return {
      totalActiveLines,
      linesWithZeroOperators,
      linesWithOneOperator,
      linesWithTwoOperators,
      reserveLines,
      operatorsOnline,
      operatorsWithoutLine,
      operatorsInQueue,
      availabilityPercent,
      severity,
      evolutionsStatus,
      alerts,
    };
  }

  /**
   * Lidar com alerta crítico
   */
  private async handleCriticalAlert(data: MonitoringData): Promise<void> {
    this.logger.error(
      `ALERTA CRÍTICO: Disponibilidade de linhas em ${data.availabilityPercent.toFixed(1)}%`,
      '',
      'LineAvailability',
      {
        availabilityPercent: data.availabilityPercent,
        operatorsWithoutLine: data.operatorsWithoutLine,
        operatorsInQueue: data.operatorsInQueue,
      },
    );

    // Notificar apenas admins via WebSocket
    await this.notifyAdmins({
      type: 'critical-alert',
      severity: 'CRITICAL',
      message: `CRÍTICO: Apenas ${data.availabilityPercent.toFixed(1)}% de capacidade disponível`,
      data,
    });

    // Se < 5%, ativar modo emergência
    if (data.availabilityPercent < 5 && !this.EMERGENCY_MODE_ENABLED) {
      await this.enableEmergencyMode();
    }
  }

  /**
   * Lidar com alerta de warning
   */
  private async handleWarningAlert(data: MonitoringData): Promise<void> {
    this.logger.warn(
      `Alerta: Disponibilidade de linhas em ${data.availabilityPercent.toFixed(1)}%`,
      'LineAvailability',
      {
        availabilityPercent: data.availabilityPercent,
        operatorsWithoutLine: data.operatorsWithoutLine,
      },
    );

    // Notificar apenas admins via WebSocket
    await this.notifyAdmins({
      type: 'warning-alert',
      severity: 'WARNING',
      message: `Atenção: ${data.availabilityPercent.toFixed(1)}% de capacidade disponível`,
      data,
    });
  }

  /**
   * Ativar modo emergência: linhas reserva aceitam 2 operadores temporariamente
   */
  private async enableEmergencyMode(): Promise<void> {
    this.logger.error(
      'MODO EMERGÊNCIA ATIVADO: Liberando linhas reserva para 2 operadores',
      '',
      'LineAvailability',
    );

    // Notificar apenas admins
    await this.notifyAdmins({
      type: 'emergency-mode',
      severity: 'CRITICAL',
      message: 'Modo emergência ativado: linhas reserva liberadas temporariamente',
      data: null,
    });

    // Nota: A lógica de aceitar 2 operadores precisa ser implementada
    // no assignOperatorToLine considerando modo emergência
  }

  /**
   * Notifica apenas administradores via WebSocket
   */
  private async notifyAdmins(alert: any): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: {
        role: 'admin',
        status: 'Online',
      },
    });

    for (const admin of admins) {
      this.websocketGateway.emitToUser(admin.id, 'monitoring-alert', alert);
    }
  }

  /**
   * Retorna histórico de disponibilidade (últimas 24h)
   */
  async getAvailabilityHistory(hours: number = 24): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return await this.prisma.lineAvailabilityLog.findMany({
      where: {
        timestamp: {
          gte: since,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });
  }
}
