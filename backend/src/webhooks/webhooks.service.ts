import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import axios from 'axios';
import { LinesService } from '../lines/lines.service';
import { MediaService } from '../media/media.service';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { BlocklistService } from '../blocklist/blocklist.service';
import { SystemEventsService, EventType, EventModule, EventSeverity } from '../system-events/system-events.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class WebhooksService {
  private readonly uploadsDir = './uploads';

  constructor(
    private prisma: PrismaService,
    private conversationsService: ConversationsService,
    private websocketGateway: WebsocketGateway,
    private linesService: LinesService,
    private mediaService: MediaService,
    private controlPanelService: ControlPanelService,
    private blocklistService: BlocklistService,
    private systemEventsService: SystemEventsService,
  ) {}

  async handleEvolutionMessage(data: any) {
    try {
      console.log('📩 Webhook recebido:', JSON.stringify(data, null, 2));

      // Verificar se é uma mensagem recebida
      if (data.event === 'messages.upsert' || data.event === 'MESSAGES_UPSERT') {
        // Extrair o objeto completo da mensagem (com key, message, pushName, etc)
        const message = data.data || data.message;

        if (!message || !message.key) {
          return { status: 'ignored', reason: 'No message data or key' };
        }

        // Ignorar mensagens enviadas pelo próprio bot
        if (message.key.fromMe) {
          return { status: 'ignored', reason: 'Message from self' };
        }

        // Verificar se é mensagem de grupo
        const isGroup = message.key.remoteJid?.includes('@g.us') || false;
        const groupId = isGroup ? message.key.remoteJid : null;
        
        // Para grupos, extrair informações do grupo e do participante
        let from: string;
        let groupName: string | null = null;
        let participantName: string | null = null;
        
        if (isGroup) {
          // Em grupos, o remoteJid é o ID do grupo
          from = groupId || '';

          // Para grupos, iniciar com nome padrão e buscar o nome real via Evolution API
          groupName = 'Grupo sem nome';

          // O participante que enviou está em message.participant ou message.key.participant
          const participant = message.participant || message.key.participant;
          if (participant) {
            participantName = message.pushName || participant.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
          }
          console.log(`👥 Mensagem de grupo detectada: ${groupName} (${groupId}), participante: ${participantName}`);
        } else {
          // Extrair número do remetente (remoteJid quando fromMe=false é o remetente)
          from = message.key.remoteJid
            ?.replace('@s.whatsapp.net', '')
            ?.replace('@lid', '')
            ?.replace('@c.us', '') || '';
        }

        if (!from) {
          console.warn('⚠️ Webhook sem remoteJid; ignorando.', { key: message.key });
          return { status: 'ignored', reason: 'Missing remoteJid' };
        }

        console.log('📱 Mensagem de:', from, '| fromMe:', message.key.fromMe);

        // Extrair texto da mensagem
        const messageText = message.message?.conversation
          || message.message?.extendedTextMessage?.text
          || message.message?.imageMessage?.caption
          || message.message?.videoMessage?.caption
          || message.message?.documentMessage?.caption
          || (message.message?.imageMessage ? 'Imagem recebida' : undefined)
          || (message.message?.videoMessage ? 'Vídeo recebido' : undefined)
          || (message.message?.audioMessage ? 'Áudio recebido' : undefined)
          || (message.message?.documentMessage ? 'Documento recebido' : undefined)
          || 'Mensagem recebida';

        console.log('💬 Texto:', messageText);

        const messageType = this.getMessageType(message.message);
        let mediaUrl = this.getMediaUrl(message.message);

        // Buscar a linha que recebeu a mensagem
        const instanceName = data.instance || data.instanceName;
        const phoneNumber = instanceName?.replace('line_', '');

        const line = await this.prisma.linesStock.findFirst({
          where: {
            phone: {
              contains: phoneNumber,
            },
          },
          include: {
            operators: {
              include: {
                user: true,
              },
            },
          },
        });

        if (!line) {
          console.warn('⚠️ [Webhook] Linha não encontrada para o número:', phoneNumber);
          return { status: 'ignored', reason: 'Line not found' };
        }

        console.log(`🔍 [Webhook] Linha encontrada: ID ${line.id}, Phone: ${line.phone}`, {
          operadoresVinculados: line.operators.length,
          operadores: line.operators.map(lo => ({
            userId: lo.userId,
            userName: lo.user.name,
            status: lo.user.status,
            role: lo.user.role,
          })),
        });

        // Processar mídia base64 se a linha tiver receiveMedia ativado
        if (line.receiveMedia && messageType !== 'text') {
          console.log('🔍 [Webhook] Tentando extrair mídia Base64...');
          const base64Media = this.extractBase64Media(message.message);
          
          if (base64Media) {
            console.log('✅ [Webhook] Base64 encontrado, mimetype:', base64Media.mimetype);
            try {
              const fileName = `${Date.now()}-${from}-${messageType}.${this.getExtension(messageType, base64Media.mimetype)}`;
              const localFileName = await this.saveBase64Media(base64Media.data, fileName, base64Media.mimetype);
              
              if (localFileName) {
                mediaUrl = `/media/${localFileName}`;
                console.log('📥 Mídia Base64 salva localmente:', mediaUrl);
              }
            } catch (error) {
              console.error('❌ Erro ao salvar mídia Base64:', error.message);
            }
          } else {
            console.log('⚠️ [Webhook] Base64 não encontrado, tentando baixar da URL...');
            if (mediaUrl) {
              // Fallback: baixar da URL se não tiver base64
              try {
                const fileName = `${Date.now()}-${from}-${messageType}.${this.getExtension(messageType)}`;
                const localFileName = await this.mediaService.downloadMediaFromEvolution(mediaUrl, fileName);
                
                if (localFileName) {
                  mediaUrl = `/media/${localFileName}`;
                  console.log('📥 Mídia URL salva localmente:', mediaUrl);
                }
              } catch (error) {
                console.error('❌ Erro ao baixar mídia:', error.message);
              }
            } else {
              console.warn('⚠️ [Webhook] Nenhuma URL de mídia encontrada');
            }
          }
        } else if (mediaUrl && messageType !== 'text') {
          // Se não tem receiveMedia mas tem mídia por URL, tentar baixar
          console.log('📥 [Webhook] Baixando mídia da URL (receiveMedia desativado):', mediaUrl);
          try {
            const fileName = `${Date.now()}-${from}-${messageType}.${this.getExtension(messageType)}`;
            const localFileName = await this.mediaService.downloadMediaFromEvolution(mediaUrl, fileName);
            
            if (localFileName) {
              mediaUrl = `/media/${localFileName}`;
              console.log('📥 Mídia salva localmente:', mediaUrl);
            }
          } catch (error) {
            console.error('❌ Erro ao baixar mídia:', error.message);
          }
        }

        // Para grupos, usar groupId como identificador; para contatos individuais, usar o número
        const contactIdentifier = isGroup ? (groupId || from) : from;

        // Para grupos, SEMPRE buscar o nome real via Evolution API
        if (isGroup && groupId) {
          const evolution = await this.prisma.evolution.findUnique({
            where: { evolutionName: line.evolutionName },
          });

          if (evolution) {
            const realGroupName = await this.fetchGroupName(
              groupId,
              evolution.evolutionUrl,
              evolution.evolutionKey,
              instanceName
            );

            if (realGroupName) {
              groupName = realGroupName;
              console.log(`✅ [Webhook] Nome do grupo obtido via Evolution API: ${groupName}`);
            } else {
              console.warn(`⚠️ [Webhook] Não foi possível obter o nome do grupo via Evolution API, mantendo: ${groupName}`);
            }
          }
        }

        // Buscar contato (para grupos, criar/atualizar com groupId)
        let contact = await this.prisma.contact.findFirst({
          where: { phone: contactIdentifier },
        });

        if (!contact) {
          // Para grupos, só criar se conseguiu buscar o nome real
          if (isGroup && (!groupName || groupName === 'Grupo sem nome')) {
            console.warn(`⚠️ [Webhook] Não foi possível obter nome do grupo, ignorando criação do contato por enquanto...`);
            return { status: 'ignored', reason: 'Could not fetch group name' };
          }

          // Criar contato se não existir
          contact = await this.prisma.contact.create({
            data: {
              name: isGroup ? groupName : (message.pushName || from), // Para grupos, usar groupName (agora é o nome real da Evolution API)
              phone: contactIdentifier,
              segment: line.segment,
              isNameManual: false, // Nome vindo do webhook, não é manual
            },
          });
          console.log(`✅ [Webhook] Contato criado: ${contact.name} (${contactIdentifier}), IsGroup: ${isGroup}`);
        } else if (isGroup && !contact.isNameManual && groupName && groupName !== 'Grupo sem nome') {
          // Se o contato existe, é grupo, NÃO tem nome manual e temos o nome real, atualizar
          // Só atualiza se o nome for diferente do atual para evitar updates desnecessários
          if (contact.name !== groupName) {
            contact = await this.prisma.contact.update({
              where: { id: contact.id },
              data: { name: groupName },
            });
            console.log(`✅ [Webhook] Nome do grupo atualizado automaticamente: ${contact.name} -> ${groupName} (${contactIdentifier})`);
          }
        } else if (isGroup && contact.isNameManual) {
          console.log(`ℹ️ [Webhook] Grupo ${contactIdentifier} tem nome manual (${contact.name}), não atualizando automaticamente`);
        }

        // Registrar resposta do cliente (reseta repescagem) - apenas para contatos individuais
        if (!isGroup) {
          await this.controlPanelService.registerClientResponse(from);
        }

        // Verificar frases de bloqueio automático - apenas para contatos individuais
        let blockedByPhrase = false;
        if (!isGroup) {
          const isBlockPhrase = await this.controlPanelService.checkBlockPhrases(messageText, line.segment);
          
          if (isBlockPhrase) {
            console.log('🚫 Frase de bloqueio detectada:', messageText);
            blockedByPhrase = true;
            
            // Adicionar à blocklist
            await this.blocklistService.create({
              name: contact.name,
              phone: from,
              cpf: contact.cpf,
            });

            console.log('✅ Contato adicionado à blocklist:', from);
          }
        }

        // Verificar modo compartilhado
        const controlPanel = await this.controlPanelService.findOne();
        const sharedLineMode = controlPanel?.sharedLineMode ?? false;

        // Distribuir mensagem entre os operadores da linha
        // No modo compartilhado, atribuir para todos os usuários da linha
        let finalOperatorId: number | null = null;
        
        if (sharedLineMode && isGroup) {
          // No modo compartilhado com grupos, atribuir para o primeiro operador/admin online da linha
          // Mas a mensagem será enviada para todos via WebSocket
          const anyOnlineUser = line.operators.find(lo => 
            lo.user.status === 'Online' && 
            (lo.user.role === 'operator' || lo.user.role === 'admin' || lo.user.role === 'supervisor')
          );
          
          if (anyOnlineUser) {
            finalOperatorId = anyOnlineUser.userId;
            console.log(`✅ [Webhook] Modo compartilhado: atribuindo grupo para ${anyOnlineUser.user.name} (ID: ${finalOperatorId})`);
          }
        } else if (!isGroup) {
          // Para contatos individuais, usar a lógica normal
          const assignedOperatorId = await this.linesService.assignInboundMessageToOperator(line.id, from);
          console.log(`📋 [Webhook] Mensagem de ${from} atribuída ao operador ${assignedOperatorId || 'nenhum (sem operadores online)'}`);
          finalOperatorId = assignedOperatorId;
        }

        // Se não encontrou operador, tentar encontrar qualquer operador/admin online da linha
        if (!finalOperatorId && line.operators && line.operators.length > 0) {
          // Buscar qualquer usuário online da linha (operador, admin ou supervisor)
          const anyOnlineUser = line.operators.find(lo => 
            lo.user.status === 'Online' && 
            (lo.user.role === 'operator' || lo.user.role === 'admin' || lo.user.role === 'supervisor')
          );
          
          if (anyOnlineUser) {
            finalOperatorId = anyOnlineUser.userId;
            console.log(`✅ [Webhook] Atribuindo mensagem a usuário online disponível: ${anyOnlineUser.user.name} (ID: ${finalOperatorId})`);
          } else {
            console.warn(`⚠️ [Webhook] Nenhum usuário online encontrado na linha ${line.id} mesmo após verificação de fallback`);
          }
        }

        // Se ainda não encontrou operador online, adicionar à fila de mensagens
        if (!finalOperatorId) {
          console.log(`📥 [Webhook] Nenhum operador online, adicionando mensagem à fila...`);
          
          // Adicionar à fila de mensagens
          await (this.prisma as any).messageQueue.create({
            data: {
              contactPhone: from,
              contactName: contact.name,
              message: messageText,
              messageType,
              mediaUrl,
              segment: line.segment || undefined,
              status: 'pending',
            },
          });

          // Registrar evento de mensagem na fila
          await this.systemEventsService.logEvent(
            EventType.MESSAGE_QUEUED,
            EventModule.WEBHOOKS,
            {
              contactPhone: from,
              contactName: contact.name,
              messageType,
              lineId: line.id,
              linePhone: line.phone,
            },
            null,
            EventSeverity.WARNING,
          );
          
          return { status: 'queued', message: 'Mensagem adicionada à fila (nenhum operador online)' };
        }

        // Criar conversa
        const conversation = await this.conversationsService.create({
          contactName: isGroup ? (groupName || contact.name) : contact.name, // Para grupos, usar nome do grupo
          contactPhone: from,
          segment: line.segment,
          userName: finalOperatorId ? line.operators.find(lo => lo.userId === finalOperatorId)?.user.name || null : null,
          userLine: line.id,
          userId: finalOperatorId, // Operador específico que vai atender (ou null se não houver)
          message: messageText,
          sender: 'contact',
          messageType,
          mediaUrl,
          isGroup,
          groupId: groupId || undefined,
          groupName: isGroup ? groupName : undefined,
          participantName: isGroup ? participantName : undefined, // Nome de quem enviou no grupo
        });

        // Criar/atualizar vínculo de 24 horas entre conversa e operador (garantia adicional)
        // O vínculo já é criado no assignInboundMessageToOperator, mas garantimos aqui também
        if (finalOperatorId) {
          try {
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24); // Expira em 24 horas

            await (this.prisma as any).conversationOperatorBinding.upsert({
              where: {
                contactPhone_lineId: {
                  contactPhone: from,
                  lineId: line.id,
                },
              },
              update: {
                userId: finalOperatorId,
                expiresAt,
                updatedAt: new Date(),
              },
              create: {
                contactPhone: from,
                lineId: line.id,
                userId: finalOperatorId,
                expiresAt,
              },
            });

            console.log(`🔗 [Webhook] Vínculo criado/atualizado: contactPhone=${from}, lineId=${line.id}, userId=${finalOperatorId}, expiresAt=${expiresAt.toISOString()}`);
          } catch (error: any) {
            console.error(`❌ [Webhook] Erro ao criar/atualizar vínculo:`, error.message);
            // Não lançar erro - vínculo é importante mas não deve quebrar o fluxo
          }
        }

        // Registrar evento de mensagem recebida
        await this.systemEventsService.logEvent(
          EventType.MESSAGE_RECEIVED,
          EventModule.WEBHOOKS,
          {
            contactPhone: from,
            contactName: contact.name,
            messageType,
            userId: finalOperatorId,
            lineId: line.id,
            linePhone: line.phone,
            blockedByPhrase,
          },
          finalOperatorId || undefined,
          blockedByPhrase ? EventSeverity.WARNING : EventSeverity.INFO,
        );

        // Emitir via WebSocket (incluir flag de bloqueio se aplicável)
        const messagePayload = {
          ...conversation,
          blockedByPhrase,
        };
        
        await this.websocketGateway.emitNewMessage(messagePayload);

        return { status: 'success', conversation, blockedByPhrase };
      }

      // Verificar status de conexão
      if (data.event === 'connection.update' || data.event === 'CONNECTION_UPDATE') {
        const state = data.data?.state || data.state;

        if (state === 'close' || state === 'DISCONNECTED') {
          // Linha foi desconectada/banida
          const instanceName = data.instance || data.instanceName;
          const phoneNumber = instanceName?.replace('line_', '');

          const line = await this.prisma.linesStock.findFirst({
            where: {
              phone: {
                contains: phoneNumber,
              },
            },
          });

          if (line) {
            // Marcar como banida e trocar automaticamente
            await this.linesService.handleBannedLine(line.id);
          }

          return { status: 'line_disconnected', lineId: line?.id };
        }

        // Linha conectada (QRCODE escaneado)
        if (state === 'open' || state === 'OPEN' || state === 'connected' || state === 'CONNECTED') {
          const instanceName = data.instance || data.instanceName;
          const phoneNumber = instanceName?.replace('line_', '');

          const line = await this.prisma.linesStock.findFirst({
            where: {
              phone: {
                contains: phoneNumber,
              },
            },
          });

          if (line) {
            // Buscar configuração da Evolution API para importar histórico
            const evolution = await this.prisma.evolution.findUnique({
              where: { evolutionName: line.evolutionName },
            });

            if (evolution) {
              // Importar histórico de conversas em background (não esperar)
              this.importRecentHistory(
                line.id,
                evolution.evolutionUrl,
                evolution.evolutionKey,
                instanceName
              ).catch((error) => {
                console.error(`❌ [Webhook] Erro ao importar histórico em background:`, error.message);
              });

              console.log(`📚 [Webhook] Importação de histórico iniciada em background para linha ${line.phone}`);
            }
            // Verificar quantos operadores já estão vinculados à linha
            const currentOperatorsCount = await this.prisma.lineOperator.count({
              where: { lineId: line.id },
            });

            if (currentOperatorsCount < 2) {
              // Verificar se a linha é padrão (segmento "Padrão")
              const defaultSegment = await this.prisma.segment.findUnique({
                where: { name: 'Padrão' },
              });

              const isDefaultLine = defaultSegment && line.segment === defaultSegment.id;

              let operatorWithoutLine = null;

              if (isDefaultLine) {
                // Linha padrão: buscar qualquer operador online sem linha
                const allOnlineOperators = await this.prisma.user.findMany({
                  where: {
                    role: 'operator',
                    status: 'Online',
                  },
                });

                // Filtrar apenas os que não têm vínculo com nenhuma linha
                for (const operator of allOnlineOperators) {
                  const hasLine = await this.prisma.lineOperator.findFirst({
                    where: { userId: operator.id },
                  });
                  if (!hasLine && operator.segment) {
                    operatorWithoutLine = operator;
                    break; // Pegar o primeiro disponível com segmento
                  }
                }

                // Se encontrou operador, atualizar segmento da linha para o do operador
                if (operatorWithoutLine && operatorWithoutLine.segment) {
                  await this.prisma.linesStock.update({
                    where: { id: line.id },
                    data: { segment: operatorWithoutLine.segment },
                  });
                  console.log(`🔄 [Webhook] Linha padrão ${line.phone} atualizada para o segmento ${operatorWithoutLine.segment} do operador ${operatorWithoutLine.name}`);
                }
              } else {
                // Linha normal: buscar operador do mesmo segmento
                const allOnlineOperators = await this.prisma.user.findMany({
                  where: {
                    role: 'operator',
                    status: 'Online',
                    segment: line.segment,
                  },
                });

                // Filtrar apenas os que não têm vínculo com nenhuma linha
                for (const operator of allOnlineOperators) {
                  const hasLine = await this.prisma.lineOperator.findFirst({
                    where: { userId: operator.id },
                  });
                  if (!hasLine) {
                    operatorWithoutLine = operator;
                    break; // Pegar o primeiro disponível
                  }
                }
              }

              if (operatorWithoutLine) {
                // Vincular operador à linha usando método com transaction + lock
                try {
                  await this.linesService.assignOperatorToLine(line.id, operatorWithoutLine.id);

                  console.log(`✅ [Webhook] Linha ${line.phone} vinculada automaticamente ao operador ${operatorWithoutLine.name} (segmento ${line.segment || 'sem segmento'})`);
                  
                  // Notificar via WebSocket
                  this.websocketGateway.emitToUser(operatorWithoutLine.id, 'line-assigned', {
                    lineId: line.id,
                    linePhone: line.phone,
                    message: `Você foi vinculado à linha ${line.phone} automaticamente.`,
                  });
                } catch (error) {
                  console.error(`❌ [Webhook] Erro ao vincular linha ${line.id} ao operador ${operatorWithoutLine.id}:`, error.message);
                }
              } else {
                console.log(`ℹ️ [Webhook] Linha ${line.phone} conectada, mas nenhum operador online sem linha encontrado${isDefaultLine ? '' : ` no segmento ${line.segment || 'sem segmento'}`}`);
              }
            } else {
              console.log(`ℹ️ [Webhook] Linha ${line.phone} já possui 2 operadores vinculados`);
            }
          }

          return { status: 'line_connected', lineId: line?.id };
        }
      }

      return { status: 'processed' };
    } catch (error) {
      console.error('Erro ao processar webhook:', error);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Busca o nome real do grupo via Evolution API
   * @param groupId - ID do grupo (ex: 120363027798409612@g.us)
   * @param evolutionUrl - URL da Evolution API
   * @param evolutionKey - Chave de autenticação
   * @param instanceName - Nome da instância
   * @returns Nome do grupo ou null se não encontrar
   */
  private async fetchGroupName(
    groupId: string,
    evolutionUrl: string,
    evolutionKey: string,
    instanceName: string
  ): Promise<string | null> {
    // Tentar 2 vezes antes de desistir
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`🔍 [Webhook] Buscando nome do grupo ${groupId} via Evolution API (tentativa ${attempt}/2)...`);

        const response = await axios.get(
          `${evolutionUrl}/group/fetchAllGroups/${instanceName}`,
          {
            headers: { apikey: evolutionKey },
            timeout: 10000, // 10 segundos de timeout
          }
        );

        if (response.data && Array.isArray(response.data)) {
          // Procurar o grupo específico no array retornado
          const group = response.data.find((g: any) => g.id === groupId);

          if (group && group.subject) {
            console.log(`✅ [Webhook] Nome do grupo encontrado: ${group.subject}`);
            return group.subject;
          }
        }

        console.warn(`⚠️ [Webhook] Grupo ${groupId} não encontrado na resposta da Evolution API (tentativa ${attempt}/2)`);

        // Se primeira tentativa falhou, aguardar 1 segundo antes de tentar novamente
        if (attempt === 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error: any) {
        console.error(`❌ [Webhook] Erro ao buscar nome do grupo (tentativa ${attempt}/2):`, error.message);

        // Se primeira tentativa falhou, aguardar 1 segundo antes de tentar novamente
        if (attempt === 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    return null;
  }

  /**
   * Importa histórico de conversas recentes via Evolution API quando QR Code é escaneado
   * @param lineId - ID da linha que foi conectada
   * @param evolutionUrl - URL da Evolution API
   * @param evolutionKey - Chave de autenticação
   * @param instanceName - Nome da instância
   */
  async importRecentHistory(
    lineId: number,
    evolutionUrl: string,
    evolutionKey: string,
    instanceName: string
  ): Promise<void> {
    try {
      console.log(`📚 [Webhook] Iniciando importação de histórico para linha ${lineId}...`);

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
        console.error(`❌ [Webhook] Linha ${lineId} não encontrada`);
        return;
      }

      // Buscar conversas recentes via Evolution API (últimas 20 conversas)
      // Endpoint: /chat/findMessages/${instanceName}
      const response = await axios.post(
        `${evolutionUrl}/chat/findMessages/${instanceName}`,
        {
          limit: 20, // Limitar a 20 conversas mais recentes
        },
        {
          headers: { apikey: evolutionKey },
          timeout: 30000, // 30 segundos de timeout
        }
      );

      if (!response.data || !Array.isArray(response.data)) {
        console.warn(`⚠️ [Webhook] Nenhuma conversa encontrada no histórico`);
        return;
      }

      console.log(`📥 [Webhook] ${response.data.length} conversas encontradas no histórico`);

      let imported = 0;
      let skipped = 0;

      // Processar cada conversa
      for (const chat of response.data) {
        try {
          const remoteJid = chat.id || chat.remoteJid;
          if (!remoteJid) continue;

          // Verificar se é grupo
          const isGroup = remoteJid.includes('@g.us');
          const contactPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

          // Para grupos, buscar nome via Evolution API
          let contactName = chat.name || chat.pushName || contactPhone;
          if (isGroup) {
            const groupName = await this.fetchGroupName(remoteJid, evolutionUrl, evolutionKey, instanceName);
            if (groupName) {
              contactName = groupName;
            }
          }

          // Buscar ou criar contato
          let contact = await this.prisma.contact.findFirst({
            where: { phone: isGroup ? remoteJid : contactPhone },
          });

          if (!contact) {
            contact = await this.prisma.contact.create({
              data: {
                name: contactName,
                phone: isGroup ? remoteJid : contactPhone,
                segment: line.segment,
                isNameManual: false,
              },
            });
          }

          // Buscar mensagens da conversa (últimas 10)
          const messagesResponse = await axios.post(
            `${evolutionUrl}/chat/findMessages/${instanceName}`,
            {
              where: {
                key: {
                  remoteJid: remoteJid,
                },
              },
              limit: 10,
            },
            {
              headers: { apikey: evolutionKey },
              timeout: 10000,
            }
          );

          const messages = messagesResponse.data || [];

          // Encontrar operador online para vincular
          const onlineOperator = line.operators.find(lo =>
            lo.user.status === 'Online' &&
            (lo.user.role === 'operator' || lo.user.role === 'admin' || lo.user.role === 'supervisor')
          );

          const operatorId = onlineOperator?.userId || null;
          const operatorName = onlineOperator?.user.name || null;

          // Importar mensagens
          for (const msg of messages) {
            try {
              // Ignorar mensagens do próprio bot
              if (msg.key?.fromMe) continue;

              const messageText = msg.message?.conversation
                || msg.message?.extendedTextMessage?.text
                || msg.message?.imageMessage?.caption
                || 'Mensagem importada';

              const messageType = this.getMessageType(msg.message);
              const sender = msg.key?.fromMe ? 'operator' : 'contact';
              const datetime = msg.messageTimestamp
                ? new Date(Number(msg.messageTimestamp) * 1000)
                : new Date();

              // Verificar se já existe essa mensagem específica (pelo texto e timestamp)
              const existingMessage = await this.prisma.conversation.findFirst({
                where: {
                  contactPhone: isGroup ? remoteJid : contactPhone,
                  userLine: lineId,
                  message: messageText,
                  createdAt: {
                    gte: new Date(datetime.getTime() - 1000), // 1 segundo antes
                    lte: new Date(datetime.getTime() + 1000), // 1 segundo depois
                  },
                },
              });

              if (existingMessage) {
                skipped++;
                continue; // Mensagem já existe, pular
              }

              // Criar conversa vinculada ao operador online (se houver)
              await this.conversationsService.create({
                contactName: contactName,
                contactPhone: isGroup ? remoteJid : contactPhone,
                segment: line.segment,
                userName: operatorName,
                userLine: lineId,
                userId: operatorId, // Vincular ao operador online
                message: messageText,
                sender: sender as any,
                messageType,
                isGroup,
                groupId: isGroup ? remoteJid : undefined,
                groupName: isGroup ? contactName : undefined,
              });

              imported++;
            } catch (error: any) {
              console.error(`❌ [Webhook] Erro ao importar mensagem:`, error.message);
            }
          }
        } catch (error: any) {
          console.error(`❌ [Webhook] Erro ao processar conversa:`, error.message);
        }
      }

      console.log(`✅ [Webhook] Importação concluída: ${imported} mensagens importadas, ${skipped} conversas puladas`);
    } catch (error: any) {
      console.error(`❌ [Webhook] Erro ao importar histórico:`, error.message);
    }
  }

  private getMessageType(message: any): string {
    if (message?.imageMessage) return 'image';
    if (message?.videoMessage) return 'video';
    if (message?.audioMessage) return 'audio';
    if (message?.documentMessage) return 'document';
    return 'text';
  }

  private getMediaUrl(message: any): string | undefined {
    if (message?.imageMessage?.url) return message.imageMessage.url;
    if (message?.videoMessage?.url) return message.videoMessage.url;
    if (message?.audioMessage?.url) return message.audioMessage.url;
    if (message?.documentMessage?.url) return message.documentMessage.url;
    return undefined;
  }

  private getExtension(messageType: string, mimetype?: string): string {
    // Tentar extrair do mimetype primeiro
    if (mimetype) {
      const ext = mimetype.split('/')[1]?.split(';')[0];
      if (ext) {
        // Normalizar extensões comuns
        const normalizedExt = ext.replace('jpeg', 'jpg').replace('mpeg', 'mp3');
        return normalizedExt;
      }
    }

    const extensions = {
      image: 'jpg',
      video: 'mp4',
      audio: 'ogg',
      document: 'pdf',
    };
    return extensions[messageType] || 'bin';
  }

  // Extrair mídia em Base64 da mensagem (quando webhook_base64 = true)
  private extractBase64Media(message: any): { data: string; mimetype: string } | null {
    // Verificar cada tipo de mídia
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];

    for (const type of mediaTypes) {
      if (message?.[type]) {
        const mediaMsg = message[type];
        
        console.log(`🔍 [Webhook] Verificando ${type}:`, {
          hasBase64: !!mediaMsg.base64,
          hasMedia: !!mediaMsg.media,
          hasDirectBase64: typeof mediaMsg === 'string',
          mimetype: mediaMsg.mimetype,
          keys: Object.keys(mediaMsg),
        });
        
        // A Evolution API pode enviar base64 em diferentes formatos
        // Formato 1: { base64: "...", mimetype: "..." }
        if (mediaMsg.base64) {
          console.log(`✅ [Webhook] Base64 encontrado em ${type}.base64`);
          return {
            data: mediaMsg.base64,
            mimetype: mediaMsg.mimetype || this.getDefaultMimetype(type),
          };
        }

        // Formato 2: { mediaKey, ... } com base64 no campo data
        if (mediaMsg.media) {
          console.log(`✅ [Webhook] Base64 encontrado em ${type}.media`);
          return {
            data: mediaMsg.media,
            mimetype: mediaMsg.mimetype || this.getDefaultMimetype(type),
          };
        }

        // Formato 3: O próprio objeto pode ser base64 (string direta)
        if (typeof mediaMsg === 'string' && mediaMsg.length > 100) {
          console.log(`✅ [Webhook] Base64 encontrado como string direta em ${type}`);
          return {
            data: mediaMsg,
            mimetype: this.getDefaultMimetype(type),
          };
        }
      }
    }

    console.log('❌ [Webhook] Nenhum formato de base64 encontrado');
    return null;
  }

  private getDefaultMimetype(messageType: string): string {
    const mimetypes = {
      imageMessage: 'image/jpeg',
      videoMessage: 'video/mp4',
      audioMessage: 'audio/ogg',
      documentMessage: 'application/pdf',
    };
    return mimetypes[messageType] || 'application/octet-stream';
  }

  // Salvar mídia Base64 em arquivo
  private async saveBase64Media(base64Data: string, fileName: string, mimetype: string): Promise<string | null> {
    try {
      // Remover prefixo data:xxx;base64, se existir
      const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');
      
      const buffer = Buffer.from(base64Clean, 'base64');
      const filePath = path.join(this.uploadsDir, fileName);
      
      await fs.mkdir(this.uploadsDir, { recursive: true });
      await fs.writeFile(filePath, buffer);
      
      console.log(`📁 Arquivo Base64 salvo: ${fileName} (${buffer.length} bytes)`);
      return fileName;
    } catch (error) {
      console.error('❌ Erro ao salvar arquivo Base64:', error);
      return null;
    }
  }
}
