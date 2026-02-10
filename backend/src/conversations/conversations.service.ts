import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(private prisma: PrismaService) { }

  async create(createConversationDto: CreateConversationDto) {
    return this.prisma.conversation.create({
      data: {
        ...createConversationDto,
        datetime: new Date(),
      },
    });
  }

  async findAll(filters?: any) {
    // Remover campos inválidos que não existem no schema
    const { search, ...validFilters } = filters || {};

    // Se houver busca por texto, aplicar filtros
    const where = search
      ? {
        ...validFilters,
        OR: [
          { contactName: { contains: search, mode: 'insensitive' } },
          { contactPhone: { contains: search } },
          { message: { contains: search, mode: 'insensitive' } },
        ],
      }
      : validFilters;

    console.log(
      `🔍 [ConversationsService.findAll] Filters:`,
      JSON.stringify(filters),
      `Where:`,
      JSON.stringify(where)
    );

    return this.prisma.conversation.findMany({
      where,
      orderBy: {
        datetime: 'desc',
      },
    });
  }

  async findByContactPhone(contactPhone: string, tabulated: boolean = false, userId?: number) {
    const where: any = {
      contactPhone,
      tabulation: tabulated ? { not: null } : null,
    };

    // IMPORTANTE: Se for operador, filtrar por userId (não por userLine)
    // Isso permite que as conversas continuem aparecendo mesmo se a linha foi banida
    if (userId) {
      where.userId = userId;
    }

    return this.prisma.conversation.findMany({
      where,
      orderBy: {
        datetime: 'asc',
      },
    });
  }

  async findActiveConversations(userLine?: number, userId?: number) {
    const where: any = {
      tabulation: null,
    };

    // IMPORTANTE: Para operadores, buscar apenas por userId (não por userLine)
    // Isso permite que as conversas continuem aparecendo mesmo se a linha foi banida
    if (userId) {
      where.userId = userId;
    } else if (userLine) {
      // Fallback: se não tiver userId, usar userLine (para compatibilidade)
      where.userLine = userLine;
    }

    // Retornar TODAS as mensagens não tabuladas (SEM LIMITE - histórico completo)
    // O frontend vai agrupar por contactPhone/groupId
    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: {
        datetime: 'asc', // Ordem cronológica para histórico
      },
      // SEM take/limit - carregar todo o histórico
    });

    return conversations;
  }

  async findTabulatedConversations(userLine?: number, userId?: number) {
    const where: any = {
      tabulation: { not: null },
    };

    // IMPORTANTE: Para operadores, buscar apenas por userId (não por userLine)
    // Isso permite que as conversas tabuladas continuem aparecendo mesmo se a linha foi banida
    if (userId) {
      where.userId = userId;
    } else if (userLine) {
      // Fallback: se não tiver userId, usar userLine (para compatibilidade)
      where.userLine = userLine;
    }

    // Retornar TODAS as mensagens tabuladas (o frontend vai agrupar)
    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: {
        datetime: 'asc', // Ordem cronológica para histórico
      },
    });

    return conversations;
  }

  /**
   * Buscar conversas ativas de múltiplos operadores (modo linha compartilhada)
   */
  async findActiveConversationsByUserIds(userIds: number[]) {
    return this.prisma.conversation.findMany({
      where: {
        userId: { in: userIds },
        tabulation: null,
      },
      orderBy: {
        datetime: 'asc',
      },
    });
  }

  /**
   * Buscar conversas tabuladas de múltiplos operadores (modo linha compartilhada)
   */
  async findTabulatedConversationsByUserIds(userIds: number[]) {
    return this.prisma.conversation.findMany({
      where: {
        userId: { in: userIds },
        tabulation: { not: null },
      },
      orderBy: {
        datetime: 'asc',
      },
    });
  }

  async findOne(id: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversa com ID ${id} não encontrada`);
    }

    return conversation;
  }

  async update(id: number, updateConversationDto: UpdateConversationDto) {
    await this.findOne(id);

    return this.prisma.conversation.update({
      where: { id },
      data: updateConversationDto,
    });
  }

  async tabulateConversation(contactPhone: string, tabulationId: number) {
    // Atualizar todas as mensagens daquele contactPhone que ainda não foram tabuladas
    return this.prisma.conversation.updateMany({
      where: {
        contactPhone,
        tabulation: null,
      },
      data: {
        tabulation: tabulationId,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.conversation.delete({
      where: { id },
    });
  }

  async getConversationsBySegment(segment: number, tabulated: boolean = false) {
    return this.prisma.conversation.findMany({
      where: {
        segment,
        tabulation: tabulated ? { not: null } : null,
      },
      orderBy: {
        datetime: 'desc',
      },
    });
  }

  /**
   * Rechamar contato após linha banida
   * Cria uma nova conversa ativa para o contato na nova linha do operador
   */
  async recallContact(contactPhone: string, userId: number, userLine: number | null) {
    if (!userLine) {
      throw new NotFoundException('Operador não possui linha atribuída');
    }

    // Buscar contato
    const contact = await this.prisma.contact.findFirst({
      where: { phone: contactPhone },
    });

    if (!contact) {
      throw new NotFoundException('Contato não encontrado');
    }

    // Buscar última conversa com este contato para pegar dados
    const lastConversation = await this.prisma.conversation.findFirst({
      where: { contactPhone },
      orderBy: { datetime: 'desc' },
    });

    // Buscar dados do operador
    const operator = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!operator) {
      throw new NotFoundException('Operador não encontrado');
    }

    // Criar nova conversa ativa (não tabulada) na nova linha
    const newConversation = await this.prisma.conversation.create({
      data: {
        contactName: contact.name,
        contactPhone: contact.phone,
        segment: contact.segment || lastConversation?.segment || operator.segment,
        userName: operator.name,
        userLine: userLine,
        userId: userId,
        message: 'Contato rechamado após linha banida',
        sender: 'operator',
        messageType: 'text',
        tabulation: null, // Conversa ativa
      },
    });

    return newConversation;
  }

  /**
   * Transferir conversa de um operador para outro
   * Atualiza userId e userName de todas as mensagens não tabuladas do contato
   */
  async transferConversation(contactPhone: string, targetUserId: number, currentUser: any) {
    // Buscar operador alvo
    const targetOperator = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetOperator) {
      throw new NotFoundException('Operador alvo não encontrado');
    }

    // Buscar conversa ativa para obter o segmento
    const activeConversation = await this.prisma.conversation.findFirst({
      where: {
        contactPhone,
        tabulation: null,
      },
      orderBy: { datetime: 'desc' },
    });

    if (!activeConversation) {
      throw new NotFoundException('Nenhuma conversa ativa encontrada para este contato');
    }

    // Verificar que o operador alvo é do mesmo segmento da conversa
    if (activeConversation.segment && targetOperator.segment !== activeConversation.segment) {
      throw new NotFoundException(
        `Operador ${targetOperator.name} não pertence ao segmento da conversa`
      );
    }

    // Buscar a linha do operador alvo
    const targetLineOp = await this.prisma.lineOperator.findFirst({
      where: { userId: targetUserId },
      include: { line: true },
    });

    // Atualizar todas as mensagens não tabuladas deste contato
    const updated = await this.prisma.conversation.updateMany({
      where: {
        contactPhone,
        tabulation: null,
      },
      data: {
        userId: targetUserId,
        userName: targetOperator.name,
        userLine: targetLineOp?.lineId || null,
      },
    });

    console.log(
      `🔄 [ConversationsService.transferConversation] Transferido ${updated.count} mensagens de ${contactPhone} para ${targetOperator.name} (userId: ${targetUserId})`
    );

    return {
      transferred: updated.count,
      targetOperator: targetOperator.name,
      targetUserId: targetUserId,
    };
  }
}
