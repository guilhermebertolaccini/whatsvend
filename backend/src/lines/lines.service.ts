import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateLineDto } from './dto/create-line.dto';
import { UpdateLineDto } from './dto/update-line.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { SystemEventsService, EventType, EventModule, EventSeverity } from '../system-events/system-events.service';
import { HealthCheckCacheService } from '../health-check-cache/health-check-cache.service';
import axios from 'axios';

@Injectable()
export class LinesService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    private controlPanelService: ControlPanelService,
    private systemEventsService: SystemEventsService,
    private healthCheckCacheService: HealthCheckCacheService,
  ) { }

  async create(createLineDto: CreateLineDto, createdBy?: number) {
    console.log('📝 Dados recebidos no service:', JSON.stringify(createLineDto, null, 2));

    // Limpar strings vazias e converter para null
    if (createLineDto.token === '') createLineDto.token = null;
    if (createLineDto.businessID === '') createLineDto.businessID = null;
    if (createLineDto.numberId === '') createLineDto.numberId = null;

    console.log('📝 Dados após limpeza:', JSON.stringify(createLineDto, null, 2));

    // Verificar se já existe uma linha com este telefone
    const existingLine = await this.prisma.linesStock.findUnique({
      where: { phone: createLineDto.phone },
    });

    if (existingLine) {
      throw new BadRequestException('Já existe uma linha com este telefone');
    }

    // Buscar configuração da Evolution
    const evolution = await this.prisma.evolution.findUnique({
      where: { evolutionName: createLineDto.evolutionName },
    });

    if (!evolution) {
      throw new NotFoundException(`Evolution "${createLineDto.evolutionName}" não encontrada. Evolutions disponíveis: ${await this.getAvailableEvolutionNames()}`);
    }

    // Testar conexão com Evolution antes de criar instância
    try {
      console.log('🔍 Testando conexão com Evolution:', evolution.evolutionUrl);

      const testResponse = await axios.get(
        `${evolution.evolutionUrl}/manager/getInstances`,
        {
          headers: {
            'apikey': evolution.evolutionKey,
          },
          timeout: 10000,
        }
      );

      console.log('✅ Conexão com Evolution OK. Instâncias encontradas:', testResponse.data?.length || 0);
    } catch (testError) {
      console.error('❌ Falha ao conectar com Evolution:', {
        url: evolution.evolutionUrl,
        error: testError.message,
        response: testError.response?.data,
        status: testError.response?.status,
      });
      throw new BadRequestException(
        `Não foi possível conectar à Evolution API. Verifique a URL (${evolution.evolutionUrl}) e a chave da Evolution "${evolution.evolutionName}".`
      );
    }

    // Criar instância na Evolution API
    try {
      const instanceName = `line_${createLineDto.phone.replace(/\D/g, '')}`;
      const webhookUrl = `${process.env.APP_URL || 'http://localhost:3000'}/webhooks/evolution`;

      const requestData = {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        syncFullHistory: true, // Sincronizar histórico completo ao conectar
      };

      console.log('📡 Criando instância na Evolution:', {
        instanceName,
        evolutionUrl: evolution.evolutionUrl,
        requestData,
      });

      // Criar instância
      const createResponse = await axios.post(
        `${evolution.evolutionUrl}/instance/create`,
        requestData,
        {
          headers: {
            'apikey': evolution.evolutionKey,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log('✅ Instância criada:', {
        instanceName,
        response: createResponse.data,
      });

      // Configurar webhook separadamente (aguardar 2 segundos para garantir que a instância está pronta)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // webhook_base64 = true para receber mídia (imagens, áudios, docs) em base64
      const enableBase64 = createLineDto.receiveMedia === true;

      try {
        const webhookData = {
          url: webhookUrl,
          enabled: true,
          webhook_by_events: true,
          webhook_base64: enableBase64, // Ativa base64 apenas se linha tiver receiveMedia = true
          events: [
            'QRCODE_UPDATED',      // QR Code atualizado
            'MESSAGES_UPSERT',     // Mensagens recebidas/enviadas
            'MESSAGES_UPDATE',     // Atualização de status (sent, delivered, read)
            'MESSAGES_DELETE',     // Mensagem deletada
            'SEND_MESSAGE',        // Mensagem enviada
            'CONNECTION_UPDATE',   // Atualização de conexão
            'CHATS_UPSERT',        // Chat criado/atualizado
            'CONTACTS_UPDATE',     // Contato atualizado
            'GROUPS_UPSERT',       // Grupo criado/atualizado
          ],
        };

        console.log('🔗 Configurando webhook:', {
          instanceName,
          url: `${evolution.evolutionUrl}/webhook/set/${instanceName}`,
          webhookData,
        });

        const webhookResponse = await axios.post(
          `${evolution.evolutionUrl}/webhook/set/${instanceName}`,
          webhookData,
          {
            headers: {
              'apikey': evolution.evolutionKey,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        console.log('✅ Webhook configurado com sucesso:', webhookResponse.data);
      } catch (webhookError) {
        console.error('⚠️ Erro ao configurar webhook (formato direto):', {
          error: webhookError.message,
          response: JSON.stringify(webhookError.response?.data, null, 2),
          status: webhookError.response?.status,
        });

        // Tentar formato alternativo com wrapper
        if (webhookError.response?.status === 400 || webhookError.response?.status === 422) {
          console.log('🔄 Tentando formato alternativo com wrapper webhook...');
          try {
            const alternativePayload = {
              webhook: {
                url: webhookUrl,
                enabled: true,
                webhook_by_events: true,
                webhook_base64: enableBase64,
                events: [
                  'QRCODE_UPDATED',
                  'MESSAGES_UPSERT',
                  'MESSAGES_UPDATE',
                  'MESSAGES_DELETE',
                  'SEND_MESSAGE',
                  'CONNECTION_UPDATE',
                  'CHATS_UPSERT',
                  'CONTACTS_UPDATE',
                  'GROUPS_UPSERT',
                ],
              },
            };

            console.log('🔗 Payload alternativo:', alternativePayload);

            const altResponse = await axios.post(
              `${evolution.evolutionUrl}/webhook/set/${instanceName}`,
              alternativePayload,
              {
                headers: {
                  'apikey': evolution.evolutionKey,
                  'Content-Type': 'application/json',
                },
                timeout: 10000,
              }
            );

            console.log('✅ Webhook configurado com formato alternativo:', altResponse.data);
          } catch (retryError) {
            console.error('❌ Erro também com formato alternativo:', {
              error: retryError.message,
              response: JSON.stringify(retryError.response?.data, null, 2),
            });
            console.warn('⚠️ Webhook não configurado automaticamente. Configure manualmente na Evolution API.');
          }
        } else {
          console.warn('⚠️ Webhook não configurado automaticamente. Configure manualmente na Evolution API.');
        }
      }

      // Configurar settings da instância
      try {
        const settingsData = {
          reject_call: false,
          msg_call: '',
          groups_ignore: false,
          always_online: true,
          read_messages: false,
          read_status: false,
          sync_full_history: true, // Importante: sincronizar histórico completo
        };

        console.log('⚙️ Configurando settings da instância:', {
          instanceName,
          settingsData,
        });

        const settingsResponse = await axios.post(
          `${evolution.evolutionUrl}/settings/set/${instanceName}`,
          settingsData,
          {
            headers: {
              'apikey': evolution.evolutionKey,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        console.log('✅ Settings configurados com sucesso:', settingsResponse.data);
      } catch (settingsError) {
        console.error('⚠️ Erro ao configurar settings:', {
          error: settingsError.message,
          response: JSON.stringify(settingsError.response?.data, null, 2),
        });
        console.warn('⚠️ Settings não configurados automaticamente. A instância funcionará com configurações padrão.');
      }

      // Criar linha no banco
      const newLine = await this.prisma.linesStock.create({
        data: {
          ...createLineDto,
          createdBy, // Salvar quem criou a linha
        },
      });

      // Tentar vincular automaticamente a um operador online sem linha do mesmo segmento
      if (newLine.segment) {
        await this.tryAssignLineToOperator(newLine.id, newLine.segment);
      }

      return newLine;
    } catch (error) {
      console.error('❌ Erro ao criar linha (detalhado):', {
        message: error.message,
        responseData: JSON.stringify(error.response?.data, null, 2),
        status: error.response?.status,
        url: error.config?.url,
        method: error.config?.method,
        requestData: error.config?.data,
      });

      // Extrair mensagem de erro detalhada
      let errorMsg = 'Erro desconhecido';

      if (error.response?.data?.response?.message) {
        const messages = error.response.data.response.message;
        errorMsg = Array.isArray(messages)
          ? messages.join(', ')
          : messages;
      } else if (error.response?.data?.message) {
        const messages = error.response.data.message;
        errorMsg = Array.isArray(messages)
          ? messages.join(', ')
          : messages;
      } else if (error.response?.data) {
        errorMsg = JSON.stringify(error.response.data);
      } else {
        errorMsg = error.message;
      }

      if (error.message.includes('P2002')) {
        throw new BadRequestException('Telefone já cadastrado');
      }

      throw new BadRequestException(`Erro na Evolution API: ${errorMsg}`);
    }
  }

  async findAll(filters?: any) {
    // Remover campos inválidos que não existem no schema
    const { search, lineStatus, ...validFilters } = filters || {};

    // Construir where clause
    const where: any = { ...validFilters };

    // Aplicar filtro de status se fornecido
    if (lineStatus) {
      where.lineStatus = lineStatus;
    }

    // Se houver busca por texto, aplicar filtros
    if (search) {
      where.OR = [
        { phone: { contains: search, mode: 'insensitive' } },
        { evolutionName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Buscar segmentos para mapeamento
    const segments = await this.prisma.segment.findMany();
    const segmentMap = new Map(segments.map(s => [s.id, s]));

    const lines = await this.prisma.linesStock.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        operators: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Mapear para incluir operadores vinculados e nome do segmento
    return lines.map(line => ({
      ...line,
      segmentName: line.segment ? segmentMap.get(line.segment)?.name : null,
      operators: line.operators.map(lo => ({
        id: lo.user.id,
        name: lo.user.name,
        email: lo.user.email,
      })),
    }));
  }

  async findOne(id: number) {
    const line = await this.prisma.linesStock.findUnique({
      where: { id },
    });

    if (!line) {
      throw new NotFoundException(`Linha com ID ${id} não encontrada`);
    }

    return line;
  }

  async getQRCode(id: number) {
    const line = await this.findOne(id);
    const evolution = await this.prisma.evolution.findUnique({
      where: { evolutionName: line.evolutionName },
    });

    if (!evolution) {
      throw new NotFoundException('Evolution não encontrada para esta linha');
    }

    try {
      const instanceName = `line_${line.phone.replace(/\D/g, '')}`;

      // Primeiro, verificar o status da conexão
      try {
        const connectionResponse = await axios.get(
          `${evolution.evolutionUrl}/instance/connectionState/${instanceName}`,
          {
            headers: {
              'apikey': evolution.evolutionKey,
            },
          }
        );

        console.log('Status da conexão:', connectionResponse.data);

        // Se já está conectado, não precisa de QR Code
        if (connectionResponse.data?.state === 'open' || connectionResponse.data?.instance?.state === 'open') {
          // Atualizar status da linha para 'active' se ainda não estiver
          if (line.lineStatus !== 'active') {
            await this.prisma.linesStock.update({
              where: { id },
              data: { lineStatus: 'active' },
            });
            console.log(`✅ Linha ${line.phone} marcada como ACTIVE após conexão`);
          }
          return { qrcode: null, connected: true, message: 'Linha já está conectada' };
        }
      } catch (connError) {
        console.log('Não foi possível verificar status da conexão, continuando...');
      }

      // Buscar o QR Code
      const response = await axios.get(
        `${evolution.evolutionUrl}/instance/connect/${instanceName}`,
        {
          headers: {
            'apikey': evolution.evolutionKey,
          },
        }
      );

      console.log('Resposta do QR Code:', JSON.stringify(response.data, null, 2));

      // Normalizar a resposta para o formato esperado pelo frontend
      // A Evolution API pode retornar em diferentes formatos
      let qrcode = null;

      if (response.data?.base64) {
        // Formato: { base64: "data:image/png;base64,..." }
        qrcode = response.data.base64;
      } else if (response.data?.qrcode?.base64) {
        // Formato: { qrcode: { base64: "..." } }
        qrcode = response.data.qrcode.base64;
      } else if (response.data?.code) {
        // Formato: { code: "texto do qr" } - precisa gerar imagem
        qrcode = response.data.code;
      } else if (typeof response.data === 'string' && response.data.startsWith('data:image')) {
        // Formato: string base64 direto
        qrcode = response.data;
      } else if (response.data?.pairingCode) {
        // Pairing code para WhatsApp Web
        return {
          qrcode: null,
          pairingCode: response.data.pairingCode,
          message: 'Use o código de pareamento'
        };
      }

      if (!qrcode) {
        console.warn('Formato de resposta não reconhecido:', response.data);
        // Retornar os dados brutos para debug
        return {
          qrcode: null,
          rawData: response.data,
          message: 'QR Code não disponível no momento. Verifique se a instância está pronta.'
        };
      }

      return { qrcode };
    } catch (error) {
      console.error('Erro ao obter QR Code:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        throw new NotFoundException('Instância não encontrada na Evolution API. Tente recriar a linha.');
      }

      if (error.response?.data?.message) {
        throw new BadRequestException(`Erro na Evolution API: ${error.response.data.message}`);
      }

      throw new BadRequestException(`Erro ao obter QR Code: ${error.message || 'Erro desconhecido'}`);
    }
  }

  async update(id: number, updateLineDto: UpdateLineDto) {
    const currentLine = await this.findOne(id);

    // PROTEÇÃO: Segmento da linha NÃO pode ser alterado após definido
    // Somente linhas com segmento null ou "Padrão" podem mudar de segmento (atribuição inicial)
    if (updateLineDto.segment !== undefined && updateLineDto.segment !== currentLine.segment) {
      const defaultSegment = await this.prisma.segment.findUnique({
        where: { name: 'Padrão' },
      });

      const isCurrentDefaultOrNull = currentLine.segment === null || currentLine.segment === defaultSegment?.id;

      if (!isCurrentDefaultOrNull) {
        // Linha já tem um segmento específico definido e não pode ser alterada nem voltar a ser padrão
        throw new BadRequestException(
          'Não é possível alterar o segmento de uma linha que já foi vinculada a um segmento específico. ' +
          'Uma vez que a linha é vinculada a um segmento, ela permanece travada a ele permanentemente.'
        );
      }

      // Se está tentando voltar para Padrão/Null vindo de um segmento específico, já cairia no IF acima.
      // Aqui tratamos o caso de tentar setar Null/Padrão explicitamente (embora já devesse estar em null/padrão)
      const isNewDefaultOrNull = updateLineDto.segment === null || updateLineDto.segment === defaultSegment?.id;

      // Se a linha já saiu do estado "Padrão/Null", ela nunca mais pode voltar para ele
      // (Isso é um reforço da lógica acima, garantindo que mesmo se currentLine.segment fosse algo estranho)
      if (!isCurrentDefaultOrNull && isNewDefaultOrNull) {
        throw new BadRequestException(
          'Não é possível retornar uma linha vinculada para o segmento Padrão ou deixá-la sem segmento.'
        );
      }
    }

    // Se receiveMedia foi alterado, reconfigurar webhook
    if (updateLineDto.receiveMedia !== undefined && updateLineDto.receiveMedia !== currentLine.receiveMedia) {
      await this.updateWebhookConfig(currentLine, updateLineDto.receiveMedia);
    }

    return this.prisma.linesStock.update({
      where: { id },
      data: updateLineDto,
    });
  }

  // Atualiza configuração do webhook na Evolution (base64 on/off)
  private async updateWebhookConfig(line: any, enableBase64: boolean) {
    const evolution = await this.prisma.evolution.findUnique({
      where: { evolutionName: line.evolutionName },
    });

    if (!evolution) {
      console.warn('⚠️ Evolution não encontrada para atualizar webhook');
      return;
    }

    try {
      const instanceName = `line_${line.phone.replace(/\D/g, '')}`;
      const webhookUrl = `${process.env.APP_URL || 'http://localhost:3000'}/webhooks/evolution`;

      const webhookData = {
        url: webhookUrl,
        enabled: true,
        webhook_by_events: true,
        webhook_base64: enableBase64,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
        ],
      };

      console.log(`🔄 Atualizando webhook base64=${enableBase64} para linha ${line.phone}`);

      await axios.post(
        `${evolution.evolutionUrl}/webhook/set/${instanceName}`,
        webhookData,
        {
          headers: {
            'apikey': evolution.evolutionKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      console.log(`✅ Webhook atualizado com sucesso para linha ${line.phone}`);
    } catch (error) {
      console.error('❌ Erro ao atualizar webhook:', error.response?.data || error.message);
    }
  }

  async remove(id: number) {
    const line = await this.findOne(id);

    // Deletar instância na Evolution
    const evolution = await this.prisma.evolution.findUnique({
      where: { evolutionName: line.evolutionName },
    });

    try {
      const instanceName = `line_${line.phone.replace(/\D/g, '')}`;
      await axios.delete(
        `${evolution.evolutionUrl}/instance/delete/${instanceName}`,
        {
          headers: {
            'apikey': evolution.evolutionKey,
          },
        }
      );
    } catch (error) {
      console.error('Erro ao deletar instância na Evolution:', error);
    }

    return this.prisma.linesStock.delete({
      where: { id },
    });
  }

  // Lógica automática de troca de linhas banidas
  async handleBannedLine(lineId: number) {
    const line = await this.findOne(lineId);

    // Buscar todos os operadores vinculados à linha (tabela LineOperator)
    const lineOperators = await this.prisma.lineOperator.findMany({
      where: { lineId },
      include: {
        user: true,
      },
    });

    const operatorIds = lineOperators.map(lo => lo.userId);

    // Marcar linha como banida
    await this.update(lineId, { lineStatus: 'ban' });

    // Registrar evento de linha banida
    await this.systemEventsService.logEvent(
      EventType.LINE_BANNED,
      EventModule.LINES,
      {
        lineId: line.id,
        linePhone: line.phone,
        operatorsCount: lineOperators.length,
      },
      null,
      EventSeverity.ERROR,
    );

    if (operatorIds.length > 0) {
      console.log(`🔄 [handleBannedLine] Desvinculando ${operatorIds.length} operador(es) da linha banida ${lineId}`);

      // Buscar conversas ativas (não tabuladas) da linha banida, agrupadas por operador
      const activeConversations = await this.prisma.conversation.findMany({
        where: {
          userLine: lineId,
          tabulation: null, // Apenas conversas ativas
          userId: { in: operatorIds }, // Apenas dos operadores desta linha
        },
        select: {
          contactPhone: true,
          contactName: true,
          userId: true,
        },
        distinct: ['contactPhone', 'userId'], // Evitar duplicatas
      });

      // Agrupar contatos por operador
      const contactsByOperator = new Map<number, Array<{ phone: string; name: string }>>();
      activeConversations.forEach(conv => {
        if (conv.userId) {
          if (!contactsByOperator.has(conv.userId)) {
            contactsByOperator.set(conv.userId, []);
          }
          contactsByOperator.get(conv.userId)!.push({
            phone: conv.contactPhone,
            name: conv.contactName,
          });
        }
      });

      // Desvincular todos os operadores da tabela LineOperator
      await this.prisma.lineOperator.deleteMany({
        where: { lineId },
      });

      // Atualizar campos legacy (line e linkedTo)
      for (const operatorId of operatorIds) {
        await this.prisma.user.update({
          where: { id: operatorId },
          data: { line: null },
        });
      }

      // Limpar linkedTo da linha banida
      await this.prisma.linesStock.update({
        where: { id: lineId },
        data: { linkedTo: null },
      });

      // Tentar atribuir novas linhas aos operadores desvinculados
      for (const operatorId of operatorIds) {
        const operator = await this.prisma.user.findUnique({
          where: { id: operatorId },
          include: { lineOperators: true },
        });

        if (!operator || operator.lineOperators.length > 0) {
          continue; // Operador já tem outra linha ou não existe
        }

        // 1. Primeiro, tentar buscar linha do mesmo segmento do operador
        let availableLines = await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
            segment: operator.segment || line.segment,
          },
          include: {
            operators: {
              include: {
                user: true,
              },
            },
          },
        });

        // Filtrar por evolutions ativas
        availableLines = await this.controlPanelService.filterLinesByActiveEvolutions(availableLines, operator.segment || undefined);

        // Aceitar linhas com menos de 2 operadores e que não tenham operadores de outro segmento
        let availableLine = availableLines.find(l => {
          if (l.operators.length >= 2) return false;

          // Verificar se todos os operadores são do mesmo segmento do operador atual
          if (l.operators.length > 0 && operator.segment) {
            const allSameSegment = l.operators.every(lo => lo.user.segment === operator.segment);
            if (!allSameSegment) return false;
          }

          return true;
        });

        // 2. Se não encontrou linha do segmento, buscar linha do segmento "Padrão"
        if (!availableLine) {
          // Buscar o segmento "Padrão" pelo nome (criado na seed)
          const defaultSegment = await this.prisma.segment.findUnique({
            where: { name: 'Padrão' },
          });

          if (defaultSegment) {
            const defaultLines = await this.prisma.linesStock.findMany({
              where: {
                lineStatus: 'active',
                segment: defaultSegment.id, // Segmento "Padrão" pelo ID
              },
              include: {
                operators: {
                  include: {
                    user: true,
                  },
                },
              },
            });

            // Filtrar por evolutions ativas
            const filteredDefaultLines = await this.controlPanelService.filterLinesByActiveEvolutions(defaultLines, operator.segment || undefined);

            // Linhas padrão podem aceitar qualquer operador se tiverem menos de 2
            availableLine = filteredDefaultLines.find(l => l.operators.length < 2);
          }
        }

        if (availableLine) {
          // Vincular nova linha ao operador usando a tabela LineOperator
          await this.assignOperatorToLine(availableLine.id, operatorId);
          console.log(`✅ [handleBannedLine] Linha ${availableLine.phone} atribuída ao operador ${operator.name} (ID: ${operatorId})`);

          // IMPORTANTE: Atualizar userLine das conversas ativas para a nova linha
          // Isso mantém as conversas vinculadas ao operador, mas usando a nova linha
          await this.prisma.conversation.updateMany({
            where: {
              userId: operatorId,
              userLine: lineId, // Linha banida
              tabulation: null, // Apenas conversas ativas
            },
            data: {
              userLine: availableLine.id, // Nova linha
            },
          });
          console.log(`🔄 [handleBannedLine] Conversas do operador ${operator.name} atualizadas para usar a nova linha ${availableLine.phone}`);

          // NÃO notificar o operador - ele não precisa saber que a linha foi banida
          // As conversas continuam aparecendo normalmente
        } else {
          console.warn(`⚠️ [handleBannedLine] Nenhuma linha disponível para substituir a linha banida para o operador ${operator?.name || operatorId}`);

          // Fechar conversas ativas do operador
          try {
            await this.prisma.conversation.updateMany({
              where: {
                userId: operatorId,
                userLine: lineId,
                tabulation: null, // Apenas conversas não tabuladas
              },
              data: {
                tabulation: -1, // Marcar como fechada (usar -1 como código especial)
              },
            });
            console.log(`🔄 [handleBannedLine] Conversas ativas do operador ${operator?.name || operatorId} foram fechadas`);
          } catch (error) {
            console.error(`❌ [handleBannedLine] Erro ao fechar conversas:`, error);
          }

          // Notificar operador via WebSocket
          try {
            const operatorSockets = Array.from(this.websocketGateway['connectedUsers']?.entries() || [])
              .filter(([_, socket]: [any, any]) => socket.data?.user?.id === operatorId)
              .map(([_, socket]: [any, any]) => socket);

            for (const socket of operatorSockets) {
              socket.emit('line-lost', {
                message: 'Sua linha foi removida e não há linha disponível no momento. Você será notificado quando uma nova linha for atribuída.',
              });
            }
          } catch (error) {
            console.error(`❌ [handleBannedLine] Erro ao notificar operador:`, error);
          }

          // Log apenas - fila de espera não implementada no schema ainda
          console.log(`📋 [handleBannedLine] Operador ${operator?.name || operatorId} precisa de nova linha, mas nenhuma disponível no momento`);
        }
      }
    } else if (line.linkedTo) {
      // Fallback: se não há operadores na tabela LineOperator mas há linkedTo (legacy)
      await this.prisma.user.update({
        where: { id: line.linkedTo },
        data: { line: null },
      });

      // Buscar uma nova linha ativa do mesmo segmento
      const availableLine = await this.prisma.linesStock.findFirst({
        where: {
          lineStatus: 'active',
          segment: line.segment,
          linkedTo: null,
        },
      });

      if (availableLine) {
        // Vincular nova linha ao operador
        await this.update(availableLine.id, { linkedTo: line.linkedTo });
        await this.prisma.user.update({
          where: { id: line.linkedTo },
          data: { line: availableLine.id },
        });

        console.log(`✅ [handleBannedLine] Linha ${availableLine.phone} atribuída ao operador ${line.linkedTo} (legacy)`);
      } else {
        console.warn(`⚠️ [handleBannedLine] Nenhuma linha disponível para substituir a linha banida`);
      }
    }

    console.log(`✅ [handleBannedLine] Linha ${lineId} marcada como banida e operadores desvinculados`);
  }

  // Lógica para linhas temporariamente desconectadas
  async handleDisconnectedLine(lineId: number) {
    const line = await this.findOne(lineId);

    // Buscar todos os operadores vinculados à linha (tabela LineOperator)
    const lineOperators = await this.prisma.lineOperator.findMany({
      where: { lineId },
      include: {
        user: true,
      },
    });

    const operatorIds = lineOperators.map(lo => lo.userId);

    // Marcar linha como desconectada
    await this.update(lineId, { lineStatus: 'disconnected' });

    // Registrar evento de linha desconectada
    await this.systemEventsService.logEvent(
      EventType.LINE_DISCONNECTED,
      EventModule.LINES,
      {
        lineId: line.id,
        linePhone: line.phone,
        operatorsCount: lineOperators.length,
      },
      null,
      EventSeverity.WARNING,
    );

    if (operatorIds.length > 0) {
      console.log(`🔄 [handleDisconnectedLine] Desvinculando ${operatorIds.length} operador(es) da linha desconectada ${lineId}`);

      // Buscar conversas ativas (não tabuladas) da linha desconectada, agrupadas por operador
      const activeConversations = await this.prisma.conversation.findMany({
        where: {
          userLine: lineId,
          tabulation: null, // Apenas conversas ativas
          userId: { in: operatorIds }, // Apenas dos operadores desta linha
        },
        select: {
          contactPhone: true,
          contactName: true,
          userId: true,
        },
        distinct: ['contactPhone', 'userId'], // Evitar duplicatas
      });

      // Agrupar contatos por operador
      const contactsByOperator = new Map<number, Array<{ phone: string; name: string }>>();
      activeConversations.forEach(conv => {
        if (conv.userId) {
          if (!contactsByOperator.has(conv.userId)) {
            contactsByOperator.set(conv.userId, []);
          }
          contactsByOperator.get(conv.userId)!.push({
            phone: conv.contactPhone,
            name: conv.contactName,
          });
        }
      });

      // Desvincular todos os operadores da tabela LineOperator
      await this.prisma.lineOperator.deleteMany({
        where: { lineId },
      });

      // Atualizar campos legacy (line e linkedTo)
      for (const operatorId of operatorIds) {
        await this.prisma.user.update({
          where: { id: operatorId },
          data: { line: null },
        });
      }

      // Limpar linkedTo da linha desconectada
      await this.prisma.linesStock.update({
        where: { id: lineId },
        data: { linkedTo: null },
      });

      // Tentar atribuir novas linhas aos operadores desvinculados
      for (const operatorId of operatorIds) {
        const operator = await this.prisma.user.findUnique({
          where: { id: operatorId },
          include: { lineOperators: true },
        });

        if (!operator || operator.lineOperators.length > 0) {
          continue; // Operador já tem outra linha ou não existe
        }

        // 1. Primeiro, tentar buscar linha do mesmo segmento do operador
        let availableLines = await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
            segment: operator.segment || line.segment,
          },
          include: {
            operators: {
              include: {
                user: true,
              },
            },
          },
        });

        // Filtrar linhas que ainda têm slots disponíveis (menos de 2 operadores)
        let availableLine = availableLines.find(l => l.operators.length < 2);

        // 2. Se não encontrar no segmento do operador, buscar no segmento "Padrão"
        if (!availableLine) {
          const defaultSegment = await this.prisma.segment.findUnique({
            where: { name: 'Padrão' },
          });

          if (defaultSegment) {
            const defaultLines = await this.prisma.linesStock.findMany({
              where: {
                lineStatus: 'active',
                segment: defaultSegment.id,
              },
              include: {
                operators: {
                  include: {
                    user: true,
                  },
                },
              },
            });

            availableLine = defaultLines.find(l => l.operators.length < 2);

            // Se encontrou linha padrão, atribuir ao segmento do operador
            if (availableLine && operator.segment) {
              await this.prisma.linesStock.update({
                where: { id: availableLine.id },
                data: { segment: operator.segment },
              });
              console.log(`🔄 [handleDisconnectedLine] Linha padrão ${availableLine.phone} atribuída ao segmento do operador (ID: ${operator.segment})`);
            }
          }
        }

        if (availableLine) {
          // Criar vínculo na tabela LineOperator
          await this.prisma.lineOperator.create({
            data: {
              lineId: availableLine.id,
              userId: operatorId,
            },
          });

          // Atualizar campo legacy line
          await this.prisma.user.update({
            where: { id: operatorId },
            data: { line: availableLine.id },
          });

          // Atualizar linkedTo (campo legacy)
          await this.prisma.linesStock.update({
            where: { id: availableLine.id },
            data: { linkedTo: operatorId },
          });

          console.log(`✅ [handleDisconnectedLine] Linha ${availableLine.phone} atribuída ao operador ${operator.name} (ID: ${operatorId})`);

          // Atualizar conversas ativas do operador para usar a nova linha
          const operatorContacts = contactsByOperator.get(operatorId) || [];
          for (const contact of operatorContacts) {
            await this.prisma.conversation.updateMany({
              where: {
                contactPhone: contact.phone,
                userId: operatorId,
                tabulation: null,
              },
              data: { userLine: availableLine.id },
            });
          }
          console.log(`🔄 [handleDisconnectedLine] Conversas do operador ${operator.name} atualizadas para usar a nova linha ${availableLine.phone}`);
        } else {
          // Não encontrou linha de substituição
          console.warn(`⚠️ [handleDisconnectedLine] Nenhuma linha disponível para substituir a linha desconectada para o operador ${operator?.name || operatorId}`);

          // Fechar conversas ativas do operador (deixar sem tabulação - serão reabertas quando receber nova linha)
          const operatorContacts = contactsByOperator.get(operatorId) || [];
          if (operatorContacts.length > 0) {
            console.log(`📋 [handleDisconnectedLine] Operador ${operator?.name || operatorId} tem ${operatorContacts.length} conversa(s) ativa(s) aguardando nova linha`);
          }

          // Notificar operador via WebSocket
          try {
            this.websocketGateway.emitToUser(operatorId, 'line_disconnected', {
              message: 'Sua linha foi desconectada. Aguarde uma nova linha ser atribuída ou contate um supervisor.',
              lineId: lineId,
            });
          } catch (error) {
            console.error(`❌ [handleDisconnectedLine] Erro ao notificar operador:`, error);
          }

          console.log(`📋 [handleDisconnectedLine] Operador ${operator?.name || operatorId} precisa de nova linha, mas nenhuma disponível no momento`);
        }
      }
    } else if (line.linkedTo) {
      // Verificar campo legacy linkedTo
      const operatorId = line.linkedTo;

      await this.prisma.user.update({
        where: { id: operatorId },
        data: { line: null },
      });

      await this.prisma.linesStock.update({
        where: { id: lineId },
        data: { linkedTo: null },
      });

      // Buscar e atribuir nova linha
      const availableLines = await this.prisma.linesStock.findMany({
        where: {
          lineStatus: 'active',
          segment: line.segment,
          linkedTo: null,
        },
      });

      const availableLine = availableLines[0];
      if (availableLine) {
        await this.prisma.user.update({
          where: { id: operatorId },
          data: { line: availableLine.id },
        });
        await this.prisma.linesStock.update({
          where: { id: availableLine.id },
          data: { linkedTo: operatorId },
        });
        console.log(`✅ [handleDisconnectedLine] Linha ${availableLine.phone} atribuída ao operador ${line.linkedTo} (legacy)`);
      } else {
        console.warn(`⚠️ [handleDisconnectedLine] Nenhuma linha disponível para substituir a linha desconectada`);
      }
    }

    console.log(`✅ [handleDisconnectedLine] Linha ${lineId} marcada como desconectada e operadores desvinculados`);
  }

  async getAvailableLines(segment: number) {
    return this.prisma.linesStock.findMany({
      where: {
        lineStatus: 'active',
        segment,
        linkedTo: null,
      },
    });
  }

  async getAvailableLinesForOperator(operatorId: number) {
    // Verificar se o modo compartilhado está ativo
    const controlPanel = await this.controlPanelService.findOne();
    const sharedLineMode = controlPanel?.sharedLineMode ?? false;

    // Buscar operador
    const operator = await this.prisma.user.findUnique({
      where: { id: operatorId },
      select: { segment: true },
    });

    if (!operator) {
      throw new NotFoundException('Operador não encontrado');
    }

    // Buscar linhas disponíveis do segmento do operador
    let availableLines = await this.prisma.linesStock.findMany({
      where: {
        lineStatus: 'active',
        segment: operator.segment,
      },
      include: {
        operators: true,
      },
    });

    // Buscar configuração do segmento do operador
    const operatorSegment = operator.segment ? await this.prisma.segment.findUnique({
      where: { id: operator.segment },
      select: { maxOperatorsPerLine: true },
    }) : null;
    const maxOperatorsPerLine = operatorSegment?.maxOperatorsPerLine ?? 2;

    // No modo compartilhado, não filtrar por quantidade de operadores
    if (!sharedLineMode) {
      // Filtrar linhas usando o limite do segmento
      availableLines = availableLines.filter(l => l.operators.length < maxOperatorsPerLine);
    }

    // Se não encontrou linhas do segmento, buscar linhas sem segmento (padrão)
    if (availableLines.length === 0) {
      const defaultLines = await this.prisma.linesStock.findMany({
        where: {
          lineStatus: 'active',
          segment: null,
        },
        include: {
          operators: true,
        },
      });

      // No modo compartilhado, não filtrar por quantidade de operadores
      if (!sharedLineMode) {
        availableLines = defaultLines.filter(l => l.operators.length < maxOperatorsPerLine);
      } else {
        availableLines = defaultLines;
      }
    }

    // Filtrar por evolutions ativas
    const filteredLines = await this.controlPanelService.filterLinesByActiveEvolutions(
      availableLines,
      operator.segment || undefined
    );

    // Buscar segmentos para mapear nomes
    const segments = await this.prisma.segment.findMany();
    const segmentMap = new Map(segments.map(s => [s.id, s]));

    return filteredLines.map(line => ({
      id: line.id,
      phone: line.phone,
      segment: line.segment,
      segmentName: line.segment ? segmentMap.get(line.segment)?.name : 'Sem segmento',
      operatorsCount: line.operators.length,
    }));
  }

  async getEvolutions() {
    return this.prisma.evolution.findMany({
      orderBy: {
        evolutionName: 'asc',
      },
    });
  }

  private async getAvailableEvolutionNames(): Promise<string> {
    const evolutions = await this.prisma.evolution.findMany({
      select: { evolutionName: true },
    });
    return evolutions.map(e => e.evolutionName).join(', ') || 'nenhuma';
  }

  async fetchInstancesFromEvolution(evolutionName: string) {
    const evolution = await this.prisma.evolution.findUnique({
      where: { evolutionName },
    });

    if (!evolution) {
      throw new NotFoundException('Evolution não encontrada');
    }

    try {
      const response = await axios.get(
        `${evolution.evolutionUrl}/instance/fetchInstances`,
        {
          headers: {
            'apikey': evolution.evolutionKey,
          },
          params: {
            instanceName: evolutionName,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Erro ao buscar instâncias:', error.response?.data || error.message);
      throw new BadRequestException('Erro ao buscar instâncias da Evolution API');
    }
  }

  // Distribuir mensagem inbound entre os operadores da linha (máximo 2)
  // Retorna o ID do operador que deve receber a mensagem
  async assignInboundMessageToOperator(lineId: number, contactPhone: string): Promise<number | null> {
    // Buscar operadores vinculados à linha
    const lineOperators = await this.prisma.lineOperator.findMany({
      where: { lineId },
      include: {
        user: true,
      },
    });

    console.log(`🔍 [LinesService] Buscando operadores para linha ${lineId}:`, {
      totalVinculados: lineOperators.length,
      operadores: lineOperators.map(lo => ({
        userId: lo.userId,
        userName: lo.user.name,
        status: lo.user.status,
        role: lo.user.role,
      })),
    });

    // Filtrar apenas usuários online (operadores, admins e supervisores)
    const onlineOperators = lineOperators
      .filter(lo => lo.user.status === 'Online' &&
        (lo.user.role === 'operator' || lo.user.role === 'admin' || lo.user.role === 'supervisor'))
      .map(lo => lo.user);

    console.log(`🔍 [LinesService] Usuários online na linha ${lineId}:`, {
      totalOnline: onlineOperators.length,
      usuarios: onlineOperators.map(op => ({
        id: op.id,
        name: op.name,
        status: op.status,
        role: op.role,
      })),
    });

    if (onlineOperators.length === 0) {
      console.log(`⚠️ [LinesService] Nenhum usuário online na linha ${lineId}`);

      // Verificar se há usuários vinculados mas offline
      const offlineOperators = lineOperators.filter(lo => lo.user.status !== 'Online');
      if (offlineOperators.length > 0) {
        console.log(`ℹ️ [LinesService] Há ${offlineOperators.length} usuário(s) vinculado(s) mas offline:`,
          offlineOperators.map(lo => `${lo.user.name} (${lo.user.status})`));
      }

      // FALLBACK: Se não encontrou na tabela LineOperator, verificar campo legacy (linkedTo)
      const line = await this.prisma.linesStock.findUnique({
        where: { id: lineId },
      });

      if (line && line.linkedTo) {
        const legacyOperator = await this.prisma.user.findUnique({
          where: { id: line.linkedTo },
        });

        if (legacyOperator && legacyOperator.status === 'Online' &&
          (legacyOperator.role === 'operator' || legacyOperator.role === 'admin' || legacyOperator.role === 'supervisor')) {
          console.log(`✅ [LinesService] Fallback: Encontrado usuário legacy online: ${legacyOperator.name} (ID: ${legacyOperator.id}, Role: ${legacyOperator.role})`);

          // Sincronizar: criar entrada na tabela LineOperator
          const existingLink = await this.prisma.lineOperator.findFirst({
            where: {
              lineId: lineId,
              userId: legacyOperator.id,
            },
          });

          if (!existingLink) {
            await this.prisma.lineOperator.create({
              data: {
                lineId: lineId,
                userId: legacyOperator.id,
              },
            });
            console.log(`✅ [LinesService] Operador legacy sincronizado na tabela LineOperator`);
          }

          return legacyOperator.id;
        }
      }

      return null;
    }

    // Usar transaction com lock para evitar race condition
    return await this.prisma.$transaction(async (tx) => {
      // PRIMEIRO: Verificar se existe vínculo ativo (não expirado) para contactPhone + lineId
      const now = new Date();
      const activeBinding = await (tx as any).conversationOperatorBinding.findFirst({
        where: {
          contactPhone,
          lineId,
          expiresAt: {
            gt: now, // Vínculo ainda não expirado
          },
        },
      });

      // Se existe vínculo ativo, verificar se o operador está online
      if (activeBinding) {
        const boundOperator = onlineOperators.find(op => op.id === activeBinding.userId);

        if (boundOperator) {
          console.log(`✅ [LinesService] Mensagem atribuída ao operador vinculado (vínculo ativo): ${activeBinding.userId}`);
          return activeBinding.userId;
        } else {
          // Vínculo existe mas operador está offline - remover vínculo expirado e continuar
          console.log(`⚠️ [LinesService] Vínculo ativo encontrado mas operador ${activeBinding.userId} está offline. Removendo vínculo.`);
          await (tx as any).conversationOperatorBinding.delete({
            where: { id: activeBinding.id },
          });
        }
      }

      // Verificar se já existe conversa ativa com algum operador específico (com lock)
      const existingConversation = await tx.conversation.findFirst({
        where: {
          contactPhone,
          userLine: lineId,
          tabulation: null, // Conversa não tabulada (ativa)
          userId: { in: onlineOperators.map(op => op.id) },
        },
        orderBy: {
          datetime: 'desc',
        },
      });

      // Se já existe conversa ativa, atribuir ao mesmo operador e criar/atualizar vínculo
      let selectedOperatorId: number | null = null;

      if (existingConversation && existingConversation.userId) {
        selectedOperatorId = existingConversation.userId;
        console.log(`✅ [LinesService] Mensagem atribuída ao operador existente: ${existingConversation.userId}`);
      } else {
        // Distribuir de forma round-robin: contar conversas ativas de cada operador (com lock)
        const operatorConversationCounts = await Promise.all(
          onlineOperators.map(async (operator) => {
            const count = await tx.conversation.count({
              where: {
                userLine: lineId,
                userId: operator.id,
                tabulation: null, // Apenas conversas ativas
              },
            });
            return { operatorId: operator.id, count };
          })
        );

        // Ordenar por menor número de conversas (balanceamento)
        operatorConversationCounts.sort((a, b) => a.count - b.count);

        // Retornar o operador com menos conversas
        selectedOperatorId = operatorConversationCounts[0]?.operatorId || onlineOperators[0]?.id || null;
        console.log(`✅ [LinesService] Mensagem atribuída ao operador ${selectedOperatorId} (${operatorConversationCounts[0]?.count || 0} conversas ativas)`);
      }

      // Criar ou atualizar vínculo de 24 horas
      if (selectedOperatorId) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // Expira em 24 horas

        await (tx as any).conversationOperatorBinding.upsert({
          where: {
            contactPhone_lineId: {
              contactPhone,
              lineId,
            },
          },
          update: {
            userId: selectedOperatorId,
            expiresAt,
            updatedAt: new Date(),
          },
          create: {
            contactPhone,
            lineId,
            userId: selectedOperatorId,
            expiresAt,
          },
        });

        console.log(`🔗 [LinesService] Vínculo criado/atualizado: contactPhone=${contactPhone}, lineId=${lineId}, userId=${selectedOperatorId}, expiresAt=${expiresAt.toISOString()}`);
      }

      return selectedOperatorId;
    }, { isolationLevel: 'Serializable' });
  }

  // Vincular operador à linha (máximo 2 operadores por linha)
  // Usa transação + lock para evitar race conditions
  async assignOperatorToLine(lineId: number, userId: number): Promise<void> {
    // Usar transação com lock para evitar race conditions
    await this.prisma.$transaction(async (tx) => {
      // Lock na linha para evitar atribuições simultâneas
      const line = await tx.linesStock.findUnique({
        where: { id: lineId },
      });

      if (!line) {
        throw new NotFoundException('Linha não encontrada');
      }

      if (line.lineStatus !== 'active') {
        throw new BadRequestException('Linha não está ativa');
      }

      // Verificar se a linha está em uma evolution ativa
      const activeEvolutions = await this.controlPanelService.getActiveEvolutions();
      if (activeEvolutions && activeEvolutions.length > 0 && !activeEvolutions.includes(line.evolutionName)) {
        throw new BadRequestException(`Linha da evolution '${line.evolutionName}' não está ativa para atribuição`);
      }

      // NOTA: Verificação de conexão na Evolution API foi removida para alocação mais rápida
      // O sistema agora confia apenas no lineStatus do banco de dados
      console.log(`✅ [assignOperatorToLine] Linha ${line.phone} validada (status banco: ${line.lineStatus})`);

      // Buscar informações do operador (usuário)
      const operator = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!operator) {
        throw new NotFoundException('Operador não encontrado');
      }

      // Verificar se o modo compartilhado está ativo
      const controlPanel = await this.controlPanelService.findOne();
      const sharedLineMode = controlPanel?.sharedLineMode ?? false;

      // Contar operadores atuais e buscar seus segmentos
      const existingOperators = await tx.lineOperator.findMany({
        where: { lineId },
        include: {
          user: {
            select: { segment: true, name: true },
          },
        },
      });

      const currentOperators = existingOperators.length;

      // VALIDAÇÃO CRÍTICA: NUNCA permitir que operadores de segmentos diferentes compartilhem a mesma linha
      // Buscar segmento "Padrão" para verificar
      const defaultSegment = await tx.segment.findUnique({
        where: { name: 'Padrão' },
      });

      if (existingOperators.length > 0) {
        // Se já tem operadores na linha, verificar segmentos
        for (const existingOp of existingOperators) {
          const existingSegment = existingOp.user.segment;
          const newSegment = operator.segment;

          // Se os segmentos são diferentes E nenhum deles é null, BLOQUEAR
          if (existingSegment !== null && newSegment !== null && existingSegment !== newSegment) {
            throw new BadRequestException(
              `SEGURANÇA: Não é possível vincular operador do segmento ${newSegment} a uma linha que já possui operador do segmento ${existingSegment}. Segmentos diferentes NÃO podem compartilhar a mesma linha.`
            );
          }

          // Se a linha tem segmento definido E não é "Padrão" E é diferente do operador, BLOQUEAR
          if (line.segment !== null &&
            (!defaultSegment || line.segment !== defaultSegment.id) &&
            line.segment !== newSegment) {
            throw new BadRequestException(
              `SEGURANÇA: Linha pertence ao segmento ${line.segment}, mas operador pertence ao segmento ${newSegment}. Não é possível vincular.`
            );
          }
        }
      }

      // Verificar se a linha já tem o máximo de operadores (com lock)
      // No modo compartilhado, não há limite de operadores
      if (!sharedLineMode) {
        // Linhas reserva aceitam apenas 1 operador, linhas normais aceitam 2
        const maxOperators = line.isReserve ? 1 : 2;

        if (currentOperators >= maxOperators) {
          throw new BadRequestException(
            line.isReserve
              ? 'Linha reserva já possui 1 operador vinculado (máximo permitido)'
              : 'Linha já possui o máximo de 2 operadores vinculados'
          );
        }
      }

      // Verificar se o operador já está vinculado a esta linha
      const existing = await tx.lineOperator.findUnique({
        where: {
          lineId_userId: {
            lineId,
            userId,
          },
        },
      });

      if (existing) {
        // Operador já está vinculado - não fazer nada (evita logs duplicados)
        console.log(`ℹ️ [assignOperatorToLine] Operador ${userId} já está vinculado à linha ${lineId}, pulando`);
        return;
      }

      // Verificar se operador já tem outra linha
      // No modo compartilhado, não desvincular da linha anterior (permite múltiplas linhas)
      if (!sharedLineMode) {
        const operatorCurrentLine = await tx.lineOperator.findFirst({
          where: { userId },
        });

        if (operatorCurrentLine && operatorCurrentLine.lineId !== lineId) {
          // Desvincular da linha anterior
          await tx.lineOperator.deleteMany({
            where: { userId, lineId: operatorCurrentLine.lineId },
          });
        }
      }

      // Criar vínculo
      await tx.lineOperator.create({
        data: {
          lineId,
          userId,
        },
      });

      // Atualizar campo legacy para compatibilidade
      await tx.user.update({
        where: { id: userId },
        data: { line: lineId },
      });

      // Atualizar linkedTo apenas se for o primeiro operador
      if (currentOperators === 0) {
        await tx.linesStock.update({
          where: { id: lineId },
          data: { linkedTo: userId },
        });
      }

      // REGRA DE OURO: Bloqueio Permanente de Segmento
      // Se a linha é "Padrão" (ou null), ela DEVE adotar o segmento do operador IMEDIATAMENTE.
      // Isso garante que a linha nunca mais saia desse segmento.

      if (operator.segment !== null) {
        const defaultSegment = await tx.segment.findUnique({ where: { name: 'Padrão' } });

        const isLineDefault = line.segment === null || (defaultSegment && line.segment === defaultSegment.id);

        if (isLineDefault) {
          // A linha era padrão/livre, agora pertence ao segmento do operador para sempre
          await tx.linesStock.update({
            where: { id: lineId },
            data: { segment: operator.segment },
          });
          console.log(`🔒 [assignOperatorToLine] Linha ${line.phone} TRAVADA no segmento ${operator.segment} (era ${line.segment})`);
        } else if (line.segment !== operator.segment) {
          // SEGURANÇA FINAL: Se por algum milagre o código passou até aqui com segmentos diferentes, aborta.
          throw new BadRequestException(
            `SEGURANÇA CRÍTICA: Tentativa de vincular linha do segmento ${line.segment} a operador do segmento ${operator.segment}.`
          );
        }
      }

      console.log(`🔄 [assignOperatorToLine] Linha ${line.segment} (segmento atualizado/verificado) agora compatível com operador ${operator.segment}`);
    }, {
      isolationLevel: 'Serializable', // Nível mais alto de isolamento para evitar race conditions
      timeout: 10000, // 10 segundos de timeout
    });

    // Registrar evento de sistema de alocação (após sucesso da transação)
    try {
      const line = await this.prisma.linesStock.findUnique({ where: { id: lineId } });
      const operator = await this.prisma.user.findUnique({ where: { id: userId } });

      if (line && operator) {
        let segmentName = 'Sem Segmento';
        if (operator.segment) {
          const seg = await this.prisma.segment.findUnique({ where: { id: operator.segment } });
          if (seg) segmentName = seg.name;
        }

        this.systemEventsService.logEvent(
          EventType.LINE_ASSIGNED,
          EventModule.LINES,
          {
            lineId: line.id,
            phone: line.phone,
            segmentName: segmentName,
            segmentId: operator.segment
          },
          userId,
          EventSeverity.SUCCESS
        );
      }
    } catch (logError) {
      console.error('Erro ao registrar evento de alocação:', logError);
    }
  }

  async getAllocationsLog(limit: number = 100) {
    const events = await this.systemEventsService.findEvents({
      type: EventType.LINE_ASSIGNED,
      limit,
    });

    return events.events.map(event => {
      const data = event.data || {};
      return {
        id: event.id,
        timestamp: event.createdAt,
        operatorName: event.user?.name || 'Desconhecido',
        segmentName: data.segmentName || 'N/A',
        linePhone: data.phone || 'N/A',
      };
    });
  }

  // Desvincular operador da linha
  async unassignOperatorFromLine(lineId: number, userId: number): Promise<void> {
    // Verificar se o modo compartilhado está ativo
    const controlPanel = await this.controlPanelService.findOne();
    const sharedLineMode = controlPanel?.sharedLineMode ?? false;

    // No modo compartilhado, não permitir desvinculação manual
    if (sharedLineMode) {
      throw new BadRequestException('Desvinculação não permitida no modo de linha compartilhada');
    }

    await this.prisma.lineOperator.deleteMany({
      where: {
        lineId,
        userId,
      },
    });

    // Atualizar campo legacy
    await this.prisma.user.update({
      where: { id: userId },
      data: { line: null },
    });

    // Se era o primeiro operador (linkedTo), atualizar para o próximo
    const line = await this.prisma.linesStock.findUnique({
      where: { id: lineId },
    });

    if (line && line.linkedTo === userId) {
      const remainingOperator = await this.prisma.lineOperator.findFirst({
        where: { lineId },
      });

      await this.prisma.linesStock.update({
        where: { id: lineId },
        data: { linkedTo: remainingOperator?.userId || null },
      });
    }

    console.log(`✅ Operador ${userId} desvinculado da linha ${lineId}`);
  }

  // Relatório de produtividade dos ativadores com filtro de data e análise de picos
  async getActivatorsProductivity(startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    // Se fornecido final do dia, ajustar para 23:59:59
    if (end) {
      end.setHours(23, 59, 59, 999);
    }

    // Buscar ativadores
    const activators = await this.prisma.user.findMany({
      where: {
        role: 'ativador',
      },
    });

    const report = await Promise.all(activators.map(async (activator) => {
      // Filtro base para linhas criadas dentro do período (se houver)
      const lineWhere: any = { createdBy: activator.id };

      if (start || end) {
        lineWhere.createdAt = {};
        if (start) lineWhere.createdAt.gte = start;
        if (end) lineWhere.createdAt.lte = end;
      }

      console.log(`📊 [Productivity] Buscando linhas para ativador ${activator.name} (${activator.id})`, {
        start: start?.toISOString(),
        end: end?.toISOString(),
        where: JSON.stringify(lineWhere)
      });

      // Buscar todas as linhas criadas pelo ativador no período
      const createdLines = await this.prisma.linesStock.findMany({
        where: lineWhere,
        select: {
          id: true,
          phone: true,
          lineStatus: true,
          createdAt: true,
        },
      });

      console.log(`📊 [Productivity] Encontradas ${createdLines.length} linhas para ${activator.name}`);

      // Buscar eventos de banimento no sistema para ESSE ativador (ou relacionados a suas linhas) no período
      // Usamos a tabela systemEvent para saber QUANDO a linha caiu, independente de quando foi criada
      const eventWhere: any = {
        type: 'line_banned',
        module: 'lines',
      };

      if (start || end) {
        eventWhere.createdAt = {};
        if (start) eventWhere.createdAt.gte = start;
        if (end) eventWhere.createdAt.lte = end;
      }

      // Buscar eventos de banimento
      const banEvents = await (this.prisma as any).systemEvent.findMany({
        where: eventWhere,
      });

      // Filtrar eventos que pertencem às linhas deste ativador
      // (O dado da linha geralmente está no campo 'data' do evento como JSON)
      const activatorBanEvents = banEvents.filter(event => {
        try {
          const eventData = JSON.parse(event.data || '{}');
          return createdLines.some(line => line.id === eventData.lineId);
        } catch (e) {
          return false;
        }
      });

      // Estatísticas diárias
      const dailyStats: Record<string, { created: number; banned: number }> = {};

      // Processar criações
      createdLines.forEach(line => {
        const day = line.createdAt.toISOString().split('T')[0];
        if (!dailyStats[day]) dailyStats[day] = { created: 0, banned: 0 };
        dailyStats[day].created++;
      });

      // Processar banimentos pelo timestamp do EVENTO (quando ocorreu o ban)
      activatorBanEvents.forEach(event => {
        const day = event.createdAt.toISOString().split('T')[0];
        if (!dailyStats[day]) dailyStats[day] = { created: 0, banned: 0 };
        dailyStats[day].banned++;
      });

      // Transformar dailyStats em array ordenado
      const dailyHistory = Object.entries(dailyStats)
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => b.date.localeCompare(a.date));

      // Encontrar pico de banimento
      const peakBanDay = dailyHistory.length > 0
        ? [...dailyHistory].sort((a, b) => b.banned - a.banned)[0]
        : null;

      // Calcular total de linhas únicas (pelo telefone)
      const uniquePhones = new Set(createdLines.map(l => l.phone));
      const totalCreatedDistinct = uniquePhones.size;

      console.log(`📊 [Productivity] Encontradas ${createdLines.length} linhas (total) e ${totalCreatedDistinct} linhas únicas (telefone) para ${activator.name}`);

      return {
        id: activator.id,
        name: activator.name,
        email: activator.email,
        totalCreated: totalCreatedDistinct, // Usar contagem distinta
        totalBannedInRange: activatorBanEvents.length,
        currentlyActive: createdLines.filter(l => l.lineStatus === 'active').length,
        peakBanDay,
        dailyHistory,
        lastActivity: activator.updatedAt,
      };
    }));

    return report.sort((a, b) => b.totalCreated - a.totalCreated);
  }

  async getLineLifespan() {
    // Query SQL Raw para performance e formatação específica do banco
    return this.prisma.$queryRaw`
      SELECT 
          ls."phone" AS "Telefone",
          ls."lineStatus" AS "Status",
          COALESCE(s."name", 'Sem Segmento') AS "Segmento",
          ls."createdAt" AS "Data Criação",
          TO_CHAR(NOW() - ls."createdAt", 'DD "dias" HH24"h" MI"m"') AS "Tempo de Vida"
      FROM "LinesStock" ls
      LEFT JOIN "Segment" s ON ls."segment" = s."id"
      WHERE ls."lineStatus" = 'active'
      ORDER BY ls."createdAt" ASC;
    `;
  }

  /**
   * Busca estatísticas de alocação de linhas com operadores
   */
  async getLinesAllocationStats() {
    // Total de linhas ativas
    const totalActiveLines = await this.prisma.linesStock.count({
      where: { lineStatus: 'active' },
    });

    // Buscar todas as linhas ativas com seus operadores
    const activeLines = await this.prisma.linesStock.findMany({
      where: { lineStatus: 'active' },
      include: {
        operators: true,
      },
    });

    // Contar linhas com vínculo (pelo menos 1 operador)
    const linesWithOperatorsCount = activeLines.filter(line => line.operators.length > 0).length;

    // Linhas sem vínculo
    const linesWithoutOperatorsCount = totalActiveLines - linesWithOperatorsCount;

    // Linhas com 1 operador
    const linesWithOneOperatorCount = activeLines.filter(line => line.operators.length === 1).length;

    // Linhas com 2 operadores
    const linesWithTwoOperatorsCount = activeLines.filter(line => line.operators.length === 2).length;

    return {
      totalActiveLines,
      linesWithOperators: linesWithOperatorsCount,
      linesWithoutOperators: linesWithoutOperatorsCount,
      linesWithOneOperator: linesWithOneOperatorCount,
      linesWithTwoOperators: linesWithTwoOperatorsCount,
    };
  }

  // Tentar vincular linha automaticamente a operadores online sem linha do mesmo segmento (máximo 2)
  private async tryAssignLineToOperator(lineId: number, segment: number) {
    try {
      // Buscar operador online sem linha do mesmo segmento
      // Verificar quantos operadores já estão vinculados
      const currentOperatorsCount = await this.prisma.lineOperator.count({
        where: { lineId },
      });

      if (currentOperatorsCount >= 2) {
        console.log(`ℹ️ [LinesService] Linha ${lineId} já possui 2 operadores vinculados`);
        return;
      }

      // Buscar operadores online sem linha do mesmo segmento
      // Primeiro, buscar todos os operadores online do segmento
      const allOnlineOperators = await this.prisma.user.findMany({
        where: {
          role: 'operator',
          status: 'Online',
          segment: segment,
        },
      });

      // Filtrar apenas os que não têm vínculo com nenhuma linha
      const operatorsWithoutLine = [];
      for (const operator of allOnlineOperators) {
        const hasLine = await this.prisma.lineOperator.findFirst({
          where: { userId: operator.id },
        });
        if (!hasLine && operatorsWithoutLine.length < (2 - currentOperatorsCount)) {
          operatorsWithoutLine.push(operator);
        }
      }

      for (const operator of operatorsWithoutLine) {
        try {
          await this.assignOperatorToLine(lineId, operator.id);

          // Notificar operador via WebSocket
          if (this.websocketGateway) {
            const line = await this.findOne(lineId);
            this.websocketGateway.emitToUser(operator.id, 'line-assigned', {
              lineId: lineId,
              linePhone: line.phone,
              message: `Você foi vinculado à linha ${line.phone} automaticamente.`,
            });
          }

          console.log(`✅ [LinesService] Linha ${lineId} vinculada automaticamente ao operador ${operator.name} (segmento ${segment})`);
        } catch (error) {
          console.error(`❌ [LinesService] Erro ao vincular operador ${operator.id} à linha ${lineId}:`, error.message);
        }
      }

      if (operatorsWithoutLine.length === 0) {
        console.log(`ℹ️ [LinesService] Nenhum operador online sem linha encontrado no segmento ${segment} para vincular a linha ${lineId}`);
      }
    } catch (error) {
      console.error('❌ [LinesService] Erro ao tentar vincular linha automaticamente:', error);
      // Não lançar erro, apenas logar - a linha foi criada com sucesso
    }
  }
}
