import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface LineReputation {
  lineId: number;
  linePhone: string;
  blockRate: number;        // % de contatos que bloquearam
  responseRate: number;     // % de contatos que responderam
  messagesPerDay: number;   // Média de mensagens/dia (últimos 7 dias)
  healthScore: number;      // 0-100 (calculado)
  lastCalculated: Date;
}

@Injectable()
export class LineReputationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calcula a reputação de uma linha
   * @param lineId ID da linha
   * @returns Reputação da linha
   */
  async calculateReputation(lineId: number): Promise<LineReputation> {
    const line = await this.prisma.linesStock.findUnique({
      where: { id: lineId },
    });

    if (!line) {
      throw new Error('Linha não encontrada');
    }

    // Período de análise: últimos 7 dias
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Buscar todas as conversas da linha nos últimos 7 dias
    const conversations = await this.prisma.conversation.findMany({
      where: {
        userLine: lineId,
        datetime: {
          gte: sevenDaysAgo,
        },
      },
      select: {
        contactPhone: true,
        sender: true,
        datetime: true,
      },
    });

    // Contar contatos únicos
    const uniqueContacts = new Set(conversations.map(c => c.contactPhone));
    const totalContacts = uniqueContacts.size;

    if (totalContacts === 0) {
      // Linha nova sem histórico
      return {
        lineId,
        linePhone: line.phone,
        blockRate: 0,
        responseRate: 0,
        messagesPerDay: 0,
        healthScore: 50, // Score neutro para linhas novas
        lastCalculated: new Date(),
      };
    }

    // Calcular taxa de resposta
    // Um contato "respondeu" se enviou pelo menos uma mensagem após receber uma do operador
    let respondedContacts = 0;
    for (const contactPhone of uniqueContacts) {
      const contactConversations = conversations
        .filter(c => c.contactPhone === contactPhone)
        .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

      // Verificar se há mensagem do operador seguida de mensagem do contato
      for (let i = 0; i < contactConversations.length - 1; i++) {
        if (contactConversations[i].sender === 'operator' && 
            contactConversations[i + 1].sender === 'contact') {
          respondedContacts++;
          break;
        }
      }
    }

    const responseRate = totalContacts > 0 ? (respondedContacts / totalContacts) * 100 : 0;

    // Calcular taxa de bloqueio (aproximação: contatos que receberam mensagem mas nunca responderam)
    // Nota: Não temos acesso direto a bloqueios, então usamos como proxy: contatos que receberam mensagem mas não responderam após 24h
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    let blockedContacts = 0;
    for (const contactPhone of uniqueContacts) {
      const contactConversations = conversations
        .filter(c => c.contactPhone === contactPhone)
        .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

      // Se última mensagem foi do operador há mais de 24h e não houve resposta
      const lastMessage = contactConversations[contactConversations.length - 1];
      if (lastMessage.sender === 'operator' && 
          new Date(lastMessage.datetime) < oneDayAgo) {
        // Verificar se houve resposta após essa mensagem
        const hasResponse = contactConversations.some(
          c => c.sender === 'contact' && 
               new Date(c.datetime) > new Date(lastMessage.datetime)
        );
        if (!hasResponse) {
          blockedContacts++;
        }
      }
    }

    const blockRate = totalContacts > 0 ? (blockedContacts / totalContacts) * 100 : 0;

    // Calcular média de mensagens por dia
    const messagesPerDay = conversations.length / 7;

    // Calcular health score (0-100)
    // Fórmula: (responseRate * 0.6) - (blockRate * 0.3) + (normalizedMessagesPerDay * 0.1)
    // Normalizar messagesPerDay (assumir que 50 mensagens/dia é ideal)
    const normalizedMessagesPerDay = Math.min(messagesPerDay / 50, 1) * 100;
    
    let healthScore = (responseRate * 0.6) - (blockRate * 0.3) + (normalizedMessagesPerDay * 0.1);
    healthScore = Math.max(0, Math.min(100, healthScore)); // Garantir entre 0-100

    return {
      lineId,
      linePhone: line.phone,
      blockRate: Math.round(blockRate * 100) / 100,
      responseRate: Math.round(responseRate * 100) / 100,
      messagesPerDay: Math.round(messagesPerDay * 100) / 100,
      healthScore: Math.round(healthScore * 100) / 100,
      lastCalculated: new Date(),
    };
  }

  /**
   * Obtém a reputação de uma linha (com cache)
   * @param lineId ID da linha
   * @returns Reputação da linha
   */
  async getLineReputation(lineId: number): Promise<LineReputation> {
    return await this.calculateReputation(lineId);
  }

  /**
   * Verifica se uma linha está saudável o suficiente para enviar mensagens
   * @param lineId ID da linha
   * @returns true se a linha está saudável
   */
  async isLineHealthy(lineId: number): Promise<boolean> {
    const reputation = await this.calculateReputation(lineId);
    return reputation.healthScore >= 30; // Linha precisa ter score >= 30 para ser considerada saudável
  }

  /**
   * Obtém o limite de mensagens baseado na reputação
   * @param lineId ID da linha
   * @returns Limite de mensagens por dia
   */
  async getReputationBasedLimit(lineId: number): Promise<number> {
    const reputation = await this.calculateReputation(lineId);
    
    // Ajustar limite baseado no health score
    if (reputation.healthScore < 30) {
      return 10; // Limite muito baixo para linhas com baixa reputação
    } else if (reputation.healthScore < 50) {
      return 30; // Limite reduzido
    } else if (reputation.healthScore < 70) {
      return 80; // Limite moderado
    } else {
      return 150; // Limite normal para linhas saudáveis
    }
  }
}

