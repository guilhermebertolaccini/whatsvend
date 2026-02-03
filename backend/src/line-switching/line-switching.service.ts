import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LinesService } from '../lines/lines.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { AppLoggerService } from '../logger/logger.service';

export interface LineLoadInfo {
  lineId: number;
  linePhone: string;
  operatorCount: number;
  activeConversations: number;
  messagesPerMinute: number;
  loadPercent: number;
}

@Injectable()
export class LineSwitchingService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => LinesService))
    private linesService: LinesService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    private logger: AppLoggerService,
  ) {}

  /**
   * Calcula a carga de uma linha
   */
  async getLineLoad(lineId: number): Promise<LineLoadInfo | null> {
    try {
      const line = await this.prisma.linesStock.findUnique({
        where: { id: lineId },
        include: {
          operators: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!line) {
        return null;
      }

      // Contar conversas ativas
      const activeConversations = await this.prisma.conversation.count({
        where: {
          userLine: lineId,
          tabulation: null,
        },
      });

      // Calcular mensagens/minuto (última hora)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentMessages = await this.prisma.conversation.count({
        where: {
          userLine: lineId,
          datetime: {
            gte: oneHourAgo,
          },
        },
      });
      const messagesPerMinute = recentMessages / 60;

      // Calcular carga (0-100%)
      // Fatores:
      // - 50% = número de operadores (2 operadores = 100%)
      // - 30% = conversas ativas (>10 conversas = 100%)
      // - 20% = mensagens/minuto (>5 msgs/min = 100%)
      const operatorLoad = (line.operators.length / 2) * 50;
      const conversationLoad = Math.min((activeConversations / 10) * 30, 30);
      const messageLoad = Math.min((messagesPerMinute / 5) * 20, 20);

      const loadPercent = operatorLoad + conversationLoad + messageLoad;

      return {
        lineId: line.id,
        linePhone: line.phone,
        operatorCount: line.operators.length,
        activeConversations,
        messagesPerMinute,
        loadPercent: Math.round(loadPercent),
      };
    } catch (error) {
      this.logger.error(
        `Erro ao calcular carga da linha ${lineId}`,
        error.stack,
        'LineSwitching',
        { lineId, error: error.message },
      );
      return null;
    }
  }

  /**
   * Busca linha com menor carga
   */
  async findLightestLine(segmentId: number | null): Promise<number | null> {
    try {
      const lines = await this.prisma.linesStock.findMany({
        where: {
          lineStatus: 'active',
          OR: [
            { segment: segmentId },
            { segment: null },
          ],
        },
        include: {
          operators: true,
        },
      });

      if (lines.length === 0) {
        return null;
      }

      // Calcular carga de cada linha
      const lineLoads = await Promise.all(
        lines.map(async (line) => {
          const maxOperators = line.isReserve ? 1 : 2;

          // Se já está no máximo de operadores, não considerar
          if (line.operators.length >= maxOperators) {
            return null;
          }

          const load = await this.getLineLoad(line.id);
          return load;
        })
      );

      // Filtrar nulos e ordenar por carga
      const validLoads = lineLoads.filter(l => l !== null);
      if (validLoads.length === 0) {
        return null;
      }

      validLoads.sort((a, b) => a.loadPercent - b.loadPercent);

      return validLoads[0].lineId;
    } catch (error) {
      this.logger.error(
        'Erro ao buscar linha com menor carga',
        error.stack,
        'LineSwitching',
        { segmentId, error: error.message },
      );
      return null;
    }
  }

  /**
   * Verifica e troca linha do operador se necessário
   */
  async switchLineIfNeeded(userId: number, currentLineId: number): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return false;
      }

      // Calcular carga da linha atual
      const currentLoad = await this.getLineLoad(currentLineId);
      if (!currentLoad) {
        return false;
      }

      // Se carga < 80%, não precisa trocar
      if (currentLoad.loadPercent < 80) {
        return false;
      }

      this.logger.log(
        `Linha ${currentLineId} sobrecarregada (${currentLoad.loadPercent}%), buscando alternativa`,
        'LineSwitching',
        { userId, lineId: currentLineId, load: currentLoad.loadPercent },
      );

      // Buscar linha com menos carga
      const betterLineId = await this.findLightestLine(user.segment);

      if (!betterLineId || betterLineId === currentLineId) {
        this.logger.warn(
          `Nenhuma linha melhor encontrada para operador ${userId}`,
          'LineSwitching',
          { userId, currentLineId },
        );
        return false;
      }

      const betterLoad = await this.getLineLoad(betterLineId);
      if (!betterLoad) {
        return false;
      }

      // Só trocar se nova linha tem carga significativamente menor (>20% de diferença)
      if (betterLoad.loadPercent >= currentLoad.loadPercent - 20) {
        this.logger.log(
          `Nova linha não tem carga suficientemente menor (${betterLoad.loadPercent}% vs ${currentLoad.loadPercent}%)`,
          'LineSwitching',
          { userId, currentLineId, betterLineId },
        );
        return false;
      }

      // Transferir operador
      return await this.transferOperatorToLine(userId, currentLineId, betterLineId);
    } catch (error) {
      this.logger.error(
        `Erro ao verificar troca de linha para operador ${userId}`,
        error.stack,
        'LineSwitching',
        { userId, currentLineId, error: error.message },
      );
      return false;
    }
  }

  /**
   * Transfere operador para nova linha
   */
  async transferOperatorToLine(
    userId: number,
    oldLineId: number,
    newLineId: number,
  ): Promise<boolean> {
    try {
      // Desvincular da linha antiga
      await this.linesService.unassignOperatorFromLine(oldLineId, userId);

      // Vincular à nova linha
      await this.linesService.assignOperatorToLine(newLineId, userId);

      // Atualizar conversas ativas para usar nova linha
      await this.prisma.conversation.updateMany({
        where: {
          userId,
          userLine: oldLineId,
          tabulation: null,
        },
        data: {
          userLine: newLineId,
        },
      });

      // Buscar dados das linhas
      const oldLine = await this.prisma.linesStock.findUnique({
        where: { id: oldLineId },
      });
      const newLine = await this.prisma.linesStock.findUnique({
        where: { id: newLineId },
      });

      this.logger.log(
        `Operador ${userId} transferido de linha ${oldLine?.phone} para ${newLine?.phone}`,
        'LineSwitching',
        { userId, oldLineId, newLineId },
      );

      // Notificar operador via WebSocket
      this.websocketGateway.emitToUser(userId, 'line-switched', {
        oldLineId,
        oldLinePhone: oldLine?.phone,
        newLineId,
        newLinePhone: newLine?.phone,
        reason: 'Balanceamento de carga automático',
        message: `Sua linha foi trocada de ${oldLine?.phone} para ${newLine?.phone} para melhor desempenho`,
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Erro ao transferir operador ${userId} de linha ${oldLineId} para ${newLineId}`,
        error.stack,
        'LineSwitching',
        { userId, oldLineId, newLineId, error: error.message },
      );
      return false;
    }
  }

  /**
   * Balanceia carga de todas as linhas (chamado periodicamente)
   */
  async balanceAllLines(): Promise<void> {
    try {
      const lines = await this.prisma.linesStock.findMany({
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

      // Calcular carga de cada linha
      const lineLoads = await Promise.all(
        lines.map(line => this.getLineLoad(line.id))
      );

      const validLoads = lineLoads.filter(l => l !== null);

      // Encontrar linhas sobrecarregadas (>70%)
      const overloadedLines = validLoads.filter(l => l.loadPercent > 70);

      if (overloadedLines.length === 0) {
        this.logger.log('Nenhuma linha sobrecarregada encontrada', 'LineSwitching');
        return;
      }

      this.logger.log(
        `Encontradas ${overloadedLines.length} linha(s) sobrecarregada(s)`,
        'LineSwitching',
        { overloadedLines: overloadedLines.map(l => ({ phone: l.linePhone, load: l.loadPercent })) },
      );

      // Para cada linha sobrecarregada, tentar transferir operadores
      let switchedCount = 0;
      for (const overloadedLine of overloadedLines) {
        const line = lines.find(l => l.id === overloadedLine.lineId);
        if (!line || line.operators.length === 0) {
          continue;
        }

        // Tentar transferir até metade dos operadores
        const operatorsToTransfer = Math.ceil(line.operators.length / 2);

        for (let i = 0; i < operatorsToTransfer; i++) {
          const operator = line.operators[i];
          const success = await this.switchLineIfNeeded(operator.userId, line.id);
          if (success) {
            switchedCount++;
          }
        }
      }

      this.logger.log(
        `Balanceamento concluído: ${switchedCount} operador(es) transferido(s)`,
        'LineSwitching',
        { switchedCount },
      );
    } catch (error) {
      this.logger.error(
        'Erro ao balancear linhas',
        error.stack,
        'LineSwitching',
        { error: error.message },
      );
    }
  }

  /**
   * Retorna estatísticas de carga das linhas
   */
  async getLineLoadStats(): Promise<LineLoadInfo[]> {
    const lines = await this.prisma.linesStock.findMany({
      where: {
        lineStatus: 'active',
      },
    });

    const lineLoads = await Promise.all(
      lines.map(line => this.getLineLoad(line.id))
    );

    return lineLoads.filter(l => l !== null).sort((a, b) => b.loadPercent - a.loadPercent);
  }
}
