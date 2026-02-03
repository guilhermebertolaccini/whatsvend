import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export enum EventType {
  // Operador
  OPERATOR_CONNECTED = 'operator_connected',
  OPERATOR_DISCONNECTED = 'operator_disconnected',

  // Linhas
  LINE_ASSIGNED = 'line_assigned',
  LINE_REALLOCATED = 'line_reallocated',
  LINE_BANNED = 'line_banned',
  LINE_DISCONNECTED = 'line_disconnected',
  LINE_UNASSIGNED = 'line_unassigned',

  // Mensagens
  MESSAGE_SENT = 'message_sent',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_QUEUED = 'message_queued',
  MESSAGE_PROCESSED = 'message_processed',

  // Erros
  API_ERROR = 'api_error',
  TIMEOUT_ERROR = 'timeout_error',
  HEALTH_CHECK_FAILED = 'health_check_failed',

  // Sistema
  CPC_TRIGGERED = 'cpc_triggered',
  REPESCAGEM_TRIGGERED = 'repescagem_triggered',
  BLOCK_PHRASE_TRIGGERED = 'block_phrase_triggered',
  AUTO_MESSAGE_SENT = 'auto_message_sent',
}

export enum EventSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success',
}

export enum EventModule {
  WEBSOCKET = 'websocket',
  LINES = 'lines',
  WEBHOOKS = 'webhooks',
  CONTROL_PANEL = 'control_panel',
  CONVERSATIONS = 'conversations',
  API_MESSAGES = 'api_messages',
  AUTO_MESSAGE = 'auto_message',
}

@Injectable()
export class SystemEventsService {
  constructor(private prisma: PrismaService) { }

  /**
   * Registra um evento no sistema
   */
  async logEvent(
    type: EventType,
    module: EventModule,
    data?: any,
    userId?: number,
    severity: EventSeverity = EventSeverity.INFO,
  ): Promise<void> {
    try {
      await (this.prisma as any).systemEvent.create({
        data: {
          type,
          module,
          data: data ? JSON.stringify(data) : null,
          userId: userId || null,
          severity,
        },
      });
    } catch (error) {
      // Não queremos que erros no log quebrem o sistema
      console.error('❌ [SystemEvents] Erro ao registrar evento:', error);
    }
  }

  /**
   * Busca eventos com filtros
   */
  async findEvents(filters: {
    type?: string;
    module?: string;
    userId?: number;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.module) {
      where.module = filters.module;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.severity) {
      where.severity = filters.severity;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [events, total] = await Promise.all([
      (this.prisma as any).systemEvent.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: filters.limit || 100,
        skip: filters.offset || 0,
      }),
      (this.prisma as any).systemEvent.count({ where }),
    ]);

    return {
      events: events.map(event => ({
        ...event,
        data: event.data ? JSON.parse(event.data) : null,
      })),
      total,
    };
  }

  /**
   * Busca métricas agregadas
   */
  async getMetrics(filters: {
    startDate?: Date;
    endDate?: Date;
    groupBy?: 'type' | 'module' | 'severity' | 'hour' | 'day';
  }) {
    const where: any = {};

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const events = await (this.prisma as any).systemEvent.findMany({
      where,
      select: {
        type: true,
        module: true,
        severity: true,
        createdAt: true,
      },
    });

    // Agrupar por tipo, módulo, severidade ou tempo
    const grouped: Record<string, number> = {};

    for (const event of events) {
      let key: string;

      switch (filters.groupBy) {
        case 'type':
          key = event.type;
          break;
        case 'module':
          key = event.module;
          break;
        case 'severity':
          key = event.severity;
          break;
        case 'hour':
          const hour = new Date(event.createdAt).toISOString().slice(0, 13) + ':00:00';
          key = hour;
          break;
        case 'day':
          const day = new Date(event.createdAt).toISOString().slice(0, 10);
          key = day;
          break;
        default:
          key = event.type;
      }

      grouped[key] = (grouped[key] || 0) + 1;
    }

    return grouped;
  }

  /**
   * Busca eventos por minuto (para gráfico de eventos/minuto)
   */
  async getEventsPerMinute(filters: {
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {};

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const events = await (this.prisma as any).systemEvent.findMany({
      where,
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Agrupar por minuto
    const perMinute: Record<string, number> = {};

    for (const event of events) {
      const date = new Date(event.createdAt);
      const minute = `${date.toISOString().slice(0, 16)}:00`;
      perMinute[minute] = (perMinute[minute] || 0) + 1;
    }

    return Object.entries(perMinute)
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  /**
   * Limpa eventos antigos (manter apenas últimos N dias)
   */
  async cleanOldEvents(daysToKeep: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await (this.prisma as any).systemEvent.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }
}

