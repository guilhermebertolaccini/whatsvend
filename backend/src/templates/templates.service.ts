import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { SendTemplateDto, SendTemplateMassiveDto, TemplateVariableDto } from './dto/send-template.dto';
import { PhoneValidationService } from '../phone-validation/phone-validation.service';
import axios from 'axios';

@Injectable()
export class TemplatesService {
  constructor(
    private prisma: PrismaService,
    private phoneValidationService: PhoneValidationService,
  ) {}

  async create(createTemplateDto: CreateTemplateDto) {
    try {
      // Se um segmento foi fornecido, verificar se existe
      if (createTemplateDto.segmentId) {
        const segment = await this.prisma.segment.findUnique({
          where: { id: createTemplateDto.segmentId },
        });

        if (!segment) {
          throw new NotFoundException(`Segmento com ID ${createTemplateDto.segmentId} não encontrado`);
        }
      }

      // Serializar arrays para JSON (tratar arrays vazios como null)
      const buttons = createTemplateDto.buttons && createTemplateDto.buttons.length > 0 
        ? JSON.stringify(createTemplateDto.buttons) 
        : null;
      const variables = createTemplateDto.variables && createTemplateDto.variables.length > 0
        ? JSON.stringify(createTemplateDto.variables)
        : null;

      return this.prisma.template.create({
        data: {
          name: createTemplateDto.name,
          language: createTemplateDto.language || 'pt_BR',
          category: createTemplateDto.category || 'MARKETING',
          segmentId: createTemplateDto.segmentId || null,  // null = global
          lineId: createTemplateDto.lineId || null,  // Mantido para compatibilidade
          namespace: createTemplateDto.namespace || null,
          headerType: createTemplateDto.headerType || null,
          headerContent: createTemplateDto.headerContent || null,
          bodyText: createTemplateDto.bodyText,
          footerText: createTemplateDto.footerText || null,
          buttons,
          variables,
          status: 'APPROVED',  // Templates internos já vêm aprovados
        },
      });
    } catch (error) {
      console.error('❌ [TemplatesService] Erro ao criar template:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Erro ao criar template: ${error.message}`);
    }
  }

  async findAll(filters?: any) {
    const { search, lineId, segmentId, status } = filters || {};

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { bodyText: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (lineId) {
      const parsedLineId = parseInt(lineId);
      if (!isNaN(parsedLineId)) {
        where.lineId = parsedLineId;
      }
    }

    if (segmentId) {
      const parsedSegmentId = parseInt(segmentId);
      if (!isNaN(parsedSegmentId)) {
        where.segmentId = parsedSegmentId;
      }
    }

    if (status) {
      where.status = status;
    }

    const templates = await this.prisma.template.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Parse JSON fields com tratamento de erro
    return templates.map(template => {
      try {
        return {
          ...template,
          buttons: template.buttons ? JSON.parse(template.buttons) : null,
          variables: template.variables ? JSON.parse(template.variables) : null,
        };
      } catch (error) {
        // Se houver erro ao fazer parse, retornar sem parsear
        return {
          ...template,
          buttons: template.buttons,
          variables: template.variables,
        };
      }
    });
  }

  async findBySegment(segmentId: number) {
    // Retornar templates do segmento específico + templates globais (segmentId = null)
    const templates = await this.prisma.template.findMany({
      where: {
        OR: [
          { segmentId },
          { segmentId: null },  // Templates globais
        ],
        status: 'APPROVED',
      },
      orderBy: { createdAt: 'desc' },
    });

    return templates.map(template => ({
      ...template,
      buttons: template.buttons ? JSON.parse(template.buttons) : null,
      variables: template.variables ? JSON.parse(template.variables) : null,
    }));
  }

  async findOne(id: number) {
    const template = await this.prisma.template.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException(`Template com ID ${id} não encontrado`);
    }

    return {
      ...template,
      buttons: template.buttons ? JSON.parse(template.buttons) : null,
      variables: template.variables ? JSON.parse(template.variables) : null,
    };
  }

  async findByLine(lineId: number) {
    const templates = await this.prisma.template.findMany({
      where: { lineId },
      orderBy: { createdAt: 'desc' },
    });

    return templates.map(template => ({
      ...template,
      buttons: template.buttons ? JSON.parse(template.buttons) : null,
      variables: template.variables ? JSON.parse(template.variables) : null,
    }));
  }

  async update(id: number, updateTemplateDto: UpdateTemplateDto) {
    await this.findOne(id);

    const data: any = { ...updateTemplateDto };

    if (updateTemplateDto.buttons) {
      data.buttons = JSON.stringify(updateTemplateDto.buttons);
    }

    if (updateTemplateDto.variables) {
      data.variables = JSON.stringify(updateTemplateDto.variables);
    }

    const updated = await this.prisma.template.update({
      where: { id },
      data,
    });

    return {
      ...updated,
      buttons: updated.buttons ? JSON.parse(updated.buttons) : null,
      variables: updated.variables ? JSON.parse(updated.variables) : null,
    };
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.template.delete({
      where: { id },
    });
  }

  /**
   * Sincroniza template com WhatsApp Cloud API
   */
  async syncWithCloudApi(id: number) {
    const template = await this.findOne(id);
    const line = await this.prisma.linesStock.findUnique({
      where: { id: template.lineId },
    });

    if (!line || !line.oficial) {
      throw new BadRequestException('Linha não é oficial ou não encontrada');
    }

    if (!line.token || !line.businessID) {
      throw new BadRequestException('Linha não possui token ou businessID configurados');
    }

    try {
      // Montar componentes do template
      const components: any[] = [];

      // Header
      if (template.headerType && template.headerContent) {
        components.push({
          type: 'HEADER',
          format: template.headerType,
          text: template.headerType === 'TEXT' ? template.headerContent : undefined,
          example: template.headerType !== 'TEXT' ? { header_handle: [template.headerContent] } : undefined,
        });
      }

      // Body
      const bodyComponent: any = {
        type: 'BODY',
        text: template.bodyText,
      };

      if (template.variables && template.variables.length > 0) {
        bodyComponent.example = {
          body_text: [template.variables],
        };
      }
      components.push(bodyComponent);

      // Footer
      if (template.footerText) {
        components.push({
          type: 'FOOTER',
          text: template.footerText,
        });
      }

      // Buttons
      if (template.buttons && template.buttons.length > 0) {
        components.push({
          type: 'BUTTONS',
          buttons: template.buttons.map((btn: any) => ({
            type: btn.type,
            text: btn.text,
            url: btn.url,
            phone_number: btn.phoneNumber,
          })),
        });
      }

      // Enviar para Cloud API
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${line.businessID}/message_templates`,
        {
          name: template.name,
          language: template.language,
          category: template.category,
          components,
        },
        {
          headers: {
            'Authorization': `Bearer ${line.token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Atualizar status do template
      await this.prisma.template.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          namespace: response.data.id,
        },
      });

      return {
        success: true,
        message: 'Template enviado para aprovação',
        templateId: response.data.id,
      };
    } catch (error) {
      console.error('Erro ao sincronizar template:', error.response?.data || error.message);
      
      await this.prisma.template.update({
        where: { id },
        data: { status: 'REJECTED' },
      });

      throw new BadRequestException(
        `Erro ao sincronizar template: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Envia template para um contato (1x1)
   */
  async sendTemplate(dto: SendTemplateDto) {
    const template = await this.findOne(dto.templateId);
    
    // Normalizar telefone (remover espaços, hífens, adicionar 55 se necessário)
    const normalizedPhone = this.phoneValidationService.cleanPhone(dto.phone);
    dto.phone = normalizedPhone;
    
    // Usar lineId do DTO ou do template
    const lineId = dto.lineId || template.lineId;
    
    const line = await this.prisma.linesStock.findUnique({
      where: { id: lineId },
    });

    if (!line) {
      throw new NotFoundException(`Linha com ID ${lineId} não encontrada`);
    }

    // Verificar blocklist
    const isBlocked = await this.prisma.blockList.findFirst({
      where: { phone: dto.phone },
    });

    if (isBlocked) {
      throw new BadRequestException('Número está na lista de bloqueio');
    }

    // Preparar variáveis
    const variables = dto.variables || [];

    // Enviar via Cloud API ou Evolution
    let result;
    if (line.oficial && line.token && line.numberId) {
      result = await this.sendViaCloudApi(line, template, dto.phone, variables);
    } else {
      // Buscar Evolution para linha não-oficial
      const evolution = await this.prisma.evolution.findUnique({
        where: { evolutionName: line.evolutionName },
      });

      if (!evolution) {
        throw new NotFoundException('Evolution não encontrada para esta linha');
      }

      result = await this.sendViaEvolutionApi(line, evolution, template, dto.phone, variables);
    }

    // Criar registro de envio
    const templateMessage = await this.prisma.templateMessage.create({
      data: {
        templateId: dto.templateId,
        contactPhone: dto.phone,
        contactName: dto.contactName,
        lineId,
        status: result.success ? 'SENT' : 'FAILED',
        messageId: result.messageId,
        variables: variables.length > 0 ? JSON.stringify(variables) : null,
        errorMessage: result.error,
      },
    });

    // Criar conversa se enviado com sucesso
    if (result.success) {
      // Substituir variáveis no texto
      let messageText = template.bodyText;
      variables.forEach((v: TemplateVariableDto, index: number) => {
        messageText = messageText.replace(`{{${index + 1}}}`, v.value);
        messageText = messageText.replace(`{{${v.key}}}`, v.value);
      });

      await this.prisma.conversation.create({
        data: {
          contactName: dto.contactName || 'Contato',
          contactPhone: dto.phone,
          message: `[TEMPLATE: ${template.name}] ${messageText}`,
          sender: 'operator',
          messageType: 'template',
          userLine: lineId,
          userId: dto.userId || null, // ID do operador específico
          segment: dto.segment || line.segment || null, // Segmento do operador ou da linha
          userName: dto.userName || null, // Nome do operador
        },
      });
    }

    return {
      success: result.success,
      messageId: result.messageId,
      templateMessageId: templateMessage.id,
      error: result.error,
    };
  }

  /**
   * Envia template via WhatsApp Cloud API
   */
  private async sendViaCloudApi(
    line: any,
    template: any,
    phone: string,
    variables: TemplateVariableDto[],
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const cleanPhone = this.phoneValidationService.cleanPhone(phone);

      // Montar componentes com variáveis
      const components: any[] = [];

      // Header com variáveis
      if (template.headerType === 'TEXT' && template.headerContent) {
        const headerVars = variables.filter(v => v.key.startsWith('header'));
        if (headerVars.length > 0) {
          components.push({
            type: 'header',
            parameters: headerVars.map(v => ({
              type: 'text',
              text: v.value,
            })),
          });
        }
      }

      // Body com variáveis
      const bodyVars = variables.filter(v => !v.key.startsWith('header') && !v.key.startsWith('button'));
      if (bodyVars.length > 0) {
        components.push({
          type: 'body',
          parameters: bodyVars.map(v => ({
            type: 'text',
            text: v.value,
          })),
        });
      }

      // Buttons com variáveis
      const buttonVars = variables.filter(v => v.key.startsWith('button'));
      buttonVars.forEach((v, index) => {
        components.push({
          type: 'button',
          sub_type: 'url',
          index,
          parameters: [{
            type: 'text',
            text: v.value,
          }],
        });
      });

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${line.numberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'template',
          template: {
            name: template.name,
            language: { code: template.language },
            components: components.length > 0 ? components : undefined,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${line.token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
      };
    } catch (error) {
      console.error('Erro ao enviar template via Cloud API:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Envia template via Evolution API
   */
  private async sendViaEvolutionApi(
    line: any,
    evolution: any,
    template: any,
    phone: string,
    variables: TemplateVariableDto[],
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const instanceName = `line_${line.phone.replace(/\D/g, '')}`;
      const cleanPhone = this.phoneValidationService.cleanPhone(phone);

      // Substituir variáveis no texto
      let messageText = template.bodyText;
      variables.forEach((v: TemplateVariableDto, index: number) => {
        messageText = messageText.replace(`{{${index + 1}}}`, v.value);
        messageText = messageText.replace(`{{${v.key}}}`, v.value);
      });

      // Se a linha tiver token/businessID, enviar via Cloud API através da Evolution
      if (line.token && line.numberId) {
        const response = await axios.post(
          `${evolution.evolutionUrl}/message/sendTemplate/${instanceName}`,
          {
            number: cleanPhone,
            name: template.name,
            language: template.language,
            components: variables.length > 0 ? [{
              type: 'body',
              parameters: variables.map(v => ({
                type: 'text',
                text: v.value,
              })),
            }] : undefined,
          },
          {
            headers: { 'apikey': evolution.evolutionKey },
          }
        );

        // A resposta pode ter diferentes formatos dependendo da Evolution API
        let messageId: string | undefined;
        if (response.data?.key?.id) {
          messageId = response.data.key.id;
        } else if (response.data?.id) {
          messageId = response.data.id;
        } else if (response.data?.messageId) {
          messageId = response.data.messageId;
        }

        return {
          success: true,
          messageId,
        };
      }

      // Fallback: enviar como mensagem de texto normal
      const response = await axios.post(
        `${evolution.evolutionUrl}/message/sendText/${instanceName}`,
        {
          number: cleanPhone,
          text: messageText,
        },
        {
          headers: { 'apikey': evolution.evolutionKey },
        }
      );

      // A resposta pode ter diferentes formatos dependendo da Evolution API
      let messageId: string | undefined;
      if (response.data?.key?.id) {
        messageId = response.data.key.id;
      } else if (response.data?.id) {
        messageId = response.data.id;
      } else if (response.data?.messageId) {
        messageId = response.data.messageId;
      }

      return {
        success: true,
        messageId,
      };
    } catch (error: any) {
      console.error('Erro ao enviar template via Evolution:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });
      
      // Extrair mensagem de erro da resposta
      let errorMessage = error.message;
      if (error.response?.data?.message) {
        if (Array.isArray(error.response.data.message)) {
          errorMessage = error.response.data.message.join(', ');
        } else {
          errorMessage = error.response.data.message;
        }
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Envia template para múltiplos contatos (massivo)
   */
  async sendTemplateMassive(dto: SendTemplateMassiveDto) {
    const template = await this.findOne(dto.templateId);
    const lineId = dto.lineId || template.lineId;

    const results: Array<{
      phone: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }> = [];

    for (const recipient of dto.recipients) {
      try {
        const result = await this.sendTemplate({
          templateId: dto.templateId,
          phone: recipient.phone,
          contactName: recipient.contactName,
          variables: recipient.variables,
          lineId,
        });

        results.push({
          phone: recipient.phone,
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        });
      } catch (error) {
        results.push({
          phone: recipient.phone,
          success: false,
          error: error.message,
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      status: failed === 0 ? 'success' : successful === 0 ? 'error' : 'partial',
      total: dto.recipients.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Obtém histórico de envios de um template
   */
  async getTemplateHistory(templateId: number, filters?: any) {
    const { startDate, endDate, status } = filters || {};

    const where: any = { templateId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (status) {
      where.status = status;
    }

    return this.prisma.templateMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtém estatísticas de um template
   */
  async getTemplateStats(templateId: number) {
    const total = await this.prisma.templateMessage.count({
      where: { templateId },
    });

    const sent = await this.prisma.templateMessage.count({
      where: { templateId, status: 'SENT' },
    });

    const delivered = await this.prisma.templateMessage.count({
      where: { templateId, status: 'DELIVERED' },
    });

    const read = await this.prisma.templateMessage.count({
      where: { templateId, status: 'READ' },
    });

    const failed = await this.prisma.templateMessage.count({
      where: { templateId, status: 'FAILED' },
    });

    return {
      total,
      sent,
      delivered,
      read,
      failed,
      deliveryRate: total > 0 ? ((delivered / total) * 100).toFixed(2) : '0',
      readRate: delivered > 0 ? ((read / delivered) * 100).toFixed(2) : '0',
    };
  }
}

