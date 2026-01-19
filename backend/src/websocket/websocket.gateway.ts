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
        if (!user.line && user.role === 'operator') {
          // Usar LineAssignmentService centralizado que já tem a lógica de priorização correta
          const assignmentResult = await this.lineAssignmentService.findAvailableLineForOperator(user.id, user.segment);

          let availableLine = null;
          if (assignmentResult.success && assignmentResult.lineId) {
            availableLine = await this.prisma.linesStock.findUnique({ where: { id: assignmentResult.lineId } });
          }

          if (availableLine) {
            // Verificar quantos operadores já estão vinculados
            const currentOperatorsCount = await (this.prisma as any).lineOperator.count({
              where: { lineId: availableLine.id },
            });

            if (currentOperatorsCount < 2) {
              // IMPORTANTE: Verificar se a linha já tem operadores de outro segmento
              const existingOperators = await (this.prisma as any).lineOperator.findMany({
                where: { lineId: availableLine.id },
                include: { user: true },
              });

              // Se a linha já tem operadores, verificar se são do mesmo segmento
              if (existingOperators.length > 0) {
                const allSameSegment = existingOperators.every((lo: any) =>
                  lo.user.segment === user.segment
                );

                if (!allSameSegment) {
                  // Linha já tem operador de outro segmento, não pode atribuir
                  availableLine = null; // Forçar busca de outra linha
                }
              }

              // Só vincular se passou na validação de segmento
              if (availableLine) {
                // Vincular operador à linha usando método com transaction + lock
                try {
                  await this.linesService.assignOperatorToLine(availableLine.id, user.id);

                  // Verificar se a linha está ativa na Evolution ANTES de confirmar vinculação
                  const evolution = await this.prisma.evolution.findUnique({
                    where: { evolutionName: availableLine.evolutionName },
                  });

                  if (evolution) {
                    const instanceName = `line_${availableLine.phone.replace(/\D/g, '')}`;
                    const lineStatus = await this.healthCheckCacheService.getConnectionStatus(
                      evolution.evolutionUrl,
                      evolution.evolutionKey,
                      instanceName
                    );

                    if (!lineStatus || lineStatus === 'ban' || lineStatus === 'disconnected' || lineStatus.toLowerCase() === 'ban' || lineStatus.toLowerCase() === 'disconnected') {
                      console.warn(`⚠️ [WebSocket] Linha ${availableLine.phone} está ${lineStatus || 'desconectada'} na Evolution. Realocando...`);

                      // Desvincular a linha banida
                      await this.linesService.unassignOperatorFromLine(availableLine.id, user.id);

                      // Realocar nova linha
                      const reallocationResult = await this.lineAssignmentService.reallocateLineForOperator(
                        user.id,
                        user.segment || null
                      );

                      if (reallocationResult.success && reallocationResult.lineId) {
                        const newLine = await this.prisma.linesStock.findUnique({
                          where: { id: reallocationResult.lineId },
                        });
                        if (newLine) {
                          user.line = newLine.id;
                          availableLine = newLine;
                          console.log(`✅ [WebSocket] Linha ${newLine.phone} realocada para operador ${user.name} após detectar linha banida`);
                        } else {
                          availableLine = null;
                          user.line = null;
                        }
                      } else {
                        console.error(`❌ [WebSocket] Não foi possível realocar linha para operador ${user.name}: ${reallocationResult.reason}`);
                        availableLine = null;
                        user.line = null;
                      }
                    } else {
                      // Linha está ativa, confirmar vinculação
                      user.line = availableLine.id;
                      console.log(`✅ [WebSocket] Linha ${availableLine.phone} vinculada e verificada como ativa para operador ${user.name}`);
                    }
                  } else {
                    // Evolution não encontrada, assumir que linha está ativa e continuar
                    user.line = availableLine.id;
                    console.log(`⚠️ [WebSocket] Evolution não encontrada para linha ${availableLine.phone}, assumindo ativa`);
                  }
                } catch (error) {
                  console.error(`❌ [WebSocket] Erro ao vincular linha ${availableLine.id} ao operador ${user.id}:`, error.message);
                  // Continuar para tentar outra linha
                  availableLine = null;
                }
              }
            }
          }

          // Se ainda não tem linha, tentar busca mais ampla (linhas do segmento "Padrão")
          if (!availableLine || !user.line) {
            // Buscar o segmento "Padrão" pelo nome (criado na seed)
            const defaultSegment = await this.prisma.segment.findUnique({
              where: { name: 'Padrão' },
            });

            if (defaultSegment) {
              // Buscar linhas ativas do segmento "Padrão"
              const anyActiveLines = await this.prisma.linesStock.findMany({
                where: {
                  lineStatus: 'active',
                  segment: defaultSegment.id, // Segmento "Padrão" pelo ID
                },
              });

              if (anyActiveLines.length === 0) {
                console.warn(`⚠️ [WebSocket] Não existem linhas do segmento "Padrão" disponíveis para o operador ${user.name} (ID: ${user.id})`);
              }

              // Filtrar por evolutions ativas
              const filteredAnyLines = await this.controlPanelService.filterLinesByActiveEvolutions(anyActiveLines, user.segment);
              const fallbackLine = await this.findAvailableLineForOperator(filteredAnyLines, user.id, user.segment);

              if (!fallbackLine && anyActiveLines.length > 0) {
                console.warn(`⚠️ [WebSocket] Linhas do segmento "Padrão" existem, mas nenhuma está disponível (todas já têm 2 operadores ou evoluções inativas) para o operador ${user.name} (ID: ${user.id})`);
              }

              if (fallbackLine) {
                const currentOperatorsCount = await (this.prisma as any).lineOperator.count({
                  where: { lineId: fallbackLine.id },
                });

                // Linha do segmento "Padrão" pode ter até 2 operadores
                // Aceita qualquer operador (é linha padrão/compartilhada)
                if (currentOperatorsCount < 2) {
                  // Vincular operador à linha usando método com transaction + lock
                  try {
                    await this.linesService.assignOperatorToLine(fallbackLine.id, user.id);

                    // Verificar se a linha está ativa na Evolution ANTES de confirmar vinculação
                    const evolution = await this.prisma.evolution.findUnique({
                      where: { evolutionName: fallbackLine.evolutionName },
                    });

                    if (evolution) {
                      const instanceName = `line_${fallbackLine.phone.replace(/\D/g, '')}`;
                      const lineStatus = await this.healthCheckCacheService.getConnectionStatus(
                        evolution.evolutionUrl,
                        evolution.evolutionKey,
                        instanceName
                      );

                      if (!lineStatus || lineStatus === 'ban' || lineStatus === 'disconnected' || lineStatus.toLowerCase() === 'ban' || lineStatus.toLowerCase() === 'disconnected') {
                        console.warn(`⚠️ [WebSocket] Linha padrão ${fallbackLine.phone} está ${lineStatus || 'desconectada'} na Evolution. Realocando...`);

                        // Desvincular a linha banida
                        await this.linesService.unassignOperatorFromLine(fallbackLine.id, user.id);

                        // Realocar nova linha e marcar linha antiga como banida
                        const reallocationResult = await this.lineAssignmentService.reallocateLineForOperator(
                          user.id,
                          user.segment || null,
                          fallbackLine.id, // oldLineId - linha banida
                          undefined, // traceId
                          true // markAsBanned = true - marca linha como banida
                        );

                        if (reallocationResult.success && reallocationResult.lineId) {
                          const newLine = await this.prisma.linesStock.findUnique({
                            where: { id: reallocationResult.lineId },
                          });
                          if (newLine) {
                            user.line = newLine.id;
                            console.log(`✅ [WebSocket] Linha ${newLine.phone} realocada para operador ${user.name} após detectar linha banida (fallback)`);
                          } else {
                            user.line = null;
                          }
                        } else {
                          console.error(`❌ [WebSocket] Não foi possível realocar linha para operador ${user.name}: ${reallocationResult.reason}`);
                          user.line = null;
                        }
                      } else {
                        // Linha está ativa, confirmar vinculação
                        // Atualizar segmento da linha se operador tem segmento
                        // Isso faz a linha deixar de ser "Padrão" e passa a ser do segmento do operador
                        if (user.segment && fallbackLine.segment === defaultSegment.id) {
                          await this.prisma.linesStock.update({
                            where: { id: fallbackLine.id },
                            data: { segment: user.segment },
                          });
                          console.log(`🔄 [WebSocket] Segmento da linha ${fallbackLine.phone} atualizado de "Padrão" para segmento do operador ${user.name}`);
                        }

                        user.line = fallbackLine.id;
                        console.log(`✅ [WebSocket] Linha padrão ${fallbackLine.phone} vinculada e verificada como ativa para operador ${user.name}`);
                      }
                    } else {
                      // Evolution não encontrada, assumir que linha está ativa e continuar
                      user.line = fallbackLine.id;
                      console.log(`⚠️ [WebSocket] Evolution não encontrada para linha padrão ${fallbackLine.phone}, assumindo ativa`);
                    }
                  } catch (error) {
                    console.error(`❌ [WebSocket] Erro ao vincular linha ${fallbackLine.id} ao operador ${user.id}:`, error.message);
                    // Continuar para tentar outra linha
                  }
                }
              }
            }

            // Verificar se ainda não tem linha após todas as tentativas
            if (!user.line) {
              console.error(`❌ [WebSocket] Nenhuma linha disponível para o operador ${user.name} após todas as tentativas`);

              // Adicionar operador à fila de espera
              await this.queueService.addToQueue(user.id, user.segment || null, 0);
              console.log(`📋 [WebSocket] Operador ${user.name} adicionado à fila de espera`);

              // Processar fila IMEDIATAMENTE para tentar alocar linha (otimização de velocidade)
              setImmediate(async () => {
                try {
                  await this.queueService.processQueue();
                  console.log(`⚡ [WebSocket] Fila processada imediatamente para operador ${user.name}`);
                } catch (error) {
                  console.error(`❌ [WebSocket] Erro ao processar fila imediata:`, error.message);
                }
              });
            }
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
                undefined, // traceId
                true // markAsBanned = true - marca linha como banida
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

    // Se operador não tem linha, tentar atribuir automaticamente
    if (!currentLineId) {

      let availableLine = null;

      // Buscar segmento "Padrão" uma única vez
      const defaultSegment = await this.prisma.segment.findUnique({
        where: { name: 'Padrão' },
      });

      // PRIORIDADE 1: Linha do segmento do operador SEM operadores
      if (user.segment && !availableLine) {
        const segmentLines = await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
            segment: user.segment,
          },
        });

        const filteredLines = await this.controlPanelService.filterLinesByActiveEvolutions(segmentLines, user.segment);

        for (const line of filteredLines) {
          const operatorsCount = await (this.prisma as any).lineOperator.count({
            where: { lineId: line.id },
          });

          if (operatorsCount === 0) {
            availableLine = line;
            console.log(`📌 [WebSocket] [PRIORIDADE 1] Linha do segmento ${user.segment} sem operadores encontrada: ${line.phone}`);
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

        const filteredDefaultLines = await this.controlPanelService.filterLinesByActiveEvolutions(defaultLines, user.segment);

        for (const line of filteredDefaultLines) {
          const operatorsCount = await (this.prisma as any).lineOperator.count({
            where: { lineId: line.id },
          });

          if (operatorsCount === 0) {
            availableLine = line;
            console.log(`📌 [WebSocket] [PRIORIDADE 2] Linha do segmento Padrão sem operadores encontrada: ${line.phone}`);
            break;
          }
        }
      }

      // PRIORIDADE 3: Linha do segmento do operador COM 1 operador (dividir)
      if (user.segment && !availableLine) {
        const segmentLines = await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
            segment: user.segment,
          },
        });

        const filteredLines = await this.controlPanelService.filterLinesByActiveEvolutions(segmentLines, user.segment);

        for (const line of filteredLines) {
          const existingOperators = await (this.prisma as any).lineOperator.findMany({
            where: { lineId: line.id },
            include: { user: true },
          });

          if (existingOperators.length === 1) {
            // Verificar se o operador existente é do mesmo segmento
            if (existingOperators[0].user.segment === user.segment) {
              availableLine = line;
              console.log(`📌 [WebSocket] [PRIORIDADE 3] Linha do segmento ${user.segment} com 1 operador encontrada (dividir): ${line.phone}`);
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

        const filteredDefaultLines = await this.controlPanelService.filterLinesByActiveEvolutions(defaultLines, user.segment);

        for (const line of filteredDefaultLines) {
          const existingOperators = await (this.prisma as any).lineOperator.findMany({
            where: { lineId: line.id },
            include: { user: true },
          });

          if (existingOperators.length === 1) {
            // Verificar se o operador existente é do mesmo segmento (ou aceitar qualquer segmento para linhas padrão)
            const sameSegment = existingOperators[0].user.segment === user.segment;
            if (sameSegment || user.segment === null || existingOperators[0].user.segment === null) {
              availableLine = line;
              console.log(`📌 [WebSocket] [PRIORIDADE 4] Linha do segmento Padrão com 1 operador encontrada (dividir): ${line.phone}`);
              break;
            }
          }
        }
      }

      // PRIORIDADE 5: APENAS se não houver linhas do segmento "Padrão" disponíveis, buscar outras linhas para dividir
      if (!availableLine) {
        console.log(`🔄 [WebSocket] [PRIORIDADE 5] Nenhuma linha do segmento Padrão disponível. Buscando outras linhas para dividir...`);

        const anyActiveLines = await this.prisma.linesStock.findMany({
          where: {
            lineStatus: 'active',
          },
        });

        const filteredAnyLines = await this.controlPanelService.filterLinesByActiveEvolutions(anyActiveLines, user.segment);

        for (const line of filteredAnyLines) {
          // Pular se for linha do segmento do operador ou do segmento "Padrão" (já tentamos acima)
          if (line.segment === user.segment || (defaultSegment && line.segment === defaultSegment.id)) {
            continue;
          }

          const existingOperators = await (this.prisma as any).lineOperator.findMany({
            where: { lineId: line.id },
            include: { user: true },
          });

          if (existingOperators.length === 1) {
            // Verificar se o operador existente é do mesmo segmento
            if (existingOperators[0].user.segment === user.segment) {
              availableLine = line;
              console.log(`📌 [WebSocket] [PRIORIDADE 5] Linha de outro segmento com 1 operador do mesmo segmento encontrada (dividir): ${line.phone}`);
              break;
            }
          }
        }
      }

      // Tentar vincular a linha encontrada
      if (availableLine) {
        try {
          await this.linesService.assignOperatorToLine(availableLine.id, user.id);

          // Atualizar segmento da linha se for do segmento "Padrão" e operador tem segmento
          if (defaultSegment && availableLine.segment === defaultSegment.id && user.segment) {
            await this.prisma.linesStock.update({
              where: { id: availableLine.id },
              data: { segment: user.segment },
            });
          }

          user.line = availableLine.id;
          currentLineId = availableLine.id;

          console.log(`✅ [WebSocket] Linha ${availableLine.phone} atribuída ao operador ${user.name} (segmento ${availableLine.segment || 'sem segmento'})`);
        } catch (error: any) {
          console.error(`❌ [WebSocket] Erro ao vincular linha ${availableLine.id} ao operador ${user.id}:`, error.message);
          availableLine = null;
        }
      }

      // 4. ÚLTIMA TENTATIVA: Se ainda não tem linha, buscar linhas do segmento "Padrão" SEM filtrar por evolutions
      // Isso garante que se há linhas padrão cadastradas, sempre encontra uma
      if (!currentLineId) {
        console.log(`🔄 [WebSocket] Última tentativa: buscando linhas do segmento "Padrão" sem filtro de evolutions...`);

        const defaultSegment = await this.prisma.segment.findUnique({
          where: { name: 'Padrão' },
        });

        if (defaultSegment) {
          const defaultLines = await this.prisma.linesStock.findMany({
            where: {
              lineStatus: 'active',
              segment: defaultSegment.id, // Segmento "Padrão" pelo ID
            },
          });

          // Buscar QUALQUER linha padrão com menos de 2 operadores (SEM filtrar por evolutions)
          for (const line of defaultLines) {
            const currentOperatorsCount = await (this.prisma as any).lineOperator.count({
              where: { lineId: line.id },
            });

            if (currentOperatorsCount < 2) {
              try {
                await this.linesService.assignOperatorToLine(line.id, user.id);

                // Atualizar segmento da linha se operador tem segmento
                if (user.segment) {
                  await this.prisma.linesStock.update({
                    where: { id: line.id },
                    data: { segment: user.segment },
                  });
                }

                user.line = line.id;
                currentLineId = line.id;

                console.log(`✅ [WebSocket] Linha padrão ${line.phone} atribuída ao operador ${user.name} (última tentativa)`);
                break;
              } catch (error: any) {
                if (error.message?.includes('já está vinculado')) {
                  user.line = line.id;
                  currentLineId = line.id;
                  break;
                }
              }
            }
          }
        }
      }

      // Se DEPOIS DE TODAS AS TENTATIVAS ainda não tem linha, fazer log mas NÃO retornar erro
      // Em vez disso, tentar continuar (mesmo que possa falhar depois)
      if (!currentLineId) {
        const defaultSegment = await this.prisma.segment.findUnique({
          where: { name: 'Padrão' },
        });
        const defaultSegmentId = defaultSegment?.id || null;

        console.error(`❌ [WebSocket] CRÍTICO: Nenhuma linha disponível após todas as tentativas para operador ${user.name} (ID: ${user.id})`);
        console.error(`❌ [WebSocket] Total de linhas ativas no banco: ${await this.prisma.linesStock.count({ where: { lineStatus: 'active' } })}`);
        console.error(`❌ [WebSocket] Total de linhas do segmento "Padrão": ${defaultSegmentId ? await this.prisma.linesStock.count({ where: { lineStatus: 'active', segment: defaultSegmentId } }) : 0}`);
        // NÃO retornar erro aqui - deixar continuar e tentar enviar mesmo assim (pode dar erro depois, mas pelo menos tentou)
        // ATUALIZAÇÃO: Retornar erro explícito para o frontend saber que precisa aguardar alocação
        return { error: 'Aguarde alocação de linha' };
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
      let line = await this.prisma.linesStock.findUnique({
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

      // Humanização: Simular comportamento humano antes de enviar
      const messageLength = data.message?.length || 0;
      const isResponse = !data.isNewConversation; // Se não é nova conversa, é resposta
      const humanizedDelay = await this.humanizationService.getHumanizedDelay(messageLength, isResponse);

      await this.humanizationService.sleep(humanizedDelay);

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
          const maxTemplateRetries = 3;

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
            console.warn(`⚠️ [WebSocket] Erro ao enviar template (tentativa ${templateAttempt}/${maxTemplateRetries}): ${templateResult.error || 'Erro desconhecido'}. Realocando linha...`);

            const reallocationResult = await this.lineAssignmentService.reallocateLineForOperator(user.id, user.segment, currentLineId);

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
      const tryReallocateAndResend = async (sendFunction: () => Promise<any>, maxRetries: number = 3): Promise<any> => {
        let attempt = 0;
        let lastError: any = null;

        while (attempt < maxRetries) {
          try {
            return await sendFunction();
          } catch (error: any) {
            lastError = error;
            attempt++;

            const errorStatus = error.response?.status;
            const errorMessage = error.response?.data?.message || error.message;

            console.warn(`⚠️ [WebSocket] Erro ao enviar (tentativa ${attempt}/${maxRetries}). Linha ${currentLineId}. Erro: ${errorStatus} - ${errorMessage}`);

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
                  // Buscar Evolution para verificar status
                  const currentEvolution = await this.prisma.evolution.findUnique({
                    where: { evolutionName: currentLineCheck.evolutionName },
                  });

                  if (currentEvolution) {
                    const instanceName = `line_${currentLineCheck.phone.replace(/\D/g, '')}`;
                    const lineStatus = await this.healthCheckCacheService.getConnectionStatus(
                      currentEvolution.evolutionUrl,
                      currentEvolution.evolutionKey,
                      instanceName
                    );

                    // Se linha está banida ou desconectada, realocar e marcar como banida
                    if (!lineStatus || lineStatus === 'ban' || lineStatus === 'disconnected') {
                      const statusText = lineStatus || 'desconectada';
                      console.warn(`⚠️ [WebSocket] Linha ${currentLineCheck.phone} está ${statusText} na Evolution. Marcando como banida e realocando...`);
                      shouldReallocate = true;
                      // Marcar que a linha deve ser atualizada como banida
                      markLineAsBanned = true;
                    } else if (errorMessage?.toLowerCase().includes('ban') ||
                      errorMessage?.toLowerCase().includes('blocked') ||
                      errorMessage?.toLowerCase().includes('disconnect')) {
                      // Se a mensagem de erro menciona ban/blocked, também realocar
                      console.warn(`⚠️ [WebSocket] Mensagem de erro indica problema com linha: ${errorMessage}`);
                      shouldReallocate = true;
                    } else {
                      // Erro 400 pode ser problema com número/mensagem, não necessariamente com linha
                      console.warn(`⚠️ [WebSocket] Erro ${errorStatus} pode ser problema com número/mensagem, não com linha. Verificando...`);
                      // Tentar verificar se há outras linhas disponíveis, mas só realocar se realmente necessário
                      if (attempt >= 2) {
                        // Na segunda tentativa, se ainda erro 400, pode ser problema com a linha
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
                undefined, // traceId
                markLineAsBanned // Marcar linha como banida se necessário
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

            // Se não conseguiu realocar ou já tentou todas as vezes, marcar linha como banida e lançar erro
            if (attempt >= maxRetries) {
              // SEMPRE marcar linha como banida após todas as tentativas falharem
              console.error(`❌ [WebSocket] Todas as tentativas falharam. Marcando linha ${currentLineId} como banida.`);
              try {
                await this.linesService.handleBannedLine(currentLineId);
                console.log(`✅ [WebSocket] Linha ${currentLineId} marcada como banida após falha de envio.`);
              } catch (banError: any) {
                console.error(`❌ [WebSocket] Erro ao marcar linha como banida:`, banError.message);
              }
              throw new Error(`Não foi possível enviar após ${maxRetries} tentativas. Último erro: ${errorMessage || 'Erro desconhecido'}`);
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
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 1. Realocar linha
        const reallocationResult = await this.reallocateLineForOperator(user.id, user.segment);

        if (!reallocationResult.success) {
          console.warn(`⚠️ [WebSocket] Falha ao realocar linha na tentativa ${attempt}:`, reallocationResult.reason);
          if (attempt < maxRetries) {
            // Aguardar um pouco antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          console.error(`❌ [WebSocket] Não foi possível realocar linha após ${maxRetries} tentativas`);
          return { success: false, reason: 'Não foi possível realocar linha após múltiplas tentativas' };
        }

        // 2. Atualizar user object com nova linha
        user.line = reallocationResult.newLineId;

        // 3. Buscar dados da nova linha
        const newLine = await this.prisma.linesStock.findUnique({
          where: { id: reallocationResult.newLineId },
        });

        if (!newLine || newLine.lineStatus !== 'active') {
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          return { success: false, reason: 'Nova linha não está ativa' };
        }

        // 4. Buscar Evolution da nova linha
        const evolution = await this.prisma.evolution.findUnique({
          where: { evolutionName: newLine.evolutionName },
        });

        if (!evolution) {
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          return { success: false, reason: 'Evolution não encontrada' };
        }

        // 5. Verificar health da nova linha
        try {
          const instanceName = `line_${newLine.phone.replace(/\D/g, '')}`;
          const connectionState = await this.healthCheckCacheService.getConnectionStatus(
            evolution.evolutionUrl,
            evolution.evolutionKey,
            instanceName,
          );
          if (connectionState !== 'open' && connectionState !== 'OPEN' && connectionState !== 'connected' && connectionState !== 'CONNECTED') {
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            return { success: false, reason: 'Nova linha não está conectada' };
          }
        } catch (healthError) {
          // Continuar mesmo assim - tentar enviar
        }

        // 6. Tentar enviar mensagem novamente com a nova linha
        const instanceName = `line_${newLine.phone.replace(/\D/g, '')}`;
        let apiResponse;

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

              // Verificar se o arquivo existe antes de tentar ler
              try {
                await fs.access(filePath);
              } catch {
                console.error(`❌ [WebSocket] Arquivo não encontrado na recuperação: ${filePath}`);
                throw new Error(`Arquivo não encontrado: ${relativePath}`);
              }
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
            // SEMPRE limpar arquivo temporário, mesmo com erro
            if (tempPath) {
              try {
                await fs.unlink(tempPath).catch(err =>
                  console.error(`❌ [WebSocket] Erro ao limpar arquivo temporário ${tempPath}:`, err)
                );
              } catch (error) {
                console.error(`❌ [WebSocket] Erro ao limpar arquivo temporário:`, error);
              }
            }
          }
        } else {
          apiResponse = await axios.post(
            `${evolution.evolutionUrl}/message/sendText/${instanceName}`,
            {
              number: data.contactPhone.replace(/\D/g, ''),
              text: data.message,
            },
            {
              headers: { 'apikey': evolution.evolutionKey },
              timeout: 30000,
            }
          );
        }

        // 7. Se chegou aqui, mensagem foi enviada com sucesso!
        console.log(`✅ Mensagem enviada após recuperação: ${user.name} → ${data.contactPhone} (tentativa ${attempt})`);

        // Buscar contato
        const contact = await this.prisma.contact.findFirst({
          where: { phone: data.contactPhone },
        });

        // Salvar conversa
        const conversation = await this.conversationsService.create({
          contactName: contact?.name || 'Desconhecido',
          contactPhone: data.contactPhone,
          segment: user.segment,
          userName: user.name,
          userLine: newLine.id,
          userId: user.id,
          message: data.message,
          sender: 'operator',
          messageType: data.messageType || 'text',
          mediaUrl: data.mediaUrl,
        });

        // Criar/atualizar vínculo de 24 horas entre conversa e operador (apenas para contatos individuais)
        const isGroupRetry = data.contactPhone?.includes('@g.us') || false;
        if (!isGroupRetry) {
          await this.createOrUpdateConversationBinding(data.contactPhone, newLine.id, user.id);

          // Registrar mensagem do operador
          await this.controlPanelService.registerOperatorMessage(
            data.contactPhone,
            user.id,
            user.segment
          );
        }

        // Emitir mensagem para o usuário que enviou
        client.emit('message-sent', { message: conversation });

        // SINCRONIZAÇÃO: Emitir para outros operadores da mesma linha
        if (newLine?.id) {
          await this.emitToLineOperators(newLine.id, 'new_message', { message: conversation }, user.id);
        }

        this.emitToSupervisors(user.segment, 'new_message', { message: conversation });

        return { success: true, conversation };

      } catch (retryError: any) {
        console.error(`❌ [WebSocket] Erro na tentativa ${attempt} de recuperação:`, {
          message: retryError.message,
          status: retryError.response?.status,
          data: retryError.response?.data,
        });

        // Se não for a última tentativa, continuar
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        // Última tentativa falhou
        console.error(`❌ [WebSocket] Falha após ${maxRetries} tentativas de recuperação`);
        return { success: false, reason: `Falha após ${maxRetries} tentativas: ${retryError.message}` };
      }
    }

    return { success: false, reason: 'Todas as tentativas de recuperação falharam' };
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

  // Método auxiliar para encontrar linha disponível para o operador
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
