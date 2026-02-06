import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { MediaService } from '../media/media.service';
import { LinesService } from '../lines/lines.service';
import { SystemEventsService, EventType, EventModule, EventSeverity } from '../system-events/system-events.service';
import { HumanizationService } from '../humanization/humanization.service';
import { RateLimitingService } from '../rate-limiting/rate-limiting.service';
import { SpintaxService } from '../spintax/spintax.service';
import { HealthCheckCacheService } from '../health-check-cache/health-check-cache.service';
import { LineReputationService } from '../line-reputation/line-reputation.service';
import { PhoneValidationService } from '../phone-validation/phone-validation.service';
import { LineAssignmentService } from '../line-assignment/line-assignment.service';
import { MessageValidationService } from '../message-validation/message-validation.service';
import { MessageSendingService } from '../message-sending/message-sending.service';
import { AppLoggerService } from '../logger/logger.service';
import { TemplatesService } from '../templates/templates.service';
import { TemplateVariableDto } from '../templates/dto/send-template.dto';
import { OperatorQueueService } from '../operator-queue/operator-queue.service';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
        : ['http://localhost:5173', 'http://localhost:3001'];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<number, string> = new Map();

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private conversationsService: ConversationsService,
    private controlPanelService: ControlPanelService,
    private mediaService: MediaService,
    @Inject(forwardRef(() => LinesService))
    private linesService: LinesService,
    private systemEventsService: SystemEventsService,
    private humanizationService: HumanizationService,
    private rateLimitingService: RateLimitingService,
    private spintaxService: SpintaxService,
    private healthCheckCacheService: HealthCheckCacheService,
    private lineReputationService: LineReputationService,
    private phoneValidationService: PhoneValidationService,
    @Inject(forwardRef(() => LineAssignmentService))
    private lineAssignmentService: LineAssignmentService,
    private messageValidationService: MessageValidationService,
    private messageSendingService: MessageSendingService,
    private logger: AppLoggerService,
    private templatesService: TemplatesService,
    @Inject(forwardRef(() => OperatorQueueService))
    private queueService: OperatorQueueService,
  ) { }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        client.disconnect();
        return;
      }

      client.data.user = user;
      this.connectedUsers.set(user.id, client.id);

      // Atualizar status do usuário para Online
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'Online' },
      });

      // Log apenas para operadores (fluxo principal)
      if (user.role === 'operator') {
        console.log(`✅ Operador ${user.name} conectado`);
      }

      // Se for operador, verificar e sincronizar linha
      if (user.role === 'operator') {
        // Se já tem linha no campo legacy, verificar se está na tabela LineOperator
        if (user.line) {
          const existingLink = await (this.prisma as any).lineOperator.findFirst({
            where: {
              lineId: user.line,
              userId: user.id,
            },
          });

          if (!existingLink) {
            // Sincronizar: criar entrada na tabela LineOperator
            // Verificar se a linha ainda existe e está ativa
            const line = await this.prisma.linesStock.findUnique({
              where: { id: user.line },
            });

            if (line && line.lineStatus === 'active') {
              // Verificar quantos operadores já estão vinculados
              const currentOperatorsCount = await (this.prisma as any).lineOperator.count({
                where: { lineId: user.line },
              });

              if (currentOperatorsCount < 2) {
                try {
                  await this.linesService.assignOperatorToLine(user.line, user.id); // ✅ COM LOCK
                } catch (error) {
                  console.error(`❌ [WebSocket] Erro ao sincronizar linha ${user.line} para ${user.name}:`, error.message);
                }
              }
            } else {
              // Remover linha inválida do operador
              await this.prisma.user.update({
                where: { id: user.id },
                data: { line: null },
              });
              user.line = null;
            }
          }
        }

        // Se for operador sem linha, verificar se há linha disponível para vincular
        // IMPORTANTE: Admins NÃO recebem linhas automaticamente

        // Se for operador sem linha, solicitar uma via LineAssignmentService (respeitando fila)
        // IMPORTANTE: Admins NÃO recebem linhas automaticamente
        if (!user.line && user.role === 'operator') {
          console.log(`🔄 [WebSocket] Solicitando linha para operador ${user.name} via LineAssignmentService...`);

          // CENTRALIZAÇÃO: Usar o novo método requestLineForOperator que já verifica a fila
          const assignmentResult = await this.lineAssignmentService.requestLineForOperator(user.id);

          if (assignmentResult.success && assignmentResult.lineId) {
            user.line = assignmentResult.lineId;
            console.log(`✅ [WebSocket] Linha ${assignmentResult.linePhone} atribuída com sucesso para ${user.name}`);

            // Notificar operador sobre a atribuição
            this.server.to(client.id).emit('line-assigned', {
              lineId: assignmentResult.lineId,
              linePhone: assignmentResult.linePhone,
              message: 'Linha atribuída com sucesso!'
            });
          } else {
            console.log(`⏳ [WebSocket] Nenhuma linha atribuída para ${user.name}: ${assignmentResult.reason}`);
          }
        }



      }


      // Enviar conversas ativas ao conectar (para operators e admins)
      if (user.role === 'operator' || user.role === 'admin') {
        let activeConversations;

        if (user.role === 'admin') {
          // Admin vê TODAS as conversas ativas
          activeConversations = await this.prisma.conversation.findMany({
            where: { tabulation: null },
            orderBy: { datetime: 'asc' },
          });
        } else {
          // Operador: buscar linha atual (pode estar em LineOperator ou no campo legacy)
          let currentLineId = user.line;
          if (!currentLineId) {
            const lineOperator = await (this.prisma as any).lineOperator.findFirst({
              where: { userId: user.id },
              select: { lineId: true },
            });
            currentLineId = lineOperator?.lineId || null;
          }

          if (!currentLineId) {
            // Se não tem linha, retornar apenas conversas do próprio operador
            console.log(`📋 [WebSocket] Operador ${user.name} não tem linha - enviando apenas suas conversas`);
            activeConversations = await this.conversationsService.findActiveConversations(undefined, user.id);
          } else {
            // Verificar se modo compartilhado está ativo
            const controlPanel = await this.controlPanelService.findOne();
            const sharedLineMode = controlPanel?.sharedLineMode ?? false;

            if (sharedLineMode) {
              // MODO COMPARTILHADO ATIVO: Buscar conversas de TODOS os operadores da mesma linha
              const lineOperators = await (this.prisma as any).lineOperator.findMany({
                where: { lineId: currentLineId },
                select: { userId: true },
              });

              const userIds = lineOperators.map(lo => lo.userId);
              console.log(`📋 [WebSocket] [MODO COMPARTILHADO] Operador ${user.name} está na linha ${currentLineId} com ${userIds.length} operador(es) - enviando conversas de todos`);

              activeConversations = await this.conversationsService.findActiveConversationsByUserIds(userIds);
            } else {
              // MODO NORMAL: Operador vê apenas suas próprias conversas
              console.log(`📋 [WebSocket] [MODO NORMAL] Operador ${user.name} está na linha ${currentLineId} - enviando apenas suas conversas`);
              activeConversations = await this.conversationsService.findActiveConversations(undefined, user.id);
            }
          }
        }

        client.emit('active-conversations', activeConversations);

        // Processar mensagens pendentes na fila quando operador fica online
        if (user.line) {
          try {
            // Buscar mensagens pendentes do segmento do operador
            const whereClause: any = { status: 'pending' };
            if (user.segment) {
              whereClause.segment = user.segment;
            }

            // Remover limite de 10 - processar todas as mensagens pendentes
            const pendingMessages = await (this.prisma as any).messageQueue.findMany({
              where: whereClause,
              orderBy: { createdAt: 'asc' },
              // Processar em lotes de 50 para não sobrecarregar
              take: 50,
            });

            for (const queuedMessage of pendingMessages) {
              try {
                await (this.prisma as any).messageQueue.update({
                  where: { id: queuedMessage.id },
                  data: { status: 'processing', attempts: { increment: 1 } },
                });

                // Criar conversa
                await this.conversationsService.create({
                  contactPhone: queuedMessage.contactPhone,
                  contactName: queuedMessage.contactName || queuedMessage.contactPhone,
                  message: queuedMessage.message,
                  sender: 'contact',
                  messageType: queuedMessage.messageType,
                  mediaUrl: queuedMessage.mediaUrl,
                  segment: queuedMessage.segment,
                  userId: user.id,
                  userLine: user.line,
                });

                await (this.prisma as any).messageQueue.update({
                  where: { id: queuedMessage.id },
                  data: { status: 'sent', processedAt: new Date() },
                });

                this.emitToUser(user.id, 'queued-message-processed', {
                  messageId: queuedMessage.id,
                  contactPhone: queuedMessage.contactPhone,
                });
              } catch (error) {
                console.error(`❌ [WebSocket] Erro ao processar mensagem ${queuedMessage.id}:`, error);
                if (queuedMessage.attempts >= 3) {
                  await (this.prisma as any).messageQueue.update({
                    where: { id: queuedMessage.id },
                    data: { status: 'failed', errorMessage: error.message },
                  });
                } else {
                  await (this.prisma as any).messageQueue.update({
                    where: { id: queuedMessage.id },
                    data: { status: 'pending' },
                  });
                }
              }
            }

          } catch (error) {
            console.error('❌ [WebSocket] Erro ao processar fila de mensagens:', error);
          }
        }
      }
    } catch (error) {
      console.error('Erro na autenticação WebSocket:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    if (client.data.user) {
      const userId = client.data.user.id;

      try {
        // Atualizar status do usuário para Offline
        await this.prisma.user.update({
          where: { id: userId },
          data: { status: 'Offline' },
        });

        // Registrar evento de desconexão
        if (client.data.user.role === 'operator') {
          await this.systemEventsService.logEvent(
            EventType.OPERATOR_DISCONNECTED,
            EventModule.WEBSOCKET,
            { userId: userId, userName: client.data.user.name, email: client.data.user.email },
            userId,
            EventSeverity.INFO,
          );
        }

        // Log apenas para operadores (fluxo principal)
        if (client.data.user.role === 'operator') {
          console.log(`❌ Operador ${client.data.user.name} desconectado`);
        }
      } catch (error) {
        console.error(`❌ [WebSocket] Erro ao atualizar status na desconexão:`, error);
      } finally {
        // SEMPRE remover do Map, mesmo com erro
        this.connectedUsers.delete(userId);
      }
    }
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { contactPhone: string; message: string; messageType?: string; mediaUrl?: string; fileName?: string; isNewConversation?: boolean; templateId?: number; templateVariables?: TemplateVariableDto[]; base64?: string; mediaBase64?: string; isAdminTest?: boolean },
  ) {
    const startTime = Date.now(); // Para métricas de latência
    const user = client.data.user;

    if (!user) {
      console.error('❌ [WebSocket] Usuário não autenticado');
      return { error: 'Usuário não autenticado' };
    }


    // Buscar nome do segmento para log
    let userSegmentName = 'Sem Segmento';
    if (user.segment) {
      const segmentObj = await this.prisma.segment.findUnique({ where: { id: user.segment } });
      if (segmentObj) userSegmentName = segmentObj.name;
    }

    // Log inicial para debug
    const isGroupDebug = data.contactPhone?.includes('@g.us') || false;
    console.log(`📨 [WebSocket] handleSendMessage - User: ${user.name}, ContactPhone: ${data.contactPhone}, IsGroup: ${isGroupDebug}, MessageType: ${data.messageType || 'text'}`);


    // Buscar linha atual do operador (pode estar na tabela LineOperator ou no campo legacy)
    let currentLineId = user.line;
    if (!currentLineId) {
      const lineOperator = await (this.prisma as any).lineOperator.findFirst({
        where: { userId: user.id },
        select: { lineId: true },
      });
      currentLineId = lineOperator?.lineId || null;
    }

    // Se operador tem linha, verificar se está ativa na Evolution ANTES de enviar mensagem
    if (currentLineId) {
      const currentLine = await this.prisma.linesStock.findUnique({
        where: { id: currentLineId },
      });

      if (currentLine) {
        // Verificar status da linha na Evolution
        const evolution = await this.prisma.evolution.findUnique({
          where: { evolutionName: currentLine.evolutionName },
        });

        if (evolution) {
          const instanceName = `line_${currentLine.phone.replace(/\D/g, '')}`;
          const lineStatus = await this.healthCheckCacheService.getConnectionStatus(
            evolution.evolutionUrl,
            evolution.evolutionKey,
            instanceName
          );

          // Se linha está banida ou desconectada, realocar ANTES de enviar mensagem
          if (!lineStatus || lineStatus === 'ban' || lineStatus === 'disconnected' || lineStatus.toLowerCase() === 'ban' || lineStatus.toLowerCase() === 'disconnected') {
            console.warn(`⚠️ [WebSocket] Linha ${currentLine.phone} está ${lineStatus || 'desconectada'} antes de enviar mensagem. Marcando como banida e realocando...`);

            try {
              // Realocar nova linha e marcar linha antiga como banida
              // A função reallocateLineForOperator vai desvincular todos os operadores e marcar como banida
              const reallocationResult = await this.lineAssignmentService.reallocateLineForOperator(
                user.id,
                user.segment || null,
                currentLine.id, // oldLineId - linha banida
                [], // excludeLineIds
                undefined, // traceId
                false // markAsBanned = false - monitor fará o banimento se necessário
              );

              if (reallocationResult.success && reallocationResult.lineId) {
                const newLine = await this.prisma.linesStock.findUnique({
                  where: { id: reallocationResult.lineId },
                });
                if (newLine) {
                  currentLineId = newLine.id;
                  user.line = newLine.id;
                  console.log(`✅ [WebSocket] Linha ${newLine.phone} realocada para operador ${user.name} antes de enviar mensagem`);
                } else {
                  console.error(`❌ [WebSocket] Linha ${reallocationResult.lineId} não encontrada após realocação`);
                  return { error: 'Não foi possível alocar linha ativa. Tente novamente.' };
                }
              } else {
                console.error(`❌ [WebSocket] Não foi possível realocar linha para operador ${user.name}: ${reallocationResult.reason}`);
                return { error: 'Não foi possível alocar linha ativa. Tente novamente.' };
              }
            } catch (error: any) {
              console.error(`❌ [WebSocket] Erro ao realocar linha antes de enviar mensagem:`, error.message);
              return { error: 'Erro ao verificar linha. Tente novamente.' };
            }
          }
        }
      }
    }

    // Se operador não tem linha, tentar atribuir automaticamente via serviço centralizado
    // Isso garante respeito a todas as regras de negócio (fila, prioridades, limites de operadores)
    if (!currentLineId) {
      console.log(`🔄 [WebSocket] Operador sem linha ao tentar enviar. Solicitando nova linha via LineAssignmentService...`);

      // Tentar solicitar linha (respeitando fila e limites)
      const assignmentResult = await this.lineAssignmentService.requestLineForOperator(user.id);

      if (assignmentResult.success && assignmentResult.lineId) {
        currentLineId = assignmentResult.lineId;
        user.line = assignmentResult.lineId;
        console.log(`✅ [WebSocket] Linha ${assignmentResult.linePhone} atribuída automaticamente para ${user.name}`);
      } else {
        console.warn(`⏳ [WebSocket] Não foi possível atribuir linha automaticamente: ${assignmentResult.reason}`);

        // Se falhar (ex: fila, sem linhas), retornar erro informativo
        if (assignmentResult.reason?.toLowerCase().includes('fila')) {
          return { error: 'Você foi adicionado à fila de espera. Aguarde sua vez.' };
        } else {
          return { error: 'Aguarde alocação de linha (nenhuma disponível no momento).' };
        }
      }
    }

    // Verificar se é teste administrador (apenas admins podem usar)
    const isAdminTest = data.isAdminTest === true && user.role === 'admin';

    if (data.isAdminTest === true && user.role !== 'admin') {
      console.error('❌ [WebSocket] Apenas administradores podem usar modo teste');
      return { error: 'Apenas administradores podem usar modo teste administrador' };
    }

    if (isAdminTest) {
      console.log(`🧪 [WebSocket] Modo TESTE ADMINISTRADOR ativado por ${user.name} - esta ação NÃO aparecerá nos relatórios`);
    }

    // Verificar se é uma nova conversa (1x1) e se o operador tem permissão
    // Administradores sempre têm permissão de 1x1
    if (data.isNewConversation && user.role !== 'admin') {
      const fullUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          oneToOneActive: true,
        },
      });


      if (!fullUser?.oneToOneActive) {
        console.error('❌ [WebSocket] Operador sem permissão para 1x1');
        return { error: 'Você não tem permissão para iniciar conversas 1x1' };
      }
    }


    let line: any = null;

    try {
      // Detectar se é grupo (grupos têm @g.us no contactPhone)
      const isGroup = data.contactPhone?.includes('@g.us') || false;

      // IMPORTANTE: Verificações de CPC, repescagem e validação são APENAS para contatos individuais
      if (!isGroup) {
        // Verificar CPC
        const cpcCheck = await this.controlPanelService.canContactCPC(data.contactPhone, user.segment);
        if (!cpcCheck.allowed) {
          return { error: cpcCheck.reason };
        }

        // Verificar repescagem
        const repescagemCheck = await this.controlPanelService.checkRepescagem(
          data.contactPhone,
          user.id,
          user.segment
        );
        if (!repescagemCheck.allowed) {
          return { error: repescagemCheck.reason };
        }

        // Normalizar telefone (remover espaços, hífens, adicionar 55 se necessário)
        const normalizedPhone = this.phoneValidationService.cleanPhone(data.contactPhone);
        data.contactPhone = normalizedPhone;

        // Validação de número: Verificar se o número é válido antes de enviar
        const phoneValidation = this.phoneValidationService.isValidFormat(data.contactPhone);
        if (!phoneValidation) {
          return { error: 'Número de telefone inválido' };
        }
      } else {
        console.log(`📱 [WebSocket] Enviando mensagem para GRUPO: ${data.contactPhone}`);
      }

      // Buscar linha atual do operador (sempre usar a linha atual, não a linha antiga da conversa)
      line = await this.prisma.linesStock.findUnique({
        where: { id: currentLineId },
      });

      if (!line || line.lineStatus !== 'active') {
        return { error: 'Linha não disponível' };
      }

      let evolution = await this.prisma.evolution.findUnique({
        where: { evolutionName: line.evolutionName },
      });
      let instanceName = `line_${line.phone.replace(/\D/g, '')}`;

      // Rate Limiting: Verificar se a linha pode enviar mensagem
      const canSend = await this.rateLimitingService.canSendMessage(currentLineId);
      if (!canSend) {
        return { error: 'Limite de mensagens atingido' };
      }

      // Verificar se o segmento permite mensagem livre (APENAS para novas conversas 1x1)
      // Administradores sempre podem enviar mensagens livres, independente do segmento
      // Se não permitir e não for template, bloquear envio apenas em novas conversas
      if (data.isNewConversation && user.segment && !data.templateId && user.role !== 'admin') {
        const segment = await this.prisma.segment.findUnique({
          where: { id: user.segment },
        });

        // Verificar allowsFreeMessage (campo pode não existir ainda se Prisma não foi regenerado)
        const allowsFreeMessage = (segment as any)?.allowsFreeMessage;
        if (segment && allowsFreeMessage === false) {
          return {
            error: 'Este segmento não permite mensagens livres. Use apenas templates para enviar mensagens no 1x1.'
          };
        }
      }

      // Enviar mensagem diretamente (sem delay)

      // Se templateId foi fornecido, usar TemplatesService para enviar template
      if (data.templateId) {
        try {
          // Buscar contato para obter nome
          const contact = await this.prisma.contact.findFirst({
            where: { phone: data.contactPhone },
          });

          // Enviar template via TemplatesService - com retry automático e realocação de linha para QUALQUER erro
          let templateResult;
          let templateAttempt = 0;
          const maxTemplateRetries = 8;
          const failedLineIds: number[] = [];

          while (templateAttempt < maxTemplateRetries) {
            console.log(`🔄 [WebSocket] Tentativa ${templateAttempt + 1}/${maxTemplateRetries} de enviar template via linha ${currentLineId}`);

            templateResult = await this.templatesService.sendTemplate({
              templateId: data.templateId,
              phone: data.contactPhone,
              contactName: contact?.name || data.message || 'Contato',
              variables: data.templateVariables || [],
              lineId: currentLineId,
              userId: user.id, // IMPORTANTE: passar userId para a conversa aparecer para o operador
              segment: user.segment, // IMPORTANTE: passar segment
              userName: user.name, // Nome do operador
            });

            // Se sucesso, sair do loop
            if (templateResult.success) {
              console.log(`✅ [WebSocket] Template enviado com sucesso na tentativa ${templateAttempt + 1}`);
              break;
            }

            // Se falhou (QUALQUER erro), realocar linha e tentar novamente
            templateAttempt++;
            console.warn(`⚠️ [WebSocket] Erro ao enviar template (tentativa ${templateAttempt}/${maxTemplateRetries}): ${templateResult.error || 'Erro desconhecido'}. Verificando saúde da linha...`);

            failedLineIds.push(currentLineId); // Adicionar linha atual à lista de falhas para não pegar de volta

            // VERIFICAÇÃO RIGOROSA: Checar se a linha está banida na Evolution
            let markAsBanned = false;

            // 1. Checar mensagem de erro textual (igual mensagem normal)
            const errorMessage = typeof templateResult.error === 'string' ? templateResult.error.toLowerCase() : JSON.stringify(templateResult.error).toLowerCase();
            if (errorMessage.includes('ban') || errorMessage.includes('blocked') || errorMessage.includes('disconnect') || errorMessage.includes('closed')) {
              console.warn(`⚠️ [WebSocket] Erro indica banimento/desconexão: "${templateResult.error}". Marcando como BANIDA.`);
              markAsBanned = true;
            }

            try {
              const currentLineCheck = await this.prisma.linesStock.findUnique({ where: { id: currentLineId } });
              if (currentLineCheck) {
                // USAR CHECK ATIVO (verifyLineHealth) em vez de cache
                // Isso garante atualização imediata do banimento
                try {
                  const health = await this.linesService.verifyLineHealth(currentLineCheck.id);
                  const lineStatus = health.newStatus;

                  if (lineStatus !== 'active') {
                    console.warn(`⚠️ [WebSocket] CRÍTICO: Linha ${currentLineCheck.phone} está ${lineStatus} (Verified). Marcando como BANIDA.`);
                    markAsBanned = true;
                  }
                } catch (verifyError) {
                  console.error(`❌ [WebSocket] Erro ao verificar linha durante retry de template:`, verifyError);
                }
              }
            } catch (healthError) {
              console.warn(`⚠️ [WebSocket] Erro ao verificar saúde da linha ${currentLineId}: ${healthError.message}`);
            }

            const reallocationResult = await this.lineAssignmentService.reallocateLineForOperator(
              user.id,
              user.segment,
              currentLineId,
              failedLineIds, // Passar lista de exclusão acumulada
              undefined, // traceId
              markAsBanned // ✅ AGORA PASSAMOS O FLAG PARA BANIR SE NECESSÁRIO
            );

            if (reallocationResult.success && reallocationResult.lineId && reallocationResult.lineId !== currentLineId) {
              currentLineId = reallocationResult.lineId;
              user.line = reallocationResult.lineId;

              const newLine = await this.prisma.linesStock.findUnique({
                where: { id: reallocationResult.lineId },
              });

              if (newLine) {
                line = newLine;
                console.log(`✅ [WebSocket] Linha realocada: ${line?.phone} → ${newLine.phone}. Tentando enviar template novamente...`);
                continue; // Tentar novamente com nova linha
              } else {
                console.error(`❌ [WebSocket] Nova linha ${reallocationResult.lineId} não encontrada no banco`);
                break; // Se não encontrou a linha, não adianta continuar
              }
            } else {
              console.error(`❌ [WebSocket] Não foi possível realocar linha para operador ${user.name}`);
              break; // Se não conseguiu realocar, não adianta continuar
            }
          }

          // Se saiu do loop sem sucesso, verificar se foi porque esgotou tentativas
          if (!templateResult.success) {
            console.error(`❌ [WebSocket] Não foi possível enviar template após ${templateAttempt} tentativa(s)`);

            // "Exhaustion Ban": Se falhou todas as vezes, BANIR TODAS AS LINHAS TENTADAS
            if (templateAttempt >= maxTemplateRetries) {
              const allFailedLines = [...new Set([...failedLineIds, currentLineId])]; // Garantir que linha atual também entre
              console.error(`❌ [WebSocket] TODAS as ${maxTemplateRetries} tentativas falharam. Banindo TODAS as ${allFailedLines.length} linhas tentadas por exaustão total.`);

              for (const lineIdToBan of allFailedLines) {
                try {
                  console.log(`🚫 [WebSocket] Banindo linha ${lineIdToBan} por exaustão...`);
                  await this.linesService.handleBannedLine(lineIdToBan);
                } catch (banError) {
                  console.error(`❌ [WebSocket] Erro ao banir linha ${lineIdToBan} por exaustão:`, banError);
                }
              }
            }

            return { error: templateResult.error || 'Erro desconhecido ao enviar template após múltiplas tentativas' };
          }

          if (templateResult.success) {
            // Buscar conversa criada pelo template
            const conversation = await this.prisma.conversation.findFirst({
              where: {
                contactPhone: data.contactPhone,
                userLine: currentLineId,
              },
              orderBy: { datetime: 'desc' },
            });

            // Registrar mensagem do operador para controle de repescagem (apenas para contatos individuais)
            const isGroupTemplate = data.contactPhone?.includes('@g.us') || false;
            if (!isGroupTemplate) {
              await this.controlPanelService.registerOperatorMessage(
                data.contactPhone,
                user.id,
                user.segment
              );
            }

            // Registrar evento de mensagem enviada
            await this.systemEventsService.logEvent(
              EventType.MESSAGE_SENT,
              EventModule.WEBSOCKET,
              {
                userId: user.id,
                userName: user.name,
                contactPhone: data.contactPhone,
                messageType: 'template',
                lineId: currentLineId,
                linePhone: line?.phone,
                templateId: data.templateId,
              },
              user.id,
              EventSeverity.INFO,
            );

            // Emitir mensagem para o usuário que enviou
            if (conversation) {
              client.emit('message-sent', { message: conversation });

              // SINCRONIZAÇÃO: Emitir para outros operadores da mesma linha
              if (currentLineId) {
                await this.emitToLineOperators(currentLineId, 'new_message', { message: conversation }, user.id);
              }

              this.emitToSupervisors(user.segment, 'new_message', { message: conversation });
            }

            return { success: true, conversation, templateMessageId: templateResult.templateMessageId };
          } else {
            return { error: templateResult.error || 'Erro ao enviar template' };
          }
        } catch (templateError: any) {
          console.error('❌ [WebSocket] Erro ao enviar template:', templateError);
          return { error: templateError.message || 'Erro ao enviar template' };
        }
      }

      // Health check: Verificar se a linha está realmente conectada no Evolution (com cache)
      let connectionState: string;
      try {
        connectionState = await this.healthCheckCacheService.getConnectionStatus(
          evolution.evolutionUrl,
          evolution.evolutionKey,
          instanceName,
        );
        // Verificar se status é realmente desconectado
        // "unknown" não é considerado desconectado (pode ser cache ou API não retornou status)
        // Apenas status explicitamente desconectados devem acionar realocação
        const isConnected = connectionState === 'open' ||
          connectionState === 'OPEN' ||
          connectionState === 'connected' ||
          connectionState === 'CONNECTED';

        const isExplicitlyDisconnected = connectionState === 'close' ||
          connectionState === 'CLOSE' ||
          connectionState === 'disconnected' ||
          connectionState === 'DISCONNECTED' ||
          connectionState === 'closeTimeout';

        // Se não está explicitamente desconectado, considerar como conectado (incluindo "unknown")
        if (isExplicitlyDisconnected && !isConnected) {
          // Realocação automática: buscar nova linha para o operador
          console.warn(`⚠️ [WebSocket] Linha ${line.phone} desconectada. Realocando para ${user.name}...`);
          const reallocationResult = await this.lineAssignmentService.reallocateLineForOperator(user.id, user.segment, currentLineId);

          // Verificar se realmente conseguiu uma NOVA linha (diferente da atual)
          if (reallocationResult.success && reallocationResult.lineId && reallocationResult.lineId !== currentLineId) {
            // Atualizar user object
            user.line = reallocationResult.lineId;
            currentLineId = reallocationResult.lineId;

            console.log(`✅ [WebSocket] Linha realocada: ${line.phone} → ${reallocationResult.linePhone}`);

            // Tentar enviar mensagem novamente com a nova linha
            // Recarregar dados da nova linha
            const newLine = await this.prisma.linesStock.findUnique({
              where: { id: reallocationResult.lineId },
            });

            if (newLine) {
              // Atualizar variável line para usar a nova linha
              line = newLine;
              // Continuar o fluxo normalmente com a nova linha
            } else {
              return { error: 'Linha desconectada e realocada, mas nova linha não encontrada' };
            }
          } else {
            return { error: 'Linha não está conectada e não foi possível realocar' };
          }
        }
      } catch (healthError: any) {
        // Erro no health check não deve bloquear envio (pode ser problema temporário da API)
      }

      // Função auxiliar para tentar realocar linha e reenviar (para QUALQUER erro)
      const tryReallocateAndResend = async (sendFunction: () => Promise<any>, maxRetries: number = 8): Promise<any> => {
        let attempt = 0;
        let lastError: any = null;
        let failedLineIds: number[] = []; // Acumular IDs de linhas falhas

        while (attempt < maxRetries) {
          try {
            return await sendFunction();
          } catch (error: any) {
            lastError = error;
            attempt++;

            const errorStatus = error.response?.status;
            const errorMessage = error.response?.data?.message || error.message;

            console.warn(`⚠️ [WebSocket] Erro ao enviar (tentativa ${attempt}/${maxRetries}). Linha ${currentLineId}. Erro: ${errorStatus} - ${errorMessage}`);

            failedLineIds.push(currentLineId); // Registrar linha atual como falha

            // Verificar se erro indica problema com a linha (ban, disconnected) ou outro erro
            // Erros 400 podem ser: linha banida, número inválido, mensagem inválida, etc.
            let shouldReallocate = false;
            let markLineAsBanned = false; // Flag para marcar linha como banida no banco

            if (errorStatus === 400 || errorStatus === 403 || errorStatus === 404 || errorStatus === 500) {
              // Verificar status da linha na Evolution antes de realocar
              try {
                const currentLineCheck = await this.prisma.linesStock.findUnique({
                  where: { id: currentLineId },
                });

                if (currentLineCheck) {
                  if (currentLineCheck) {
                    // USAR CHECK ATIVO (verifyLineHealth) em vez de cache
                    // Isso vai bater na API da Evolution e atualizar o status no banco se necessário
                    try {
                      const health = await this.linesService.verifyLineHealth(currentLineCheck.id);
                      const lineStatus = health.newStatus;

                      // Se linha está banida ou desconectada (retornada pelo check ativo)
                      if (lineStatus !== 'active') {
                        console.warn(`⚠️ [WebSocket] Check Ativo confirmou: Linha ${currentLineCheck.phone} está ${lineStatus}. Marcando como banida e realocando...`);
                        shouldReallocate = true;
                        markLineAsBanned = true;
                      }
                    } catch (verifyError) {
                      console.error(`❌ [WebSocket] Erro ao executar verifyLineHealth:`, verifyError);
                      // Se falhar o check, assumimos que pode estar ruim se o erro original indicava isso
                      if (errorMessage?.toLowerCase().includes('ban') || errorMessage?.toLowerCase().includes('disconnect')) {
                        shouldReallocate = true;
                      }
                    }

                    if (!shouldReallocate && (
                      errorMessage?.toLowerCase().includes('ban') ||
                      errorMessage?.toLowerCase().includes('blocked') ||
                      errorMessage?.toLowerCase().includes('disconnect')
                    )) {
                      // Se o check disse 'active' mas o erro é explícito de ban, confiamos no erro
                      console.warn(`⚠️ [WebSocket] Check disse Active, mas erro é explícito: ${errorMessage}`);
                      shouldReallocate = true;
                      markLineAsBanned = true;
                    }
                    // Se depois de tudo isso, NÃO for realocar, então é erro de número/mensagem
                    if (!shouldReallocate) {
                      console.warn(`⚠️ [WebSocket] Erro ${errorStatus} pode ser problema com número/mensagem, não com linha. Verificando...`);
                      if (attempt >= 2) {
                        shouldReallocate = true;
                      }
                    }
                  } else {
                    // Evolution não encontrada, assumir que precisa realocar
                    console.warn(`⚠️ [WebSocket] Evolution não encontrada para linha ${currentLineCheck.phone}`);
                    shouldReallocate = true;
                  }
                }
              } catch (statusError: any) {
                // Se não conseguir verificar status, assumir que precisa realocar após 2 tentativas
                console.warn(`⚠️ [WebSocket] Erro ao verificar status da linha: ${statusError.message}`);
                if (attempt >= 2) {
                  shouldReallocate = true;
                }
              }
            } else {
              // Outros erros (500, 503, etc) podem indicar problema temporário, mas vamos realocar também
              shouldReallocate = true;
            }

            // Realocar linha se necessário
            if (shouldReallocate) {
              console.warn(`⚠️ [WebSocket] Realocando linha para operador ${user.name}...`);
              const reallocationResult = await this.lineAssignmentService.reallocateLineForOperator(
                user.id,
                user.segment || null,
                currentLineId,
                [], // excludeLineIds
                undefined, // traceId
                false // markAsBanned = false - monitor fará o banimento se necessário
              );

              if (reallocationResult.success && reallocationResult.lineId && reallocationResult.lineId !== currentLineId) {
                // Atualizar variáveis de linha
                currentLineId = reallocationResult.lineId;
                user.line = reallocationResult.lineId;

                // Buscar nova linha
                const newLine = await this.prisma.linesStock.findUnique({
                  where: { id: reallocationResult.lineId },
                });

                if (newLine) {
                  line = newLine;
                  // Recriar instanceName com nova linha
                  const newInstanceName = `line_${newLine.phone.replace(/\D/g, '')}`;

                  // Buscar evolution da nova linha
                  const newEvolution = await this.prisma.evolution.findUnique({
                    where: { evolutionName: newLine.evolutionName },
                  });

                  if (newEvolution) {
                    evolution = newEvolution;
                    instanceName = newInstanceName;
                    console.log(`✅ [WebSocket] Linha realocada: ${line?.phone} → ${newLine.phone}. Tentando reenviar (tentativa ${attempt + 1}/${maxRetries})...`);

                    // Continuar o loop para tentar novamente com a nova linha
                    continue;
                  } else {
                    console.error(`❌ [WebSocket] Evolution não encontrada para linha ${newLine.phone}`);
                  }
                } else {
                  console.error(`❌ [WebSocket] Linha realocada ${reallocationResult.lineId} não encontrada no banco`);
                }
              } else {
                console.error(`❌ [WebSocket] Não foi possível realocar linha: ${reallocationResult.reason || 'Nenhuma linha disponível'}`);
                if (reallocationResult.lineId === currentLineId) {
                  console.error(`❌ [WebSocket] Linha realocada é a mesma (${currentLineId}). Não há outras linhas disponíveis.`);
                }
              }
            } else {
              // Se não deve realocar (erro pode ser com número/mensagem), não fazer nada
              console.warn(`⚠️ [WebSocket] Erro não relacionado à linha. Não será feita realocação.`);
            }

            // Exhaustion Ban (Se falhou tudo, BANIR TODAS AS LINHAS TENTADAS)
            if (attempt >= maxRetries) {
              const allFailedLines = [...new Set([...failedLineIds, currentLineId])];
              console.error(`❌ [WebSocket] TODAS as ${maxRetries} tentativas falharam. Banindo TODAS as ${allFailedLines.length} linhas tentadas por exaustão total.`);

              for (const lineIdToBan of allFailedLines) {
                try {
                  console.log(`🚫 [WebSocket] Banindo linha ${lineIdToBan} por exaustão...`);
                  await this.linesService.handleBannedLine(lineIdToBan);
                } catch (banError) {
                  console.error(`❌ [WebSocket] Erro ao banir linha ${lineIdToBan} por exaustão:`, banError);
                }
              }

              throw lastError || new Error(`Falha ao enviar mensagem após ${maxRetries} tentativas. Último erro: ${lastError?.message || 'Desconhecido'}`);
            }
          }
        }

        throw lastError || new Error('Erro desconhecido ao tentar enviar');
      };

      // Enviar mensagem via Evolution API
      let apiResponse;

      if (data.messageType === 'image' && data.mediaUrl) {
        apiResponse = await tryReallocateAndResend(async () => {
          return await axios.post(
            `${evolution.evolutionUrl}/message/sendMedia/${instanceName}`,
            {
              number: data.contactPhone.replace(/\D/g, ''),
              mediaUrl: data.mediaUrl,
              caption: data.message,
              mediatype: 'image',
            },
            {
              headers: { 'apikey': evolution.evolutionKey },
              timeout: 30000,
            }
          );
        });
      } else if (data.messageType === 'document' && data.mediaUrl) {
        // Para documentos, tentar primeiro com sendMedia, se falhar, tentar sendDocument
        // Extrair nome do arquivo (usar fileName do data se disponível, senão da URL)
        const fileName = data.fileName || data.mediaUrl.split('/').pop() || 'document.pdf';
        // Remover timestamp e IDs do nome se vier da URL
        const cleanFileName = fileName.includes('-') && fileName.match(/^\d+-/)
          ? fileName.replace(/^\d+-/, '').replace(/-\d+\./, '.')
          : fileName;

        // Determinar mediatype baseado na extensão (Evolution API usa "mediatype" não "mimetype")
        const getMediaType = (filename: string): string => {
          const ext = filename.split('.').pop()?.toLowerCase();
          // Evolution API espera: document, image, video, audio
          if (['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(ext || '')) {
            return 'document';
          }
          if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
            return 'image';
          }
          if (['mp4', 'mpeg', 'avi', 'mov'].includes(ext || '')) {
            return 'video';
          }
          if (['mp3', 'ogg', 'wav', 'm4a'].includes(ext || '')) {
            return 'audio';
          }
          return 'document'; // Default para documentos
        };

        try {
          // OPERADOR envia documentos: sempre ler arquivo do servidor e converter para base64
          let base64File: string | null = data.base64 || data.mediaBase64 || null;

          console.log(`📤 [WebSocket] Tentando enviar documento - mediaUrl: ${data.mediaUrl}, base64 presente: ${!!base64File}`);

          // Se operador enviou mediaUrl do nosso servidor, SEMPRE ler arquivo e converter para base64
          const appUrl = process.env.APP_URL || 'https://api.newvend.taticamarketing.com.br';
          const isOurServer = data.mediaUrl && (
            data.mediaUrl.startsWith('/media/') ||
            data.mediaUrl.startsWith(appUrl) ||
            data.mediaUrl.includes('/media/')
          );

          console.log(`🔍 [WebSocket] Verificação de servidor - mediaUrl: ${data.mediaUrl}, appUrl: ${appUrl}, isOurServer: ${isOurServer}`);

          if (!base64File && data.mediaUrl) {
            if (isOurServer) {
              // É do nosso servidor - SEMPRE ler arquivo e converter para base64
              let filename: string;

              try {
                if (data.mediaUrl.startsWith('/media/')) {
                  // URL relativa: /media/arquivo.pdf
                  filename = data.mediaUrl.replace('/media/', '');
                } else if (data.mediaUrl.startsWith('http')) {
                  // URL completa: https://api.newvend.../media/arquivo.pdf
                  const urlPath = new URL(data.mediaUrl).pathname;
                  filename = urlPath.replace('/media/', '');
                } else {
                  // Pode ser apenas o nome do arquivo
                  filename = data.mediaUrl;
                }

                console.log(`📂 [WebSocket] Tentando ler arquivo: ${filename}`);

                // Validar existência do arquivo ANTES de tentar ler
                const filePath = await this.mediaService.getFilePath(filename);

                // Verificar se arquivo existe
                try {
                  await fs.access(filePath);
                } catch (accessError) {
                  console.error(`❌ [WebSocket] Arquivo não existe: ${filePath}`);
                  throw new Error(`Arquivo não encontrado: ${filename}`);
                }

                // Ler arquivo
                const fileBuffer = await fs.readFile(filePath);

                // Validar tamanho do arquivo (máximo 200MB)
                const maxSizeBytes = 200 * 1024 * 1024; // 200MB
                if (fileBuffer.length > maxSizeBytes) {
                  throw new Error(`Arquivo muito grande: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB. Máximo permitido: 200MB`);
                }

                // Validar extensão/tipo do arquivo - lista ampla
                const allowedExtensions = [
                  // Imagens
                  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'heic', 'heif',
                  // Vídeos
                  'mp4', 'mpeg', 'avi', 'mov', 'wmv', 'webm', '3gp', 'flv', 'mkv',
                  // Áudios
                  'mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac', 'wma',
                  // Documentos
                  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf', 'odt', 'ods', 'odp',
                  // Texto
                  'txt', 'csv', 'html', 'xml', 'json',
                  // Compactados
                  'zip', 'rar', '7z', 'gz', 'tar',
                ];
                const fileExt = filename.split('.').pop()?.toLowerCase();
                if (!fileExt || !allowedExtensions.includes(fileExt)) {
                  console.warn(`⚠️ [WebSocket] Extensão de arquivo não reconhecida: ${fileExt}. Continuando mesmo assim...`);
                }

                base64File = fileBuffer.toString('base64');
                console.log(`✅ [WebSocket] Arquivo lido do servidor e convertido para base64: ${filename} (${(fileBuffer.length / 1024).toFixed(2)} KB)`);
              } catch (fileError: any) {
                console.error(`❌ [WebSocket] Erro ao ler arquivo do servidor:`, {
                  mediaUrl: data.mediaUrl,
                  filename: filename || 'não identificado',
                  error: fileError.message,
                  stack: fileError.stack
                });
                throw new Error(`Erro ao processar arquivo: ${filename || data.mediaUrl}. ${fileError.message}`);
              }
            } else {
              console.log(`⚠️ [WebSocket] mediaUrl não é do nosso servidor: ${data.mediaUrl}. Tentando usar URL direta...`);
            }
          }

          // OPERADOR enviando documento: SEMPRE usar base64 (do operador ou lido do servidor)
          const cleanPhone = data.contactPhone.replace(/\D/g, '');

          // Validação final: garantir que temos base64 ou URL válida
          if (!base64File && !data.mediaUrl) {
            console.error(`❌ [WebSocket] Falha crítica: nem base64 nem mediaUrl disponíveis`);
            throw new Error('Não foi possível obter o arquivo. Verifique se o upload foi realizado corretamente.');
          }

          if (base64File && typeof base64File !== 'string') {
            console.error(`❌ [WebSocket] Base64 inválido (tipo: ${typeof base64File})`);
            throw new Error('Formato de arquivo inválido. Base64 deve ser uma string.');
          }

          // Se não temos base64 mas temos URL externa, podemos tentar usar a URL diretamente
          // (será tratado no envio)

          // ESTRATÉGIA: Enviar via URL pública ao invés de base64
          // A Evolution API prefere URLs para documentos

          console.log(`📦 [WebSocket] Preparando envio - Tamanho: ${(base64File.length / 1024).toFixed(2)} KB`);

          // Construir URL pública do arquivo (appUrl já foi declarado acima)
          const publicMediaUrl = data.mediaUrl.startsWith('http')
            ? data.mediaUrl
            : `${appUrl}${data.mediaUrl}`;

          console.log(`🌐 [WebSocket] URL pública do arquivo: ${publicMediaUrl}`);

          let payload: any = {
            number: cleanPhone,
            mediatype: getMediaType(cleanFileName),
            media: publicMediaUrl, // Enviar URL ao invés de base64
            fileName: cleanFileName,
          };

          if (data.message && data.message.trim()) {
            payload.caption = data.message;
          }

          // Função para enviar documento (será usado na realocação)
          // Usar arrow function para capturar variáveis dinamicamente
          const sendDocumentFunction = async () => {
            // Reconstruir payload com valores atualizados (caso linha tenha sido trocada)
            const currentPayload: any = {
              number: cleanPhone,
              mediatype: getMediaType(cleanFileName),
              media: publicMediaUrl,
              fileName: cleanFileName,
            };

            if (data.message && data.message.trim()) {
              currentPayload.caption = data.message;
            }

            try {
              console.log(`📤 [WebSocket] OPERADOR enviando documento para ${cleanPhone} via linha ${line.phone}`);

              return await axios.post(
                `${evolution.evolutionUrl}/message/sendMedia/${instanceName}`,
                currentPayload,
                {
                  headers: {
                    'apikey': evolution.evolutionKey,
                    'Content-Type': 'application/json',
                  },
                  timeout: 60000,
                  maxContentLength: Infinity,
                  maxBodyLength: Infinity,
                }
              );
            } catch (sendError: any) {
              // Se falhar com URL, tentar com base64 puro antes de propagar erro
              console.log(`🔄 [WebSocket] Falha ao enviar com URL. Tentando com base64... (Erro: ${sendError.message})`);

              // Só tentar base64 se temos base64 disponível
              if (base64File) {
                currentPayload.media = base64File;

                try {
                  console.log(`📤 [WebSocket] Tentando envio com base64 (tamanho: ${(base64File.length / 1024).toFixed(2)} KB)`);
                  return await axios.post(
                    `${evolution.evolutionUrl}/message/sendMedia/${instanceName}`,
                    currentPayload,
                    {
                      headers: {
                        'apikey': evolution.evolutionKey,
                        'Content-Type': 'application/json',
                      },
                      timeout: 90000, // Timeout maior para base64 (pode ser maior)
                      maxContentLength: Infinity,
                      maxBodyLength: Infinity,
                    }
                  );
                } catch (base64Error: any) {
                  console.error(`❌ [WebSocket] Falha também com base64. Erro: ${base64Error.message}`);
                  // Se base64 também falhar, propagar o erro para tentar realocação
                  throw new Error(`Falha ao enviar arquivo (URL e base64): ${sendError.message}. Tente novamente.`);
                }
              } else {
                // Se não temos base64 e URL falhou, propagar erro
                console.error(`❌ [WebSocket] Não temos base64 para fallback. Erro original: ${sendError.message}`);
                throw new Error(`Falha ao enviar arquivo via URL: ${sendError.message}. Arquivo não disponível em base64.`);
              }
            }
          };

          // Enviar documento com realocação automática
          apiResponse = await tryReallocateAndResend(sendDocumentFunction);
          console.log(`✅ [WebSocket] Documento enviado com sucesso!`);

          // Limpar arquivos temporários não é necessário aqui - os arquivos são gerenciados pelo MediaService
        } catch (mediaError: any) {
          // Log detalhado do erro
          console.error('❌ [WebSocket] Erro ao enviar documento:', {
            status: mediaError.response?.status,
            statusText: mediaError.response?.statusText,
            data: JSON.stringify(mediaError.response?.data, null, 2),
            message: mediaError.message,
            stack: mediaError.stack,
          });
          throw mediaError;
        }
      } else {
        // Mensagem de texto normal - usar realocação automática se necessário
        // isGroup já foi definido no início do try block (linha ~880)
        const targetNumber = isGroup
          ? data.contactPhone // Para grupos, usar o groupId completo (ex: 120363123456789012@g.us)
          : data.contactPhone.replace(/\D/g, ''); // Para contatos, limpar número

        apiResponse = await tryReallocateAndResend(async () => {
          console.log(`📤 [WebSocket] Enviando mensagem de texto para ${isGroup ? 'grupo' : 'contato'} ${targetNumber} via linha ${line.phone}`);

          return await axios.post(
            `${evolution.evolutionUrl}/message/sendText/${instanceName}`,
            {
              number: targetNumber,
              text: data.message,
              options: {
                delay: 1200,
                linkPreview: false
              }
            },
            {
              headers: { 'apikey': evolution.evolutionKey },
              timeout: 30000,
            }
          );
        });

        console.log(`✅ [WebSocket] Resposta da Evolution API:`, {
          status: apiResponse?.status,
          data: apiResponse?.data,
        });
      }

      // isGroup já foi definido no início do try block (linha ~880)
      // Buscar contato (para grupos, usar groupId como phone)
      let contact = await this.prisma.contact.findFirst({
        where: { phone: data.contactPhone },
      });

      // Se contato não existe, criar automaticamente buscando info da Evolution API
      if (!contact) {
        let contactName = data.contactPhone; // Fallback: usar telefone

        try {
          // Tentar buscar informações do contato na Evolution API
          if (isGroup) {
            // Para grupos, buscar metadados do grupo
            try {
              const groupMetadata = await axios.get(
                `${evolution.evolutionUrl}/group/fetchAllParticipants/${instanceName}`,
                {
                  params: { groupJid: data.contactPhone },
                  headers: { 'apikey': evolution.evolutionKey },
                  timeout: 5000,
                }
              );

              if (groupMetadata.data?.subject) {
                contactName = groupMetadata.data.subject;
              } else {
                contactName = `Grupo ${data.contactPhone}`;
              }
            } catch (groupError) {
              console.warn(`⚠️ [WebSocket] Não foi possível buscar nome do grupo: ${groupError.message}`);
              contactName = `Grupo ${data.contactPhone}`;
            }
          } else {
            // Para contatos individuais, buscar perfil do WhatsApp
            try {
              const profilePic = await axios.get(
                `${evolution.evolutionUrl}/chat/fetchProfile/${instanceName}`,
                {
                  params: { number: data.contactPhone.replace(/\D/g, '') },
                  headers: { 'apikey': evolution.evolutionKey },
                  timeout: 5000,
                }
              );

              // A API retorna { name: "Nome do Contato", ... }
              if (profilePic.data?.name) {
                contactName = profilePic.data.name;
              }
            } catch (profileError) {
              console.warn(`⚠️ [WebSocket] Não foi possível buscar perfil do contato: ${profileError.message}`);
            }
          }
        } catch (error) {
          console.warn(`⚠️ [WebSocket] Erro ao buscar informações do contato na Evolution: ${error.message}`);
        }

        // Criar contato no banco de dados
        contact = await this.prisma.contact.create({
          data: {
            name: contactName,
            phone: data.contactPhone,
            segment: user.segment,
            isNameManual: false,
          },
        });

        console.log(`✅ [WebSocket] Contato criado automaticamente: ${contact.name} (${data.contactPhone})`);
      }

      // Salvar conversa usando a linha ATUAL do operador
      // Isso garante que mesmo se a linha foi trocada, a mensagem vai pela linha atual
      const conversation = await this.conversationsService.create({
        contactName: contact.name, // Agora sempre terá um nome válido
        contactPhone: data.contactPhone,
        segment: user.segment,
        userName: user.name,
        userLine: currentLineId, // Sempre usar a linha atual
        userId: user.id, // Operador específico que está enviando
        message: data.message,
        sender: 'operator',
        messageType: data.messageType || 'text',
        mediaUrl: data.mediaUrl,
        isAdminTest: isAdminTest, // Marcar se é teste administrador
        isGroup: isGroup,
        groupId: isGroup ? data.contactPhone : undefined,
        groupName: isGroup ? (contact?.name || `Grupo ${data.contactPhone}`) : undefined,
      });

      // Criar/atualizar vínculo de 24 horas entre conversa e operador (apenas para contatos individuais, não grupos)
      if (currentLineId && !isGroup) {
        await this.createOrUpdateConversationBinding(data.contactPhone, currentLineId, user.id);
      }

      // Log apenas para mensagens enviadas com sucesso (fluxo principal)
      console.log(`✅ Mensagem enviada: ${user.name} → ${data.contactPhone}${isGroup ? ' (grupo)' : ''}`);
      console.log(`[OPERATOR_MSG_LOG] Email: ${user.email} | Line: ${line?.phone} | Segment: ${userSegmentName} | Status: SUCCESS`);

      // Registrar mensagem do operador para controle de repescagem (apenas para contatos individuais, não grupos)
      if (!isGroup) {
        await this.controlPanelService.registerOperatorMessage(
          data.contactPhone,
          user.id,
          user.segment
        );
      }

      // Registrar evento de mensagem enviada
      await this.systemEventsService.logEvent(
        EventType.MESSAGE_SENT,
        EventModule.WEBSOCKET,
        {
          userId: user.id,
          userName: user.name,
          contactPhone: data.contactPhone,
          messageType: data.messageType || 'text',
          lineId: currentLineId,
          linePhone: line?.phone,
        },
        user.id,
        EventSeverity.INFO,
      );

      // Emitir mensagem para o usuário que enviou
      console.log(`✅ [WebSocket] Emitindo message-sent para ${user.name} - ContactPhone: ${data.contactPhone}, IsGroup: ${isGroup}`);
      client.emit('message-sent', { message: conversation });

      // SINCRONIZAÇÃO: Emitir para TODOS os outros operadores da mesma linha (modo compartilhado)
      // Isso garante que quando X envia mensagem, Y também vê em tempo real
      if (currentLineId) {
        await this.emitToLineOperators(currentLineId, 'new_message', { message: conversation }, user.id);
      }

      // Se houver supervisores online do mesmo segmento, enviar para eles também
      this.emitToSupervisors(user.segment, 'new_message', { message: conversation });

      const endTime = Date.now();
      console.log(`⏱️ [WebSocket] handleSendMessage concluído em ${endTime - startTime}ms - User: ${user.name}, ContactPhone: ${data.contactPhone}`);

      // VERIFICAÇÃO PÓS-ENVIO: Checar saúde da linha para atualizar status (banido/conectado)
      if (currentLineId) {
        this.linesService.verifyLineHealth(currentLineId).catch(err => {
          console.error(`❌ [WebSocket] Erro ao verificar saúde da linha ${currentLineId} pós-envio:`, err);
        });
      }

      return { success: true, conversation };
    } catch (error: any) {
      console.error(`❌ [WebSocket] ERRO ao enviar mensagem - User: ${user.name}, ContactPhone: ${data.contactPhone}, IsGroup: ${data.contactPhone?.includes('@g.us')}`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: JSON.stringify(error.response?.data, null, 2),
        message: error.message,
        code: error.code,
        stack: error.stack,
      });

      console.log(`[OPERATOR_MSG_LOG] Email: ${user.email} | Line: ${line?.phone} | Segment: ${userSegmentName} | Status: ERROR | Reason: ${error.message} | Code: ${error.code}`);

      // Registrar evento de erro
      await this.systemEventsService.logEvent(
        error.code === 'ECONNABORTED' || error.message?.includes('timeout')
          ? EventType.TIMEOUT_ERROR
          : EventType.API_ERROR,
        EventModule.WEBSOCKET,
        {
          userId: user.id,
          userName: user.name,
          contactPhone: data.contactPhone,
          errorCode: error.code,
          errorMessage: error.message,
          status: error.response?.status,
        },
        user.id,
        EventSeverity.ERROR,
      );

      // Tentar recuperar automaticamente: realocar linha e tentar novamente
      const recoveryResult = await this.recoverAndRetryMessage(client, user, data, error);

      if (recoveryResult.success) {
        // Sucesso após recuperação - emitir confirmação para o operador
        client.emit('message-sent', { message: recoveryResult.conversation });
        return { success: true, conversation: recoveryResult.conversation };
      } else {
        // Falhou após todas as tentativas - notificar operador sobre o erro
        const errorMessage = recoveryResult.reason || 'Não foi possível enviar a mensagem. Tente novamente.';
        client.emit('message-error', { error: errorMessage });
        return { error: errorMessage };
      }
    }

  }


  /**
   * Tenta recuperar de erros e reenviar a mensagem automaticamente
   * Retorna sucesso se conseguiu enviar, ou falha após todas as tentativas
   */
  private async recoverAndRetryMessage(
    client: Socket,
    user: any,
    data: { contactPhone: string; message: string; messageType?: string; mediaUrl?: string; fileName?: string; isNewConversation?: boolean },
    originalError: any,
  ): Promise<{ success: boolean; conversation?: any; reason?: string }> {
    const maxRetries = 8; // Aumentado para 8 tentativas
    const triedLineIds: number[] = [];

    // Adicionar linha atual (que falhou) à lista de tentados
    if (user.line) {
      triedLineIds.push(user.line);
    }

    console.log(`🔄 [WebSocket] Iniciando recuperação de mensagem. Tentativas máximas: ${maxRetries}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [WebSocket] Tentativa de recuperação ${attempt}/${maxRetries}`);

        // 1. Realocar linha
        const currentLineId = user.line;
        const reallocationResult = await this.lineAssignmentService.reallocateLineForOperator(
          user.id,
          user.segment,
          currentLineId, // Linha a remover/desvincular
          triedLineIds   // Linhas a excluir da busca
        );

        if (!reallocationResult.success) {
          console.warn(`⚠️ [WebSocket] Falha ao realocar linha na tentativa ${attempt}:`, reallocationResult.reason);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          console.error(`❌ [WebSocket] Não foi possível realocar linha após todas as tentativas`);
          return { success: false, reason: 'Não foi possível encontrar uma nova linha disponível.' };
        }

        // 2. Atualizar user object com nova linha
        const newLineId = reallocationResult.lineId!;
        user.line = newLineId;
        triedLineIds.push(newLineId);

        // 3. Buscar dados da nova linha
        const newLine = await this.prisma.linesStock.findUnique({
          where: { id: newLineId },
        });

        if (!newLine || newLine.lineStatus !== 'active') {
          console.warn(`⚠️ [WebSocket] Nova linha ${newLineId} não está ativa. Tentando próxima...`);
          continue;
        }

        // 4. Buscar Evolution da nova linha
        const evolution = await this.prisma.evolution.findUnique({
          where: { evolutionName: newLine.evolutionName },
        });

        if (!evolution) {
          console.warn(`⚠️ [WebSocket] Evolution não encontrada para linha ${newLineId}. Tentando próxima...`);
          continue;
        }

        // 5. Tentar enviar mensagem (SEM health check prévio)
        const instanceName = `line_${newLine.phone.replace(/\D/g, '')}`;
        let apiResponse;

        console.log(`📤 [WebSocket] Tentando enviar pela linha ${newLine.phone} (Tentativa ${attempt})...`);

        try {
          if (data.messageType === 'image' && data.mediaUrl) {
            apiResponse = await axios.post(
              `${evolution.evolutionUrl}/message/sendMedia/${instanceName}`,
              {
                number: data.contactPhone.replace(/\D/g, ''),
                mediaUrl: data.mediaUrl,
                caption: data.message,
                mediatype: 'image',
              },
              {
                headers: { 'apikey': evolution.evolutionKey },
                timeout: 30000,
              }
            );
          } else if (data.messageType === 'document' && data.mediaUrl) {
            // Para documentos, usar sendMedia com base64
            const fileName = data.fileName || data.mediaUrl.split('/').pop() || 'document.pdf';
            let filePath: string;
            let tempPath: string | null = null;

            try {
              if (data.mediaUrl.startsWith('/media/')) {
                const filename = data.mediaUrl.replace('/media/', '');
                filePath = await this.mediaService.getFilePath(filename);
              } else if (data.mediaUrl.startsWith('http')) {
                const appUrl = process.env.APP_URL || 'https://api.newvend.taticamarketing.com.br';
                if (data.mediaUrl.startsWith(appUrl)) {
                  const urlPath = new URL(data.mediaUrl).pathname;
                  const filename = urlPath.replace('/media/', '');
                  filePath = await this.mediaService.getFilePath(filename);
                } else {
                  const response = await axios.get(data.mediaUrl, {
                    responseType: 'arraybuffer',
                    timeout: 30000,
                  });
                  tempPath = path.join('./uploads', `temp-${Date.now()}-${fileName}`);
                  await fs.mkdir('./uploads', { recursive: true });
                  await fs.writeFile(tempPath, response.data);
                  filePath = tempPath;
                }
              } else {
                const relativePath = data.mediaUrl.replace(/^\/media\//, '');
                filePath = path.join('./uploads', relativePath);
                await fs.access(filePath);
              }

              const fileBuffer = await fs.readFile(filePath);
              const base64File = fileBuffer.toString('base64');

              apiResponse = await axios.post(
                `${evolution.evolutionUrl}/message/sendMedia/${instanceName}`,
                {
                  number: data.contactPhone.replace(/\D/g, ''),
                  mediatype: 'document',
                  media: `data:application/pdf;base64,${base64File}`,
                  fileName: fileName,
                  caption: data.message,
                },
                {
                  headers: { 'apikey': evolution.evolutionKey },
                  timeout: 30000,
                }
              );
            } finally {
              if (tempPath) {
                await fs.unlink(tempPath).catch(() => { });
              }
            }
          } else if (data.messageType === 'audio' && data.mediaUrl) {
            apiResponse = await axios.post(
              `${evolution.evolutionUrl}/message/sendWhatsAppAudio/${instanceName}`,
              {
                number: data.contactPhone.replace(/\D/g, ''),
                audio: data.mediaUrl,
                speakerAudio: true,
              },
              {
                headers: { 'apikey': evolution.evolutionKey },
                timeout: 30000,
              }
            );
          } else {
            // Texto simples
            apiResponse = await axios.post(
              `${evolution.evolutionUrl}/message/sendText/${instanceName}`,
              {
                number: data.contactPhone.replace(/\D/g, ''),
                text: data.message || ' ',
                options: {
                  delay: 1200,
                  linkPreview: false
                }
              },
              {
                headers: { 'apikey': evolution.evolutionKey },
                timeout: 30000,
              }
            );
          }

          // SUCESSO!
          console.log(`✅ [WebSocket] Mensagem recuperada e enviada com sucesso na tentativa ${attempt}! Linha: ${newLine.phone}`);

          // Salvar conversa no banco
          const conversation = await this.prisma.conversation.create({
            data: {
              contactPhone: data.contactPhone,
              contactName: data.contactPhone,
              message: data.message,
              sender: 'operator',
              messageType: data.messageType || 'text',
              mediaUrl: data.mediaUrl,
              userName: user.name,
              userLine: newLineId,
              segment: user.segment,
            },
          });

          // Atualizar binding e registrar mensagem (apenas se não for grupo)
          if (!data.contactPhone.includes('@g.us')) {
            await this.createOrUpdateConversationBinding(data.contactPhone, newLineId, user.id);
            await this.controlPanelService.registerOperatorMessage(data.contactPhone, user.id, user.segment);
          }

          return { success: true, conversation };

        } catch (sendError: any) {
          // SE FALHOU O ENVIO, CHECK RIGOROSO
          console.warn(`❌ [WebSocket] Falha no envio pela linha ${newLine.phone} (Tentativa ${attempt}): ${sendError.message}`);

          try {
            const connectionState = await this.healthCheckCacheService.getConnectionStatus(
              evolution.evolutionUrl,
              evolution.evolutionKey,
              instanceName,
            );

            console.log(`🔍 [WebSocket] Check rigoroso da linha ${newLine.phone} após erro: ${connectionState}`);

            // AQUI podemos adicionar logs extras se a linha estiver desconectada
            if (connectionState !== 'open' && connectionState !== 'connected' && connectionState !== 'OPEN' && connectionState !== 'CONNECTED') {
              console.error(`❌ [WebSocket] Linha ${newLine.phone} confirmada como desconectada/problemática. Banindo...`);
              await this.linesService.handleBannedLine(newLineId);
              console.log(`✅ [WebSocket] Linha ${newLine.phone} marcada como banida no banco.`);
            }
          } catch (healthError) {
            console.error(`❌ [WebSocket] Erro ao verificar status da linha ${newLine.phone}:`, healthError);
          }

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

      } catch (loopError: any) {
        console.error(`❌ [WebSocket] Erro inesperado no loop de recuperação (Tentativa ${attempt}):`, loopError);
      }
    }

    return { success: false, reason: `Falha ao enviar mensagem após ${maxRetries} tentativas em linhas diferentes.` };
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { contactPhone: string; typing: boolean },
  ) {
    // Emitir evento de digitação para outros usuários
    client.broadcast.emit('user-typing', {
      contactPhone: data.contactPhone,
      typing: data.typing,
    });
  }

  // Método auxiliar para criar/atualizar vínculo de conversa com operador (24 horas)
  private async createOrUpdateConversationBinding(contactPhone: string, lineId: number, userId: number) {
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Expira em 24 horas

      await (this.prisma as any).conversationOperatorBinding.upsert({
        where: {
          contactPhone_lineId: {
            contactPhone,
            lineId,
          },
        },
        update: {
          userId,
          expiresAt,
          updatedAt: new Date(),
        },
        create: {
          contactPhone,
          lineId,
          userId,
          expiresAt,
        },
      });

      console.log(`🔗 [WebSocket] Vínculo criado/atualizado: contactPhone=${contactPhone}, lineId=${lineId}, userId=${userId}, expiresAt=${expiresAt.toISOString()}`);
    } catch (error: any) {
      console.error(`❌ [WebSocket] Erro ao criar/atualizar vínculo:`, error.message);
      // Não lançar erro - vínculo é importante mas não deve quebrar o fluxo
    }
  }


  private async findAvailableLineForOperator(availableLines: any[], userId: number, userSegment: number | null) {
    for (const line of availableLines) {
      // IMPORTANTE: Verificar se a linha pertence ao mesmo segmento do operador
      // Se a linha tem segmento diferente e não é padrão (null), pular
      if (line.segment !== null && line.segment !== userSegment) {
        continue;
      }

      const operatorsCount = await (this.prisma as any).lineOperator.count({
        where: { lineId: line.id },
      });

      if (operatorsCount < 2) {
        // Verificar se o operador já está vinculado a esta linha
        const existing = await (this.prisma as any).lineOperator.findUnique({
          where: {
            lineId_userId: {
              lineId: line.id,
              userId,
            },
          },
        });

        if (!existing) {
          // Verificar se a linha já tem operadores de outro segmento
          const existingOperators = await (this.prisma as any).lineOperator.findMany({
            where: { lineId: line.id },
            include: { user: true },
          });

          // Se a linha já tem operadores, verificar se são do mesmo segmento
          if (existingOperators.length > 0) {
            const allSameSegment = existingOperators.every((lo: any) =>
              lo.user.segment === userSegment
            );

            if (!allSameSegment) {
              // Linha já tem operador de outro segmento, não pode atribuir
              continue;
            }
          }

          return line;
        }
      }
    }
    return null;
  }

  // Método para realocar linha quando houver problemas (timeout, etc)
  private async reallocateLineForOperator(userId: number, userSegment: number | null): Promise<{
    success: boolean;
    oldLinePhone?: string;
    newLinePhone?: string;
    newLineId?: number;
    reason?: string;
  }> {
    try {
      // Buscar operador atual
      const operator = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!operator || operator.role !== 'operator') {
        return { success: false, reason: 'Operador não encontrado' };
      }

      // Buscar linha atual
      let currentLineId = operator.line;
      if (!currentLineId) {
        // Tentar buscar na tabela LineOperator
        const lineOperator = await (this.prisma as any).lineOperator.findFirst({
          where: { userId },
        });
        currentLineId = lineOperator?.lineId || null;
      }

      let oldLinePhone = null;
      if (currentLineId) {
        const oldLine = await this.prisma.linesStock.findUnique({
          where: { id: currentLineId },
        });
        oldLinePhone = oldLine?.phone || null;

        // Remover operador da linha antiga
        await (this.prisma as any).lineOperator.deleteMany({
          where: { userId, lineId: currentLineId },
        });
      }

      // Buscar nova linha disponível
      let availableLine = null;

      // Buscar segmento "Padrão" uma única vez
      const defaultSegment = await this.prisma.segment.findUnique({
        where: { name: 'Padrão' },
      });

      // PRIORIDADE 1: Linha do segmento do operador SEM operadores
      if (userSegment && !availableLine) {
        const segmentLines = await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
            segment: userSegment,
          },
        });

        const filteredLines = await this.controlPanelService.filterLinesByActiveEvolutions(segmentLines, userSegment);

        for (const line of filteredLines) {
          const operatorsCount = await (this.prisma as any).lineOperator.count({
            where: { lineId: line.id },
          });

          if (operatorsCount === 0) {
            availableLine = line;
            console.log(`📌 [Realocação] [PRIORIDADE 1] Linha do segmento ${userSegment} sem operadores encontrada: ${line.phone}`);
            break;
          }
        }
      }

      // PRIORIDADE 2: Linha do segmento "Padrão" SEM operadores
      if (!availableLine && defaultSegment) {
        const defaultLines = await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
            segment: defaultSegment.id,
          },
        });

        const filteredDefaultLines = await this.controlPanelService.filterLinesByActiveEvolutions(defaultLines, userSegment);

        for (const line of filteredDefaultLines) {
          const operatorsCount = await (this.prisma as any).lineOperator.count({
            where: { lineId: line.id },
          });

          if (operatorsCount === 0) {
            availableLine = line;
            console.log(`📌 [Realocação] [PRIORIDADE 2] Linha do segmento Padrão sem operadores encontrada: ${line.phone}`);
            break;
          }
        }
      }

      // PRIORIDADE 3: Linha do segmento do operador COM 1 operador (dividir)
      if (userSegment && !availableLine) {
        const segmentLines = await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
            segment: userSegment,
          },
        });

        const filteredLines = await this.controlPanelService.filterLinesByActiveEvolutions(segmentLines, userSegment);

        for (const line of filteredLines) {
          const existingOperators = await (this.prisma as any).lineOperator.findMany({
            where: { lineId: line.id },
            include: { user: true },
          });

          if (existingOperators.length === 1) {
            // Verificar se o operador existente é do mesmo segmento
            if (existingOperators[0].user.segment === userSegment) {
              availableLine = line;
              console.log(`📌 [Realocação] [PRIORIDADE 3] Linha do segmento ${userSegment} com 1 operador encontrada (dividir): ${line.phone}`);
              break;
            }
          }
        }
      }

      // PRIORIDADE 4: Linha do segmento "Padrão" COM 1 operador (dividir)
      if (!availableLine && defaultSegment) {
        const defaultLines = await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
            segment: defaultSegment.id,
          },
        });

        const filteredDefaultLines = await this.controlPanelService.filterLinesByActiveEvolutions(defaultLines, userSegment);

        for (const line of filteredDefaultLines) {
          const existingOperators = await (this.prisma as any).lineOperator.findMany({
            where: { lineId: line.id },
            include: { user: true },
          });

          if (existingOperators.length === 1) {
            // Verificar se o operador existente é do mesmo segmento (ou aceitar qualquer segmento para linhas padrão)
            const sameSegment = existingOperators[0].user.segment === userSegment;
            if (sameSegment || userSegment === null || existingOperators[0].user.segment === null) {
              availableLine = line;
              console.log(`📌 [Realocação] [PRIORIDADE 4] Linha do segmento Padrão com 1 operador encontrada (dividir): ${line.phone}`);
              break;
            }
          }
        }
      }

      // PRIORIDADE 5: APENAS se não houver linhas do segmento "Padrão" disponíveis, buscar outras linhas para dividir
      if (!availableLine) {
        console.log(`🔄 [Realocação] [PRIORIDADE 5] Nenhuma linha do segmento Padrão disponível. Buscando outras linhas para dividir...`);

        const anyActiveLines = await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
          },
        });

        const filteredAnyLines = await this.controlPanelService.filterLinesByActiveEvolutions(anyActiveLines, userSegment || undefined);

        for (const line of filteredAnyLines) {
          // Pular se for linha do segmento do operador ou do segmento "Padrão" (já tentamos acima)
          if (line.segment === userSegment || (defaultSegment && line.segment === defaultSegment.id)) {
            continue;
          }

          const existingOperators = await (this.prisma as any).lineOperator.findMany({
            where: { lineId: line.id },
            include: { user: true },
          });

          if (existingOperators.length === 1) {
            // Verificar se o operador existente é do mesmo segmento
            if (existingOperators[0].user.segment === userSegment) {
              availableLine = line;
              console.log(`📌 [Realocação] [PRIORIDADE 5] Linha de outro segmento com 1 operador do mesmo segmento encontrada (dividir): ${line.phone}`);
              break;
            }
          }
        }
      }

      if (!availableLine) {
        const totalActiveLines = await this.prisma.linesStock.count({ where: { lineStatus: 'active' } });
        const linesWithoutOperators = await this.prisma.linesStock.count({
          where: {
            lineStatus: 'active',
            operators: { none: {} },
          },
        });
        console.error(`❌ [WebSocket] Realocação: Nenhuma linha disponível. Total ativas: ${totalActiveLines}, Sem operadores: ${linesWithoutOperators}`);
        return { success: false, reason: 'Nenhuma linha disponível' };
      }

      // Verificar quantos operadores já estão vinculados
      const currentOperatorsCount = await (this.prisma as any).lineOperator.count({
        where: { lineId: availableLine.id },
      });

      // Vincular operador à nova linha usando método com transaction + lock
      try {
        await this.linesService.assignOperatorToLine(availableLine.id, userId); // ✅ COM LOCK


        // Registrar evento de realocação
        await this.systemEventsService.logEvent(
          EventType.LINE_REALLOCATED,
          EventModule.WEBSOCKET,
          {
            userId: userId,
            userName: operator.name,
            oldLinePhone: oldLinePhone || null,
            newLinePhone: availableLine.phone,
            newLineId: availableLine.id,
          },
          userId,
          EventSeverity.WARNING,
        );

        return {
          success: true,
          oldLinePhone: oldLinePhone || undefined,
          newLinePhone: availableLine.phone,
          newLineId: availableLine.id,
        };
      } catch (error: any) {
        console.error(`❌ [WebSocket] Erro ao vincular nova linha:`, error.message);
        return { success: false, reason: error.message };
      }
    } catch (error: any) {
      console.error('❌ [WebSocket] Erro ao realocar linha:', error);
      return { success: false, reason: error.message || 'Erro desconhecido' };
    }
  }

  // Método para emitir mensagens recebidas via webhook
  async emitNewMessage(conversation: any) {
    console.log(`📤 Emitindo new_message para contactPhone: ${conversation.contactPhone}`, {
      userId: conversation.userId,
      userLine: conversation.userLine,
    });

    // Verificar se o modo compartilhado está ativo
    const controlPanel = await this.controlPanelService.findOne();
    const sharedLineMode = controlPanel?.sharedLineMode ?? false;

    // Emitir para o operador específico que está atendendo (userId)
    if (conversation.userId) {
      const socketId = this.connectedUsers.get(conversation.userId);
      if (socketId) {
        const user = await this.prisma.user.findUnique({
          where: { id: conversation.userId },
        });
        if (user) {
          console.log(`  → Enviando para ${user.name} (${user.role}) - operador específico (userId: ${conversation.userId})`);
          // Usar underscore para corresponder ao frontend: new_message
          this.server.to(socketId).emit('new_message', { message: conversation });
        } else {
          console.warn(`  ⚠️ Operador ${conversation.userId} não encontrado no banco`);
        }
      } else {
        console.warn(`  ⚠️ Operador ${conversation.userId} não está conectado via WebSocket`);
      }
    }

    // No modo compartilhado, SEMPRE enviar para todos os usuários da linha (não apenas se userId não estiver conectado)
    // Fora do modo compartilhado, enviar apenas se userId não estiver conectado
    const shouldEmitToAllLineUsers = sharedLineMode || !conversation.userId || !this.connectedUsers.has(conversation.userId);

    if (shouldEmitToAllLineUsers && conversation.userLine) {
      console.log(`  → ${sharedLineMode ? 'Modo compartilhado: ' : 'Fallback: '}Enviando para todos os usuários online da linha ${conversation.userLine}`);
      const lineOperators = await (this.prisma as any).lineOperator.findMany({
        where: { lineId: conversation.userLine },
        include: { user: true },
      });

      // No modo compartilhado, incluir todos os usuários (admins, operadores, etc)
      // Fora do modo compartilhado, apenas operadores
      const onlineLineOperators = lineOperators.filter(lo => {
        if (sharedLineMode) {
          // Modo compartilhado: incluir todos os usuários online (admins, operadores, supervisores)
          return lo.user.status === 'Online' &&
            (lo.user.role === 'operator' || lo.user.role === 'admin' || lo.user.role === 'supervisor');
        } else {
          // Modo normal: apenas operadores
          return lo.user.status === 'Online' && lo.user.role === 'operator';
        }
      });

      console.log(`  → Encontrados ${onlineLineOperators.length} usuário(s) online na linha ${conversation.userLine}`);

      onlineLineOperators.forEach(lo => {
        // No modo compartilhado, enviar para todos (mesmo que já tenha enviado para userId)
        // Fora do modo compartilhado, não enviar duplicado se já enviou para userId
        if (sharedLineMode || lo.userId !== conversation.userId) {
          const socketId = this.connectedUsers.get(lo.userId);
          if (socketId) {
            console.log(`  → Enviando para ${lo.user.name} (${lo.user.role}) - usuário da linha`);
            this.server.to(socketId).emit('new_message', { message: conversation });
          } else {
            console.warn(`  ⚠️ Usuário ${lo.user.name} (${lo.userId}) não está conectado via WebSocket`);
          }
        }
      });

      // Se não encontrou nenhum usuário online na linha, logar para debug
      if (onlineLineOperators.length === 0) {
        console.warn(`  ⚠️ Nenhum usuário online encontrado na linha ${conversation.userLine} para receber a mensagem`);
        console.log(`  → Usuários vinculados à linha:`, lineOperators.map(lo => ({
          userId: lo.userId,
          name: lo.user.name,
          status: lo.user.status,
          role: lo.user.role,
          connected: this.connectedUsers.has(lo.userId),
        })));
      }
    } else if (!conversation.userLine) {
      console.warn(`  ⚠️ Conversa sem userId e sem userLine - não é possível enviar`);
    }

    // Emitir para supervisores do segmento
    if (conversation.segment) {
      this.emitToSupervisors(conversation.segment, 'new_message', { message: conversation });
    }
  }

  emitToUser(userId: number, event: string, data: any) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      const client = this.server.sockets.sockets.get(socketId);
      if (client) {
        client.emit(event, data);
      }
    }
  }

  /**
   * Emite evento para TODOS os operadores da mesma linha (modo compartilhado)
   * Usado para sincronizar mensagens enviadas entre operadores que compartilham a mesma linha
   */
  private async emitToLineOperators(lineId: number, event: string, data: any, excludeUserId?: number) {
    try {
      // Buscar todos os operadores vinculados à linha
      const lineOperators = await (this.prisma as any).lineOperator.findMany({
        where: { lineId },
        include: { user: true },
      });

      console.log(`📢 [WebSocket] Emitindo '${event}' para ${lineOperators.length} operador(es) da linha ${lineId}`);

      // Emitir para cada operador online (exceto quem enviou, se especificado)
      for (const lo of lineOperators) {
        if (excludeUserId && lo.userId === excludeUserId) {
          continue; // Pular o operador que enviou (já recebeu message-sent)
        }

        if (lo.user.status === 'Online') {
          const socketId = this.connectedUsers.get(lo.userId);
          if (socketId) {
            console.log(`  → Emitindo para ${lo.user.name} (userId: ${lo.userId})`);
            this.server.to(socketId).emit(event, data);
          }
        }
      }
    } catch (error: any) {
      console.error(`❌ [WebSocket] Erro ao emitir para operadores da linha ${lineId}:`, error.message);
    }
  }

  private async emitToSupervisors(segment: number, event: string, data: any) {
    const supervisors = await this.prisma.user.findMany({
      where: {
        role: 'supervisor',
        segment,
      },
    });

    supervisors.forEach(supervisor => {
      const socketId = this.connectedUsers.get(supervisor.id);
      if (socketId) {
        this.server.to(socketId).emit(event, data);
      }
    });
  }

  // Emitir atualização de conversa tabulada
  async emitConversationTabulated(contactPhone: string, tabulationId: number) {
    this.server.emit('conversation-tabulated', { contactPhone, tabulationId });
  }

  /**
   * Método público para enviar mensagem via Evolution API
   * Usado por serviços externos (ex: AutoMessageService)
   */
  async sendMessageToEvolution(
    evolutionUrl: string,
    evolutionKey: string,
    instanceName: string,
    contactPhone: string,
    message: string,
    messageType: string = 'text',
  ): Promise<void> {
    try {
      if (messageType === 'text') {
        await axios.post(
          `${evolutionUrl}/message/sendText/${instanceName}`,
          {
            number: contactPhone.replace(/\D/g, ''),
            text: message,
          },
          {
            headers: { 'apikey': evolutionKey },
            timeout: 30000, // 30 segundos
          }
        );
      } else {
        // Para outros tipos de mensagem, usar o método completo do handleSendMessage
        throw new Error('Tipo de mensagem não suportado neste método. Use handleSendMessage para mídia.');
      }
    } catch (error: any) {
      console.error(`❌ [WebSocket] Erro ao enviar mensagem via Evolution API:`, error.message);
      throw error;
    }
  }
}
