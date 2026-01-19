import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LinesService } from '../lines/lines.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { AppLoggerService } from '../logger/logger.service';

export interface QueueEntry {
  id: number;
  userId: number;
  userName: string;
  segmentId: number | null;
  priority: number;
  createdAt: Date;
  position: number;
}

@Injectable()
export class OperatorQueueService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => LinesService))
    private linesService: LinesService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    private logger: AppLoggerService,
  ) { }

  /**
   * Adiciona operador à fila de espera
   */
  async addToQueue(userId: number, segmentId: number | null, priority: number = 0): Promise<void> {
    try {
      // Verificar role do usuário
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      // IMPORTANTE: Admins NÃO podem entrar na fila de espera automática
      if (user?.role === 'admin') {
        this.logger.warn(
          `Tentativa de adicionar admin ${userId} à fila foi bloqueada`,
          'OperatorQueue',
          { userId },
        );
        return;
      }

      // Verificar se já está na fila
      const existing = await this.prisma.operatorQueue.findFirst({
        where: {
          userId,
          status: 'waiting',
        },
      });

      if (existing) {
        this.logger.warn(
          `Operador ${userId} já está na fila de espera`,
          'OperatorQueue',
          { userId, queueId: existing.id },
        );
        return;
      }

      // Adicionar à fila
      const queueEntry = await this.prisma.operatorQueue.create({
        data: {
          userId,
          segmentId,
          status: 'waiting',
          priority,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Expira em 30 minutos
        },
      });

      this.logger.log(
        `Operador ${userId} adicionado à fila de espera`,
        'OperatorQueue',
        { queueId: queueEntry.id, priority, segmentId },
      );

      // Notificar operador via WebSocket
      this.websocketGateway.emitToUser(userId, 'queue-joined', {
        queueId: queueEntry.id,
        message: 'Você entrou na fila de espera por uma linha. Aguarde...',
      });
    } catch (error) {
      this.logger.error(
        `Erro ao adicionar operador ${userId} à fila`,
        error.stack,
        'OperatorQueue',
        { userId, error: error.message },
      );
    }
  }

  /**
   * Remove operador da fila
   */
  async removeFromQueue(userId: number): Promise<void> {
    await this.prisma.operatorQueue.deleteMany({
      where: {
        userId,
        status: 'waiting',
      },
    });

    this.logger.log(
      `Operador ${userId} removido da fila`,
      'OperatorQueue',
      { userId },
    );
  }

  /**
   * Atribui linha ao próximo operador da fila
   */
  async assignNextAvailableLine(lineId: number): Promise<boolean> {
    try {
      // Buscar linha para ver qual segmento
      const line = await this.prisma.linesStock.findUnique({
        where: { id: lineId },
      });

      if (!line || line.lineStatus !== 'active') {
        return false;
      }

      // Buscar próximo da fila (prioridade por segmento)
      const nextInQueue = await this.prisma.operatorQueue.findFirst({
        where: {
          status: 'waiting',
          OR: [
            { segmentId: line.segment },
            { segmentId: null }, // Operadores sem segmento
          ],
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
        ],
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!nextInQueue) {
        // Se não encontrou do segmento, buscar qualquer um
        const anyNext = await this.prisma.operatorQueue.findFirst({
          where: {
            status: 'waiting',
          },
          orderBy: [
            { priority: 'desc' },
            { createdAt: 'asc' },
          ],
        });

        if (!anyNext) {
          return false;
        }

        return await this.assignLineToQueuedOperator(anyNext.userId, lineId);
      }

      return await this.assignLineToQueuedOperator(nextInQueue.userId, lineId);
    } catch (error) {
      this.logger.error(
        `Erro ao atribuir linha ${lineId} a operador da fila`,
        error.stack,
        'OperatorQueue',
        { lineId, error: error.message },
      );
      return false;
    }
  }

  /**
   * Atribui linha específica a operador da fila
   */
  private async assignLineToQueuedOperator(userId: number, lineId: number): Promise<boolean> {
    try {
      // Tentar vincular linha
      await this.linesService.assignOperatorToLine(lineId, userId);

      // Atualizar status na fila
      await this.prisma.operatorQueue.updateMany({
        where: {
          userId,
          status: 'waiting',
        },
        data: {
          status: 'assigned',
          assignedAt: new Date(),
          assignedLineId: lineId,
        },
      });

      // Buscar dados da linha
      const line = await this.prisma.linesStock.findUnique({
        where: { id: lineId },
      });

      this.logger.log(
        `Linha ${lineId} atribuída ao operador ${userId} da fila`,
        'OperatorQueue',
        { userId, lineId, linePhone: line?.phone },
      );

      // Notificar operador via WebSocket
      this.websocketGateway.emitToUser(userId, 'line-assigned-from-queue', {
        lineId,
        linePhone: line?.phone,
        message: `Linha ${line?.phone} foi atribuída a você!`,
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Erro ao vincular linha ${lineId} ao operador ${userId}`,
        error.stack,
        'OperatorQueue',
        { userId, lineId, error: error.message },
      );
      return false;
    }
  }

  /**
   * Processa fila: verifica entradas expiradas e tenta atribuir linhas
   */
  async processQueue(): Promise<void> {
    try {
      // Expirar entradas antigas
      await this.prisma.operatorQueue.updateMany({
        where: {
          status: 'waiting',
          expiresAt: {
            lt: new Date(),
          },
        },
        data: {
          status: 'expired',
        },
      });

      // Buscar operadores aguardando
      const waitingOperators = await this.prisma.operatorQueue.findMany({
        where: {
          status: 'waiting',
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
        ],
      });

      if (waitingOperators.length === 0) {
        return;
      }

      // Buscar linhas disponíveis com informações de segmento
      const availableLines = await this.prisma.linesStock.findMany({
        where: {
          lineStatus: 'active',
        },
        include: {
          operators: true,
        },
      });

      // Buscar configuração de todos os segmentos
      const segments = await this.prisma.segment.findMany({
        select: { id: true, maxOperatorsPerLine: true },
      });
      const segmentMaxMap = new Map(segments.map(s => [s.id, s.maxOperatorsPerLine]));

      const linesToAssign = availableLines.filter(line => {
        // Usar maxOperatorsPerLine do segmento, ou 2 como padrão
        const segmentMax = line.segment ? segmentMaxMap.get(line.segment) : 2;
        const maxOperators = line.isReserve ? 1 : (segmentMax ?? 2);
        return line.operators.length < maxOperators;
      });

      if (linesToAssign.length === 0) {
        this.logger.warn(
          `Fila com ${waitingOperators.length} operadores mas nenhuma linha disponível`,
          'OperatorQueue',
        );
        return;
      }

      // Atribuir linhas
      let assigned = 0;
      for (const line of linesToAssign) {
        if (assigned >= waitingOperators.length) {
          break;
        }

        const success = await this.assignNextAvailableLine(line.id);
        if (success) {
          assigned++;
        }
      }

      this.logger.log(
        `Processamento da fila concluído: ${assigned} operador(es) atribuído(s)`,
        'OperatorQueue',
        { assigned, waiting: waitingOperators.length },
      );
    } catch (error) {
      this.logger.error(
        'Erro ao processar fila',
        error.stack,
        'OperatorQueue',
        { error: error.message },
      );
    }
  }

  /**
   * Retorna posição do operador na fila
   */
  async getQueuePosition(userId: number): Promise<QueueEntry | null> {
    const entry = await this.prisma.operatorQueue.findFirst({
      where: {
        userId,
        status: 'waiting',
      },
      include: {
        user: {
          select: {
            name: true,
            segment: true,
          },
        },
      },
    });

    if (!entry) {
      return null;
    }

    // Calcular posição na fila
    const position = await this.prisma.operatorQueue.count({
      where: {
        status: 'waiting',
        OR: [
          {
            priority: {
              gt: entry.priority,
            },
          },
          {
            priority: entry.priority,
            createdAt: {
              lt: entry.createdAt,
            },
          },
        ],
      },
    });

    return {
      id: entry.id,
      userId: entry.userId,
      userName: entry.user.name,
      segmentId: entry.segmentId,
      priority: entry.priority,
      createdAt: entry.createdAt,
      position: position + 1,
    };
  }

  /**
   * Retorna lista completa da fila (apenas para admins)
   */
  async getQueue(): Promise<QueueEntry[]> {
    const entries = await this.prisma.operatorQueue.findMany({
      where: {
        status: 'waiting',
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      include: {
        user: {
          select: {
            name: true,
            segment: true,
          },
        },
      },
    });

    return entries.map((entry, index) => ({
      id: entry.id,
      userId: entry.userId,
      userName: entry.user.name,
      segmentId: entry.segmentId,
      priority: entry.priority,
      createdAt: entry.createdAt,
      position: index + 1,
    }));
  }

  /**
   * Limpa fila completa (emergência)
   */
  async clearQueue(): Promise<void> {
    await this.prisma.operatorQueue.deleteMany({
      where: {
        status: 'waiting',
      },
    });

    this.logger.log('Fila de espera limpa', 'OperatorQueue');
  }
}
