import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LineReputationService } from '../line-reputation/line-reputation.service';

interface RateLimit {
  daily: number;
  hourly: number;
}

@Injectable()
export class RateLimitingService {
  private readonly baseLimits: Record<string, RateLimit> = {
    newLine: { daily: 200, hourly: 50 },      // Linhas novas (< 7 dias) - 50 msg/hora, 200/dia
    warmingUp: { daily: 500, hourly: 100 },   // Linhas aquecendo (7-30 dias) - 100 msg/hora, 500/dia
    mature: { daily: 1000, hourly: 200 },    // Linhas maduras (> 30 dias) - 200 msg/hora, 1000/dia
  };

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => LineReputationService))
    private lineReputationService?: LineReputationService,
  ) {}

  /**
   * Verifica se uma linha pode enviar mensagem baseado no rate limit
   * @param lineId ID da linha
   * @returns true se pode enviar, false caso contrário
   * 
   * NOTA: Limites desabilitados - sempre retorna true
   */
  async canSendMessage(lineId: number): Promise<boolean> {
    // Limites desabilitados - sempre permite envio
    return true;
  }

  /**
   * Obtém o limite de mensagens baseado na idade da linha e reputação
   * @param lineAge Idade da linha em dias
   * @param lineId ID da linha (para calcular reputação)
   * @returns Limite de mensagens
   */
  private async getLimit(lineAge: number, lineId: number): Promise<RateLimit> {
    let baseLimit: RateLimit;
    
    if (lineAge < 7) {
      baseLimit = this.baseLimits.newLine;
    } else if (lineAge < 30) {
      baseLimit = this.baseLimits.warmingUp;
    } else {
      baseLimit = this.baseLimits.mature;
    }

    // Limites desabilitados - retornar valores altos para não bloquear
    // Ajustar limite baseado na reputação (se disponível) - DESABILITADO
    // if (this.lineReputationService) {
    //   try {
    //     const reputationLimit = await this.lineReputationService.getReputationBasedLimit(lineId);
    //     // Usar o menor entre o limite base e o limite baseado em reputação
    //     // Mas garantir mínimo de 50 mensagens/hora
    //     const adjustedDaily = Math.min(baseLimit.daily, reputationLimit);
    //     const adjustedHourly = Math.max(50, Math.min(baseLimit.hourly, Math.floor(reputationLimit / 6))); // Mínimo 50/hora
    //     return {
    //       daily: adjustedDaily,
    //       hourly: adjustedHourly,
    //     };
    //   } catch (error) {
    //     console.warn(`⚠️ [RateLimit] Erro ao calcular limite baseado em reputação:`, error.message);
    //     // Em caso de erro, usar limite base
    //   }
    // }

    // Retornar limites muito altos (praticamente ilimitado)
    return {
      daily: 999999,
      hourly: 999999,
    };
  }

  /**
   * Calcula a idade da linha em dias
   * @param createdAt Data de criação da linha
   * @returns Idade em dias
   */
  private getLineAge(createdAt: Date): number {
    const now = new Date();
    const diffTime = now.getTime() - createdAt.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)); // Converter para dias
  }

  /**
   * Obtém informações sobre o rate limit de uma linha
   * @param lineId ID da linha
   * @returns Informações sobre o rate limit
   */
  async getRateLimitInfo(lineId: number): Promise<{
    lineAge: number;
    limit: RateLimit;
    messagesToday: number;
    messagesLastHour: number;
    canSend: boolean;
  }> {
    const line = await this.prisma.linesStock.findUnique({
      where: { id: lineId },
    });

    if (!line) {
      throw new BadRequestException('Linha não encontrada');
    }

    const lineAge = this.getLineAge(line.createdAt);
    const limit = await this.getLimit(lineAge, lineId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const messagesToday = await this.prisma.conversation.count({
      where: {
        userLine: lineId,
        sender: 'operator',
        datetime: {
          gte: today,
        },
      },
    });

    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const messagesLastHour = await this.prisma.conversation.count({
      where: {
        userLine: lineId,
        sender: 'operator',
        datetime: {
          gte: oneHourAgo,
        },
      },
    });

    const canSend = messagesToday < limit.daily && messagesLastHour < limit.hourly;

    return {
      lineAge,
      limit,
      messagesToday,
      messagesLastHour,
      canSend,
    };
  }
}

