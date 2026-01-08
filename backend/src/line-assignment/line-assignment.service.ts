import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LinesService } from '../lines/lines.service';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { AppLoggerService } from '../logger/logger.service';
import { HealthCheckCacheService } from '../health-check-cache/health-check-cache.service';

interface LineAssignmentResult {
  success: boolean;
  lineId?: number;
  linePhone?: string;
  reason?: string;
}

@Injectable()
export class LineAssignmentService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => LinesService))
    private linesService: LinesService,
    private controlPanelService: ControlPanelService,
    private logger: AppLoggerService,
    private healthCheckCacheService: HealthCheckCacheService,
  ) {}

  /**
   * Encontra uma linha disponível para um operador
   * Centraliza toda a lógica de atribuição de linha (elimina duplicação)
   */
  async findAvailableLineForOperator(
    userId: number,
    userSegment: number | null,
    traceId?: string,
    excludeLineId?: number,
  ): Promise<LineAssignmentResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          lineOperators: {
            include: {
              line: true,
            },
          },
        },
      });

      if (!user) {
        return { success: false, reason: 'Usuário não encontrado' };
      }

      // IMPORTANTE: Admins NÃO recebem linhas automaticamente
      if (user.role === 'admin') {
        return { success: false, reason: 'Admins não recebem linhas automaticamente' };
      }

      // Se já tem linha ativa E não é para excluir essa linha, retornar
      if (user.line && (!excludeLineId || user.line !== excludeLineId)) {
        const existingLine = await this.prisma.linesStock.findUnique({
          where: { id: user.line },
        });

        if (existingLine && existingLine.lineStatus === 'active') {
          this.logger.log(
            `Operador ${user.name} já possui linha ativa: ${existingLine.phone}`,
            'LineAssignment',
            { userId, lineId: existingLine.id, traceId },
          );
          return {
            success: true,
            lineId: existingLine.id,
            linePhone: existingLine.phone,
          };
        }
      }

      // Buscar linhas disponíveis seguindo prioridade:
      // 1. Linhas do segmento do operador (que já foram vinculadas a esse segmento)
      // 2. Linhas com segmento null (nunca foram vinculadas)
      // 3. Linhas do segmento "Padrão" (podem ser alocadas para qualquer segmento)
      // IMPORTANTE: Linhas de outros segmentos NUNCA podem ser alocadas

      const activeEvolutions = await this.controlPanelService.getActiveEvolutions();

      // Buscar segmento "Padrão" para usar na query
      const defaultSegment = await this.prisma.segment.findUnique({
        where: { name: 'Padrão' },
      });

      const availableLines = await this.controlPanelService.filterLinesByActiveEvolutions(
        await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
          },
          include: {
            operators: {
              include: {
                user: {
                  select: {
                    id: true,
                    segment: true,
                    role: true,
                  },
                },
              },
            },
          },
        }),
      );
      // NOVA VALIDAÇÃO: Filtrar linhas disponíveis para incluir apenas as que estão Connected
      // Verificar status de conexão de cada linha antes de tentar atribuir
      const linesWithConnectionStatus = await Promise.all(
        availableLines.map(async (line) => {
          const evolution = await this.prisma.evolution.findUnique({
            where: { evolutionName: line.evolutionName },
          });

          if (!evolution) {
            return { ...line, isConnected: false };
          }

          const instanceName = `line_${line.phone.replace(/\D/g, '')}`;

          try {
            const connectionStatus = await this.healthCheckCacheService.getConnectionStatus(
              evolution.evolutionUrl,
              evolution.evolutionKey,
              instanceName
            );

            // Considerar conectada se NÃO for explicitamente desconectada/conectando
            // 'unknown' e outros status são permitidos
            const isDisconnected = connectionStatus === 'close' ||
                                  connectionStatus === 'CLOSE' ||
                                  connectionStatus === 'disconnected' ||
                                  connectionStatus === 'DISCONNECTED' ||
                                  connectionStatus === 'closeTimeout';

            const isConnecting = connectionStatus === 'connecting' ||
                                connectionStatus === 'CONNECTING';

            const isConnected = !isDisconnected && !isConnecting;

            return { ...line, isConnected };
          } catch (error) {
            // Em caso de erro ao verificar, considerar como não conectada
            return { ...line, isConnected: false };
          }
        })
      );

      // Filtrar apenas linhas conectadas
      const connectedLines = linesWithConnectionStatus.filter(line => line.isConnected);

      if (connectedLines.length === 0) {
        this.logger.warn(
          `Nenhuma linha conectada disponível para operador ${user.name}`,
          'LineAssignment',
          { userId, userSegment, availableLinesCount: availableLines.length, traceId },
        );
        return { success: false, reason: 'Nenhuma linha conectada disponível' };
      }

      // Usar connectedLines ao invés de availableLines nas buscas
      const linesToSearch = connectedLines;



      // Prioridade 1: Linhas do segmento do operador (excluindo a linha antiga se fornecida)
      let candidateLine = linesToSearch.find((line) => {
        if (excludeLineId && line.id === excludeLineId) return false; // IMPORTANTE: Excluir linha antiga
        if (line.segment !== userSegment) return false;
        if (line.operators.length >= 2) return false;
        // Verificar se não mistura segmentos (NUNCA misturar)
        const hasDifferentSegment = line.operators.some(
          (op) => op.user?.segment !== userSegment,
        );
        return !hasDifferentSegment;
      });

      // Prioridade 2: Linhas com segmento null (excluindo a linha antiga)
      // Essas linhas nunca foram vinculadas a nenhum segmento
      if (!candidateLine) {
        candidateLine = linesToSearch.find((line) => {
          if (excludeLineId && line.id === excludeLineId) return false;
          if (line.segment !== null) return false;
          if (line.operators.length >= 2) return false;
          if (line.operators.length > 0) return false; // Linha null NUNCA foi usada, então não pode ter operadores
          return true;
        });
      }

      // Prioridade 3: Linhas do segmento "Padrão" (excluindo a linha antiga)
      // Essas linhas podem ser alocadas para qualquer segmento
      if (!candidateLine && defaultSegment) {
        candidateLine = linesToSearch.find((line) => {
          if (excludeLineId && line.id === excludeLineId) return false;
          if (line.segment !== defaultSegment.id) return false;
          if (line.operators.length >= 2) return false;
          // Se já tem operadores, verificar se são do mesmo segmento
          if (line.operators.length > 0) {
            const hasDifferentSegment = line.operators.some(
              (op) => op.user?.segment !== userSegment,
            );
            return !hasDifferentSegment;
          }
          return true;
        });
      }

      // NÃO buscar "qualquer linha disponível" - isso causava linhas de segmento X indo para operador Y

      if (!candidateLine) {
        this.logger.warn(
          `Nenhuma linha disponível para operador ${user.name}`,
          'LineAssignment',
          { userId, userSegment, traceId },
        );
        return { success: false, reason: 'Nenhuma linha disponível' };
      }

      // Atribuir linha usando método com transaction e lock
      try {
        await this.linesService.assignOperatorToLine(candidateLine.id, userId);

        // REGRA IMPORTANTE: Linha ganha segmento do operador na primeira vinculação
        // - Se linha tinha segmento null: recebe o segmento do operador
        // - Se linha era do segmento "Padrão": recebe o segmento do operador
        // - Depois disso, o segmento da linha NUNCA mais pode ser alterado
        const shouldUpdateSegment =
          (candidateLine.segment === null ||
           (defaultSegment && candidateLine.segment === defaultSegment.id)) &&
          userSegment !== null;

        if (shouldUpdateSegment) {
          await this.prisma.linesStock.update({
            where: { id: candidateLine.id },
            data: { segment: userSegment },
          });

          this.logger.log(
            `Linha ${candidateLine.phone} agora pertence ao segmento ${userSegment}`,
            'LineAssignment',
            { lineId: candidateLine.id, previousSegment: candidateLine.segment, newSegment: userSegment },
          );
        }

        this.logger.log(
          `Linha ${candidateLine.phone} atribuída ao operador ${user.name}`,
          'LineAssignment',
          { userId, lineId: candidateLine.id, linePhone: candidateLine.phone, traceId },
        );

        return {
          success: true,
          lineId: candidateLine.id,
          linePhone: candidateLine.phone,
        };
      } catch (error: any) {
        this.logger.error(
          `Erro ao atribuir linha ${candidateLine.phone} ao operador ${user.name}`,
          error.stack,
          'LineAssignment',
          { userId, lineId: candidateLine.id, error: error.message, traceId },
        );
        return { success: false, reason: error.message };
      }
    } catch (error: any) {
      this.logger.error(
        `Erro ao buscar linha disponível para operador ${userId}`,
        error.stack,
        'LineAssignment',
        { userId, error: error.message, traceId },
      );
      return { success: false, reason: error.message };
    }
  }

  /**
   * Realoca uma linha para um operador (quando linha atual foi banida ou com erro)
   * IMPORTANTE: Se a linha estiver banida, atualiza o status para 'ban' e desvincula TODOS os operadores
   */
  async reallocateLineForOperator(
    userId: number,
    userSegment: number | null,
    oldLineId?: number,
    traceId?: string,
    markAsBanned: boolean = false,
  ): Promise<LineAssignmentResult> {
    try {
      // Se linha deve ser marcada como banida, atualizar status e desvincular TODOS os operadores
      if (oldLineId && markAsBanned) {
        // Buscar linha para verificar status atual
        const oldLine = await this.prisma.linesStock.findUnique({
          where: { id: oldLineId },
          include: {
            operators: {
              include: {
                user: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        });

        if (oldLine && oldLine.lineStatus !== 'ban') {
          // Atualizar status da linha para 'ban'
          await this.prisma.linesStock.update({
            where: { id: oldLineId },
            data: { lineStatus: 'ban' },
          });

          this.logger.warn(
            `Linha ${oldLine.phone} marcada como banida`,
            'LineAssignment',
            { lineId: oldLineId, operatorsCount: oldLine.operators.length },
          );

          // Desvincular TODOS os operadores dessa linha
          const operatorIds = oldLine.operators.map(op => op.userId);
          await this.prisma.lineOperator.deleteMany({
            where: {
              lineId: oldLineId,
            },
          });

          // Atualizar campo 'line' de todos os operadores vinculados para null
          await this.prisma.user.updateMany({
            where: {
              id: { in: operatorIds },
            },
            data: { line: null },
          });

          this.logger.log(
            `Todos os operadores desvinculados da linha banida ${oldLine.phone}`,
            'LineAssignment',
            { lineId: oldLineId, operatorIds },
          );
        }
      } else if (oldLineId) {
        // Se não é para marcar como banida, apenas remover o operador atual
        await this.prisma.lineOperator.deleteMany({
          where: {
            userId,
            lineId: oldLineId,
          },
        });

        await this.prisma.user.update({
          where: { id: userId },
          data: { line: null },
        });
      }

      // Buscar nova linha disponível EXCLUINDO a linha antiga
      return await this.findAvailableLineForOperator(userId, userSegment, traceId, oldLineId);
    } catch (error: any) {
      this.logger.error(
        `Erro ao realocar linha para operador ${userId}`,
        error.stack,
        'LineAssignment',
        { userId, oldLineId, error: error.message, traceId },
      );
      return { success: false, reason: error.message };
    }
  }
}

