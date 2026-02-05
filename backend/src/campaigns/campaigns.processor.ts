import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BlocklistService } from '../blocklist/blocklist.service';
import { ConversationsService } from '../conversations/conversations.service';
import { RateLimitingService } from '../rate-limiting/rate-limiting.service';
import { LineReputationService } from '../line-reputation/line-reputation.service';
import { AppLoggerService } from '../logger/logger.service';
import { PhoneValidationService } from '../phone-validation/phone-validation.service';
import axios from 'axios';

interface TemplateVariable {
  key: string;
  value: string;
}

@Injectable()
@Processor('campaigns')
export class CampaignsProcessor {
  constructor(
    private prisma: PrismaService,
    private blocklistService: BlocklistService,
    private conversationsService: ConversationsService,
    private rateLimitingService: RateLimitingService,
    private lineReputationService: LineReputationService,
    private logger: AppLoggerService,
    private phoneValidationService: PhoneValidationService,
    private linesService: LinesService,
  ) { }

  @Process('send-campaign-message')
  async handleSendMessage(job: Job) {
    const {
      campaignId,
      contactName,
      contactPhone,
      contactSegment,
      lineId,
      message,
      useTemplate,
      templateId,
      templateVariables,
    } = job.data;

    try {
      // Verificar se está na blocklist
      const isBlocked = await this.blocklistService.isBlocked(contactPhone);
      if (isBlocked) {
        console.log(`❌ Contato ${contactPhone} está na blocklist`);
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { response: false },
        });
        return;
      }

      // Buscar a linha
      let line = await this.prisma.linesStock.findUnique({
        where: { id: lineId },
      });

      if (!line || line.lineStatus !== 'active') {
        throw new Error('Linha não disponível');
      }

      // Rate Limiting: Verificar se a linha pode enviar mensagem (CAMPANHAS TAMBÉM RESPEITAM LIMITES)
      const canSend = await this.rateLimitingService.canSendMessage(lineId);
      if (!canSend) {
        const rateLimitInfo = await this.rateLimitingService.getRateLimitInfo(lineId);
        this.logger.warn(
          `Campanha: Limite de mensagens atingido para linha ${line.phone}`,
          'CampaignsProcessor',
          { campaignId, lineId, rateLimitInfo },
        );
        throw new Error(`Limite de mensagens atingido (${rateLimitInfo.messagesToday}/${rateLimitInfo.limit.daily} hoje)`);
      }

      // Verificar reputação da linha
      const isLineHealthy = await this.lineReputationService.isLineHealthy(lineId);
      if (!isLineHealthy) {
        this.logger.warn(
          `Campanha: Linha ${line.phone} com baixa reputação`,
          'CampaignsProcessor',
          { campaignId, lineId },
        );
        throw new Error('Linha com baixa reputação, envio bloqueado');
      }

      // Buscar evolução
      let evolution = await this.prisma.evolution.findUnique({
        where: { evolutionName: line.evolutionName },
      });

      if (!evolution) {
        throw new Error('Evolution não encontrada');
      }

      let instanceName = `line_${line.phone.replace(/\D/g, '')}`;
      // Normalizar telefone (remover espaços, hífens, adicionar 55 se necessário)
      const cleanPhone = this.phoneValidationService.cleanPhone(contactPhone);

      let retries = 0;
      let sent = false;
      let finalMessage = message || 'Olá! Esta é uma mensagem da nossa campanha.';

