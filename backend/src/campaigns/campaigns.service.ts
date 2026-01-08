import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CampaignContact } from './dto/upload-campaign.dto';
import { ContactsService } from '../contacts/contacts.service';
import { UsersService } from '../users/users.service';
import { PhoneValidationService } from '../phone-validation/phone-validation.service';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectQueue('campaigns') private campaignsQueue: Queue,
    private prisma: PrismaService,
    private contactsService: ContactsService,
    private usersService: UsersService,
    private phoneValidationService: PhoneValidationService,
  ) {}

  async create(createCampaignDto: CreateCampaignDto) {
    // Converter endTime (HH:mm) para DateTime do dia atual
    let endTimeDate: Date | null = null;
    if (createCampaignDto.endTime) {
      const [hours, minutes] = createCampaignDto.endTime.split(':').map(Number);
      endTimeDate = new Date();
      endTimeDate.setHours(hours, minutes, 0, 0);
      // Se o horário já passou hoje, definir para amanhã
      if (endTimeDate < new Date()) {
        endTimeDate.setDate(endTimeDate.getDate() + 1);
      }
    }

    return this.prisma.campaign.create({
      data: {
        name: createCampaignDto.name,
        contactName: '',
        contactPhone: '',
        contactSegment: parseInt(createCampaignDto.segment),
        speed: createCampaignDto.speed,
        useTemplate: createCampaignDto.useTemplate || false,
        templateId: createCampaignDto.templateId,
        templateVariables: createCampaignDto.templateVariables 
          ? JSON.stringify(createCampaignDto.templateVariables) 
          : null,
        endTime: endTimeDate,
      },
    });
  }

  async uploadCampaign(
    campaignId: number,
    contacts: CampaignContact[],
    message?: string,
    useTemplate?: boolean,
    templateId?: number,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    // Buscar operadores online do segmento
    const onlineOperators = await this.usersService.getOnlineOperators(campaign.contactSegment);

    if (onlineOperators.length === 0) {
      throw new BadRequestException('Nenhum operador online disponível para este segmento');
    }

    // Buscar linhas disponíveis (através dos operadores)
    // Extrair todas as linhas dos operadores (filtrar apenas linhas ativas)
    const availableLines = onlineOperators
      .flatMap(op => op.lines.filter(line => line.lineStatus === 'active').map(line => line.id))
      .filter((lineId, index, self) => self.indexOf(lineId) === index); // Remover duplicatas

    if (availableLines.length === 0) {
      throw new BadRequestException('Nenhuma linha disponível para este segmento');
    }

    // Dividir contatos igualmente entre linhas
    const contactsPerLine = Math.ceil(contacts.length / availableLines.length);

    // Calcular distribuição uniforme até horário limite
    const now = new Date();
    let endTime: Date;
    
    if (campaign.endTime) {
      endTime = new Date(campaign.endTime);
      // Se o horário limite já passou, usar o próximo dia
      if (endTime <= now) {
        endTime.setDate(endTime.getDate() + 1);
      }
    } else {
      // Se não tem horário limite, usar a lógica antiga baseada em velocidade
      let delayMinutes = 6; // medium
      if (campaign.speed === 'fast') {
        delayMinutes = 3;
      } else if (campaign.speed === 'slow') {
        delayMinutes = 10;
      }
      endTime = new Date(now.getTime() + (contacts.length * delayMinutes * 60 * 1000));
    }

    const timeAvailable = endTime.getTime() - now.getTime(); // em milissegundos
    const timeAvailableMinutes = timeAvailable / (60 * 1000);

    // Calcular quantas "rodadas" serão necessárias (uma rodada = todas as linhas enviam simultaneamente)
    const totalRounds = Math.ceil(contacts.length / availableLines.length);
    
    // Calcular intervalo entre rodadas
    const intervalBetweenRounds = totalRounds > 1 
      ? timeAvailableMinutes / (totalRounds - 1) 
      : 0; // Se só tem 1 rodada, enviar imediatamente

    const intervalMs = intervalBetweenRounds * 60 * 1000;

    // Usar parâmetros do upload ou da campanha
    const finalUseTemplate = useTemplate !== undefined ? useTemplate : (campaign.useTemplate || false);
    const finalTemplateId = templateId !== undefined ? templateId : campaign.templateId;

    // Criar contatos e agendar envios
    // Distribuir em rodadas: cada rodada envia uma mensagem por linha simultaneamente
    const contactsByRound: { contact: CampaignContact; lineId: number }[][] = [];
    
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      
      // Normalizar telefone (remover espaços, hífens, adicionar 55 se necessário)
      const normalizedPhone = this.phoneValidationService.cleanPhone(contact.phone);
      
      // Criar contato normalizado
      const normalizedContact: CampaignContact = {
        ...contact,
        phone: normalizedPhone,
      };
      
      const lineIndex = i % availableLines.length; // Round-robin entre linhas
      const lineId = availableLines[lineIndex];
      const roundIndex = Math.floor(i / availableLines.length);

      if (!contactsByRound[roundIndex]) {
        contactsByRound[roundIndex] = [];
      }
      contactsByRound[roundIndex].push({ contact: normalizedContact, lineId });
    }

    // Encontrar operador para cada linha
    // Criar mapeamento de linhaId -> operador (incluir todas as linhas de cada operador)
    const lineToOperator = new Map<number, typeof onlineOperators[0]>();
    onlineOperators.forEach(op => {
      op.lines.forEach(line => {
        if (line.lineStatus === 'active' && !lineToOperator.has(line.id)) {
          lineToOperator.set(line.id, op);
        }
      });
    });

    // Processar cada rodada
    for (let roundIndex = 0; roundIndex < contactsByRound.length; roundIndex++) {
      const round = contactsByRound[roundIndex];
      
      for (const { contact, lineId } of round) {
        const operator = lineToOperator.get(lineId);
        if (!operator) continue;

        // Criar ou atualizar contato
        let existingContact = await this.contactsService.findByPhone(contact.phone);
        if (!existingContact) {
          await this.contactsService.create({
            name: contact.name,
            phone: contact.phone,
            cpf: contact.cpf,
            contract: contact.contract,
            segment: campaign.contactSegment,
          });
        } else if (contact.cpf || contact.contract) {
          // Atualizar contato existente com novos dados
          await this.contactsService.update(existingContact.id, {
            cpf: contact.cpf || existingContact.cpf,
            contract: contact.contract || existingContact.contract,
          });
        }

        // Criar registro da campanha
        const campaignRecord = await this.prisma.campaign.create({
          data: {
            name: campaign.name,
            contactName: contact.name,
            contactPhone: contact.phone,
            contactSegment: campaign.contactSegment,
            lineReceptor: lineId,
            speed: campaign.speed,
            response: false,
            useTemplate: finalUseTemplate,
            templateId: finalTemplateId,
            templateVariables: campaign.templateVariables,
            endTime: campaign.endTime,
          },
        });

        // Adicionar à fila com delay baseado na rodada
        const delay = roundIndex * intervalMs;
        await this.campaignsQueue.add(
          'send-campaign-message',
          {
            campaignId: campaignRecord.id,
            contactName: contact.name,
            contactPhone: contact.phone,
            contactSegment: campaign.contactSegment,
            lineId: lineId,
            message,
            useTemplate: finalUseTemplate,
            templateId: finalTemplateId,
            templateVariables: campaign.templateVariables,
          },
          {
            delay,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }
        );
      }
    }

    const estimatedCompletion = new Date(now.getTime() + (contactsByRound.length - 1) * intervalMs);
    
    return {
      message: `Campanha processada com sucesso. ${contacts.length} contatos agendados para envio.`,
      totalContacts: contacts.length,
      operators: onlineOperators.length,
      lines: availableLines.length,
      totalRounds: contactsByRound.length,
      intervalMinutes: intervalBetweenRounds.toFixed(2),
      estimatedCompletion: estimatedCompletion.toISOString(),
      endTime: endTime.toISOString(),
    };
  }

  async findAll(filters?: any) {
    // Remover campos inválidos que não existem no schema
    const { search, ...validFilters } = filters || {};
    
    // Se houver busca por texto, aplicar filtros
    const where = search 
      ? {
          ...validFilters,
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { contactName: { contains: search, mode: 'insensitive' } },
            { contactPhone: { contains: search } },
          ],
        }
      : validFilters;

    return this.prisma.campaign.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      throw new NotFoundException(`Campanha com ID ${id} não encontrada`);
    }

    return campaign;
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.campaign.delete({
      where: { id },
    });
  }

  async getStats(campaignName: string) {
    // Buscar todas as campanhas com este nome
    const campaigns = await this.prisma.campaign.findMany({
      where: { name: campaignName },
      select: {
        id: true,
        contactPhone: true,
        response: true,
        dateTime: true,
      },
    });

    const total = campaigns.length;
    const sent = campaigns.filter(c => c.response === true).length;
    const failed = campaigns.filter(c => c.response === false).length;
    const pending = total - sent - failed;

    // Buscar contatos que responderam (verificar na tabela Conversation)
    const contactPhones = campaigns.map(c => c.contactPhone);
    const earliestCampaignTime = campaigns.length > 0 
      ? new Date(Math.min(...campaigns.map(c => c.dateTime.getTime())))
      : new Date();

    // Buscar conversas onde o contato respondeu após o envio da campanha
    const conversations = await this.prisma.conversation.findMany({
      where: {
        contactPhone: { in: contactPhones },
        sender: 'contact', // Mensagens do contato (respostas)
        datetime: { gte: earliestCampaignTime },
      },
      select: {
        contactPhone: true,
      },
    });

    // Contar contatos únicos que responderam
    const uniqueResponders = new Set(conversations.map(c => c.contactPhone));
    const responses = uniqueResponders.size;

    return {
      totalContacts: total,
      sent,
      failed,
      pending,
      responses,
      successRate: total > 0 ? ((sent / total) * 100).toFixed(2) : '0',
      responseRate: sent > 0 ? ((responses / sent) * 100).toFixed(2) : '0',
    };
  }
}
