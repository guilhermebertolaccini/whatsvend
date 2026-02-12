import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LinesService } from '../lines/lines.service';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { AppLoggerService } from '../logger/logger.service';
import { HealthCheckCacheService } from '../health-check-cache/health-check-cache.service';
import { OperatorQueueService } from '../operator-queue/operator-queue.service';

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
    @Inject(forwardRef(() => OperatorQueueService))
    private queueService: OperatorQueueService,
  ) { }

  /**
   * Solicita uma linha para o operador (Porta de Entrada Centralizada)
   * Verifica fila de espera antes de tentar atribuir
   */
  async requestLineForOperator(userId: number): Promise<LineAssignmentResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, segment: true, line: true, role: true, name: true }
    });

    if (!user) return { success: false, reason: 'Usuário não encontrado' };

    // 1. Se já tem linha, retorna sucesso
    if (user.line) {
      const currentLine = await this.prisma.linesStock.findUnique({ where: { id: user.line } });
      if (currentLine && currentLine.lineStatus === 'active') {
        return { success: true, lineId: currentLine.id, linePhone: currentLine.phone };
      }
      // Se linha não existe ou inativa, continua para buscar nova
    }

    // 2. Verificar se existe fila para o segmento do usuário
    // IMPORTANTE: Se houver fila, o usuário DEVE entrar na fila, mesmo que haja linha livre agora.
    // Isso evita "fura-fila" de quem acabou de logar.
    const queueCount = await this.prisma.operatorQueue.count({
      where: {
        status: 'waiting',
        OR: [
          { segmentId: user.segment },
          { segmentId: null } // Fila geral também conta
        ]
      }
    });

    // Se tem gente na fila, entra na fila (a menos que seja admin)
    if (queueCount > 0 && user.role !== 'admin') {
      this.logger.log(`Fila detectada (${queueCount} pessoas). Adicionando operador ${user.name} à fila.`, 'LineAssignment');
      await this.queueService.addToQueue(user.id, user.segment);
      return { success: false, reason: 'Adicionado à fila de espera' };
    }

    // 3. Se não tem fila (ou é o primeiro), tenta buscar linha livre
    const result = await this.findAvailableLineForOperator(user.id, user.segment);

    if (result.success && result.lineId) {
      // Tentar atribuir
      try {
        await this.linesService.assignOperatorToLine(result.lineId, user.id);
        return result;
      } catch (error) {
        this.logger.error(`Erro ao atribuir linha encontrada: ${error.message}`, error.stack, 'LineAssignment');
        // Se falhou ao atribuir, adicionar à fila como fallback
        if (user.role !== 'admin') {
          await this.queueService.addToQueue(user.id, user.segment);
          return { success: false, reason: 'Erro ao atribuir, adicionado à fila' };
        }
        return { success: false, reason: error.message };
      }
    } else {
      // 4. Se não achou linha, entra na fila
      if (user.role !== 'admin') {
        await this.queueService.addToQueue(user.id, user.segment);
        return { success: false, reason: 'Nenhuma linha disponível, adicionado à fila' };
      }
      return { success: false, reason: 'Nenhuma linha disponível' };
    }
  }

  /**
   * Encontra uma linha disponível para um operador
   * Centraliza toda a lógica de atribuição de linha (elimina duplicação)
   */
  async findAvailableLineForOperator(
    userId: number,
    userSegment: number | null,
    traceId?: string,
    excludeLineIds: number[] = [],
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
      if (user.line && (!excludeLineIds || !excludeLineIds.includes(user.line))) {
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

      // Buscar configs dos segmentos
      let userSegmentConfig = null;
      if (userSegmentConfig) {
        userSegmentConfig = await this.prisma.segment.findUnique({ where: { id: userSegment } });

        // VERIFICAR SE ALOCAÇÃO ESTÁ HABILITADA
        if (userSegmentConfig && userSegmentConfig.allocationEnabled === false) {
          this.logger.warn(
            `Alocação pausada para o segmento ${userSegmentConfig.name}`,
            'LineAssignment',
            { userId, userSegment, traceId },
          );
          return { success: false, reason: 'Alocação pausada para este segmento' };
        }
      }

      // Buscar segmento "Padrão"
      const defaultSegment = await this.prisma.segment.findUnique({
        where: { name: 'Padrão' },
      });

      // Definir limites
      const userMaxOperators = userSegmentConfig?.maxOperatorsPerLine || 2;
      const defaultMaxOperators = defaultSegment?.maxOperatorsPerLine || 2;

      // Buscar linhas ativas (limitado a 30 para maior pool de escolha se o limite for alto)
      // Aumentei de 8 para 30 pois com limites maiores (ex: 5 ops por linha), precisamos ver mais linhas
      const availableLines = await this.controlPanelService.filterLinesByActiveEvolutions(
        await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 30,
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
            // Usar cache de health check para performance (já usado em websocket)
            const connectionStatus = await this.healthCheckCacheService.getConnectionStatus(
              evolution.evolutionUrl,
              evolution.evolutionKey,
              instanceName
            );

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

      const linesToSearch = connectedLines;

      // Prioridade 1: Linhas do segmento do operador
      let candidateLine = linesToSearch.find((line) => {
        if (excludeLineIds && excludeLineIds.includes(line.id)) return false;

        if (line.segment !== userSegment) return false;

        // RESPEITAR O LIMITE DO SEGMENTO DO USUÁRIO
        if (line.operators.length >= userMaxOperators) return false;

        // Verificar se não mistura segmentos
        const hasDifferentSegment = line.operators.some(
          (op) => op.user?.segment !== userSegment,
        );
        return !hasDifferentSegment;
      });

      // Prioridade 2: Linhas do segmento null (nunca usadas)
      if (!candidateLine) {
        candidateLine = linesToSearch.find((line) => {
          if (excludeLineIds && excludeLineIds.includes(line.id)) return false;
          if (line.segment !== null) return false;
          if (defaultSegment && line.segment === defaultSegment.id) return false;

          // Linhas null devem estar vazias (ou respeitar limite padrão se formos permitir compartilhamento de linhas livres, mas geralmente devem ser virgens)
          // Regra atual: Linha null só se estiver vazia (virgem)
          if (line.operators.length > 0) return false;

          return true;
        });
      }

      // Prioridade 3: Linhas do segmento "Padrão"
      if (!candidateLine && defaultSegment) {
        candidateLine = linesToSearch.find((line) => {
          if (excludeLineIds && excludeLineIds.includes(line.id)) return false;
          if (line.segment !== defaultSegment.id) return false;

          // RESPEITAR LIMITE DO SEGMENTO PADRÃO
          if (line.operators.length >= defaultMaxOperators) return false;

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

        // REMOVIDO: Linha não deve mais ganhar segmento do operador automaticamente
        // O sistema foi alterado para que apenas admins possam trocar o segmento da linha manualmente
        /*
        if (
          (candidateLine.segment === null ||
            (defaultSegment && candidateLine.segment === defaultSegment.id)) &&
          userSegment
        ) {
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
        */

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
    lineToRemove?: number,
    excludeLineIds: number[] = [],
    traceId?: string,
    markAsBanned: boolean = false,
  ): Promise<LineAssignmentResult> {
    try {
      // Adicionar a linha a ser removida na lista de exclusão
      const allExcludedIds = [...excludeLineIds];
      if (lineToRemove && !allExcludedIds.includes(lineToRemove)) {
        allExcludedIds.push(lineToRemove);
      }

      // Se linha deve ser marcada como banida, atualizar status e desvincular TODOS os operadores
      if (lineToRemove && markAsBanned) {
        // Buscar linha para verificar status atual
        const oldLine = await this.prisma.linesStock.findUnique({
          where: { id: lineToRemove },
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
            where: { id: lineToRemove },
            data: { lineStatus: 'ban' },
          });

          this.logger.warn(
            `Linha ${oldLine.phone} marcada como banida`,
            'LineAssignment',
            { lineId: lineToRemove, operatorsCount: oldLine.operators.length },
          );

          // Desvincular TODOS os operadores dessa linha
          const operatorIds = oldLine.operators.map(op => op.userId);
          await this.prisma.lineOperator.deleteMany({
            where: {
              lineId: lineToRemove,
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
            { lineId: lineToRemove, operatorIds },
          );
        }
      } else if (lineToRemove) {
        // Se não é para marcar como banida, apenas remover o operador atual
        await this.prisma.lineOperator.deleteMany({
          where: {
            userId,
            lineId: lineToRemove,
          },
        });

        await this.prisma.user.update({
          where: { id: userId },
          data: { line: null },
        });
      }

      // Buscar nova linha disponível EXCLUINDO todas as anteriores
      return await this.findAvailableLineForOperator(userId, userSegment, traceId, allExcludedIds);
    } catch (error: any) {
      this.logger.error(
        `Erro ao realocar linha para operador ${userId}`,
        error.stack,
        'LineAssignment',
        { userId, lineToRemove, error: error.message, traceId },
      );
      return { success: false, reason: error.message };
    }
  }
}