      while (retries < 3 && !sent) {
        try {
          // Se usar template, enviar via template
          if (useTemplate && templateId) {
            const template = await this.prisma.template.findUnique({
              where: { id: templateId },
            });

            if (!template) {
              throw new Error('Template não encontrado');
            }

            // Substituir variáveis no template
            let templateText = template.bodyText;
            const variables: TemplateVariable[] = templateVariables ?
              (typeof templateVariables === 'string' ? JSON.parse(templateVariables) : templateVariables)
              : [];

            variables.forEach((v: TemplateVariable, index: number) => {
              templateText = templateText.replace(`{{${index + 1}}}`, v.value);
              templateText = templateText.replace(`{{${v.key}}}`, v.value);
            });

            finalMessage = templateText;

            // Se linha oficial, enviar via Cloud API
            if (line.oficial && line.token && line.numberId) {
              await this.sendTemplateViaCloudApi(line, template, cleanPhone, variables);
            } else {
              // Enviar via Evolution API
              await this.sendTemplateViaEvolution(evolution, instanceName, template, cleanPhone, variables);
            }

            // Registrar envio de template
            await this.prisma.templateMessage.create({
              data: {
                templateId: template.id,
                contactPhone,
                contactName,
                lineId,
                status: 'SENT',
                variables: variables.length > 0 ? JSON.stringify(variables) : null,
                campaignId,
              },
            });
          } else {
            // Envio de mensagem de texto normal
            await axios.post(
              `${evolution.evolutionUrl}/message/sendText/${instanceName}`,
              {
                number: cleanPhone,
                text: finalMessage,
              },
              {
                headers: {
                  'apikey': evolution.evolutionKey,
                },
              }
            );
          }

          sent = true;

          // Buscar operadores da linha e distribuir (máximo 2)
          const lineOperators = await this.prisma.lineOperator.findMany({
            where: { lineId },
            include: {
              user: true,
            },
          });

          // Filtrar apenas operadores online
          const onlineOperators = lineOperators
            .filter(lo => lo.user.status === 'Online' && lo.user.role === 'operator')
            .map(lo => lo.user);

          // Se não houver operadores online, usar null (sistema)
          let assignedOperatorId: number | null = null;
          if (onlineOperators.length > 0) {
            // Distribuir de forma round-robin: contar conversas ativas de cada operador
            const operatorConversationCounts = await Promise.all(
              onlineOperators.map(async (operator) => {
                const count = await this.prisma.conversation.count({
                  where: {
                    userLine: lineId,
                    userId: operator.id,
                    tabulation: null,
                  },
                });
                return { operatorId: operator.id, count };
              })
            );

            operatorConversationCounts.sort((a, b) => a.count - b.count);
            assignedOperatorId = operatorConversationCounts[0]?.operatorId || onlineOperators[0]?.id || null;
          }

          // Registrar conversa
          await this.conversationsService.create({
            contactName,
            contactPhone,
            segment: contactSegment,
            userName: 'Sistema',
            userLine: lineId,
            userId: assignedOperatorId, // Operador específico que vai receber a resposta
            message: useTemplate ? `[TEMPLATE] ${finalMessage}` : finalMessage,
            sender: 'operator',
            messageType: useTemplate ? 'template' : 'text',
          });

          // Atualizar campanha
          await this.prisma.campaign.update({
            where: { id: campaignId },
            data: { response: true },
          });

          console.log(`✅ Mensagem ${useTemplate ? '(template)' : ''} enviada para ${contactPhone}`);
        } catch (error) {
          // LÓGICA DE RETRY INTELIGENTE COM TROCA DE LINHA
          try {
            // 1. Verificar saúde da linha atual na API
            const health = await this.linesService.verifyLineHealth(lineId);

            if (health.status !== 'active') { // Banida, desconectada ou offline
              this.logger.warn(
                `⚠️ Linha ${lineId} identificada como ${health.status} após erro. Tentando trocar...`,
                'CampaignsProcessor',
                { campaignId, lineId }
              );

              // 2. Tentar encontrar outra linha ativa do mesmo segmento
              const replacementLine = await this.prisma.linesStock.findFirst({
                where: {
                  segment: contactSegment,
                  lineStatus: 'active',
                  id: { not: lineId }
                }
              });

              if (replacementLine) {
                // Buscar evolution da nova linha
                const newEvolution = await this.prisma.evolution.findUnique({
                  where: { evolutionName: replacementLine.evolutionName }
                });

                if (newEvolution) {
                  this.logger.log(
                    `🔄 Trocando para linha ${replacementLine.phone} (${replacementLine.id})`,
                    'CampaignsProcessor'
                  );

                  // Atualizar variáveis para a próxima iteração
                  lineId = replacementLine.id;
                  line = replacementLine;
                  evolution = newEvolution;
                  instanceName = `line_${line.phone.replace(/\D/g, '')}`;

                  // Não incrementar retries, pois a falha foi da linha anterior
                  // O loop vai rodar de novo com a nova linha
                  continue;
                }
              } else {
                this.logger.warn('❌ Nenhuma linha reserva disponível para substituição.', 'CampaignsProcessor');
              }
            } else {
              this.logger.log(`✅ Linha ${lineId} verificada e está saudável. Tentando novamente na mesma linha.`, 'CampaignsProcessor');
            }
          } catch (verifyError) {
            console.error('Erro ao verificar/trocar linha:', verifyError);
          }

          retries++;
          console.error(`Tentativa ${retries} falhou para ${contactPhone}:`, error.message);

          if (retries >= 3) {
            await this.prisma.campaign.update({
              where: { id: campaignId },
              data: {
                response: false,
                retryCount: retries,
              },
            });

            // Se template, registrar falha
            if (useTemplate && templateId) {
              await this.prisma.templateMessage.create({
                data: {
                  templateId,
                  contactPhone,
                  contactName,
                  lineId,
                  status: 'FAILED',
                  errorMessage: error.message,
                  campaignId,
                },
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao processar campanha:', error);
      throw error;
    }
  }

  /**
   * Envia template via WhatsApp Cloud API
   */
  private async sendTemplateViaCloudApi(
    line: any,
    template: any,
    phone: string,
    variables: TemplateVariable[],
  ) {
    const components: any[] = [];

    // Body com variáveis
    if (variables.length > 0) {
      components.push({
        type: 'body',
        parameters: variables.map(v => ({
          type: 'text',
          text: v.value,
        })),
      });
    }

    await axios.post(
      `https://graph.facebook.com/v18.0/${line.numberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone,
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
  }

  /**
   * Envia template via Evolution API
   */
  private async sendTemplateViaEvolution(
    evolution: any,
    instanceName: string,
    template: any,
    phone: string,
    variables: TemplateVariable[],
  ) {
    // Substituir variáveis no texto do template
    let messageText = template.bodyText;
    variables.forEach((v: TemplateVariable, index: number) => {
      messageText = messageText.replace(`{{${index + 1}}}`, v.value);
      messageText = messageText.replace(`{{${v.key}}}`, v.value);
    });

    // Tenta enviar como template primeiro
    try {
      await axios.post(
        `${evolution.evolutionUrl}/message/sendTemplate/${instanceName}`,
        {
          number: phone,
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
    } catch (error) {
      // Fallback: envia como mensagem de texto
      console.log('Fallback para mensagem de texto:', error.message);
      await axios.post(
        `${evolution.evolutionUrl}/message/sendText/${instanceName}`,
        {
          number: phone,
          text: messageText,
        },
        {
          headers: { 'apikey': evolution.evolutionKey },
        }
      );
    }
  }
}
