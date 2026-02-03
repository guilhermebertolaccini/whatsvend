import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdateControlPanelDto } from './dto/control-panel.dto';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class ControlPanelService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  // Buscar configurações (global ou por segmento) - COM CACHE
  async findOne(segmentId?: number) {
    const cacheKey = `control-panel:${segmentId ?? 'global'}`;
    
    // Cache: 5 minutos (configurações mudam raramente)
    return await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const config = await this.prisma.controlPanel.findFirst({
          where: { segmentId: segmentId ?? null },
        });

        if (!config) {
          // Retornar configuração padrão se não existir
          return {
            id: null,
            segmentId: segmentId ?? null,
            blockPhrasesEnabled: true,
            blockPhrases: [],
            blockTabulationId: null,
            cpcCooldownEnabled: true,
            cpcCooldownHours: 24,
            resendCooldownEnabled: true,
            resendCooldownHours: 24,
            repescagemEnabled: false,
            repescagemMaxMessages: 2,
            repescagemCooldownHours: 24,
            repescagemMaxAttempts: 2,
            activeEvolutions: null, // null = todas as evolutions ativas
            autoMessageEnabled: false, // Desativado por padrão
            autoMessageHours: 24,
            autoMessageText: null,
            autoMessageMaxAttempts: 1,
            sharedLineMode: false, // Modo compartilhado desativado por padrão
          };
        }

        return {
          ...config,
          blockPhrases: config.blockPhrases ? JSON.parse(config.blockPhrases) : [],
          activeEvolutions: (config as any).activeEvolutions ? JSON.parse((config as any).activeEvolutions) : null,
        };
      },
      5 * 60 * 1000, // 5 minutos
    );
  }

  // Criar ou atualizar configurações
  async upsert(dto: UpdateControlPanelDto) {
    const existing = await this.prisma.controlPanel.findFirst({
      where: { segmentId: dto.segmentId ?? null },
    });

    const data = {
      segmentId: dto.segmentId ?? null,
      blockPhrasesEnabled: dto.blockPhrasesEnabled,
      blockPhrases: dto.blockPhrases ? JSON.stringify(dto.blockPhrases) : undefined,
      blockTabulationId: dto.blockTabulationId,
      cpcCooldownEnabled: dto.cpcCooldownEnabled,
      cpcCooldownHours: dto.cpcCooldownHours,
      resendCooldownEnabled: dto.resendCooldownEnabled,
      resendCooldownHours: dto.resendCooldownHours,
      repescagemEnabled: dto.repescagemEnabled,
      repescagemMaxMessages: dto.repescagemMaxMessages,
      repescagemCooldownHours: dto.repescagemCooldownHours,
      repescagemMaxAttempts: dto.repescagemMaxAttempts,
      activeEvolutions: dto.activeEvolutions !== undefined 
        ? (dto.activeEvolutions === null || dto.activeEvolutions.length === 0 
            ? null 
            : JSON.stringify(dto.activeEvolutions))
        : undefined,
      autoMessageEnabled: dto.autoMessageEnabled,
      autoMessageHours: dto.autoMessageHours,
      autoMessageText: dto.autoMessageText,
      autoMessageMaxAttempts: dto.autoMessageMaxAttempts,
      sharedLineMode: dto.sharedLineMode,
    };

    // Remover campos undefined
    Object.keys(data).forEach(key => {
      if (data[key] === undefined) {
        delete data[key];
      }
    });

    if (existing) {
      const updated = await this.prisma.controlPanel.update({
        where: { id: existing.id },
        data,
      });
      
      // Invalidar cache após atualização
      const cacheKey = `control-panel:${dto.segmentId ?? 'global'}`;
      await this.cacheService.del(cacheKey);
      
      return {
        ...updated,
        blockPhrases: updated.blockPhrases ? JSON.parse(updated.blockPhrases) : [],
        activeEvolutions: (updated as any).activeEvolutions ? JSON.parse((updated as any).activeEvolutions) : null,
      };
    }

    const created = await this.prisma.controlPanel.create({
      data: {
        ...data,
        blockPhrases: data.blockPhrases ?? '[]',
        activeEvolutions: data.activeEvolutions ?? null,
      } as any, // Temporário até migration ser aplicada
    });
    
    // Invalidar cache após criação
    const cacheKey = `control-panel:${dto.segmentId ?? 'global'}`;
    await this.cacheService.del(cacheKey);
    
    return {
      ...created,
      blockPhrases: created.blockPhrases ? JSON.parse(created.blockPhrases) : [],
      activeEvolutions: (created as any).activeEvolutions ? JSON.parse((created as any).activeEvolutions) : null,
    };
  }

  // Adicionar frase de bloqueio
  async addBlockPhrase(phrase: string, segmentId?: number) {
    const config = await this.findOne(segmentId);
    const phrases = config.blockPhrases || [];

    if (!phrases.includes(phrase)) {
      phrases.push(phrase);
    }

    return this.upsert({
      segmentId: segmentId ?? undefined,
      blockPhrases: phrases,
    });
  }

  // Remover frase de bloqueio
  async removeBlockPhrase(phrase: string, segmentId?: number) {
    const config = await this.findOne(segmentId);
    const phrases = (config.blockPhrases || []).filter((p: string) => p !== phrase);

    return this.upsert({
      segmentId: segmentId ?? undefined,
      blockPhrases: phrases,
    });
  }

  // Verificar se uma mensagem contém uma frase de bloqueio
  async checkBlockPhrases(message: string, segmentId?: number): Promise<boolean> {
    const config = await this.findOne(segmentId);
    
    // Se frases de bloqueio estiverem desativadas, retornar false
    if (!config.blockPhrasesEnabled) {
      return false;
    }
    
    const phrases = config.blockPhrases || [];
    const messageLower = message.toLowerCase();
    return phrases.some((phrase: string) => messageLower.includes(phrase.toLowerCase()));
  }

  // Verificar se pode enviar para um CPC (baseado no temporizador)
  async canContactCPC(contactPhone: string, segmentId?: number): Promise<{ allowed: boolean; reason?: string; hoursRemaining?: number }> {
    const config = await this.findOne(segmentId);

    // Se temporizador de CPC estiver desativado, permitir sempre
    if (!config.cpcCooldownEnabled) {
      return { allowed: true };
    }

    const contact = await this.prisma.contact.findFirst({
      where: { phone: contactPhone },
    });

    if (!contact || !contact.isCPC) {
      return { allowed: true };
    }

    if (!contact.lastCPCAt) {
      return { allowed: true };
    }

    const cooldownMs = config.cpcCooldownHours * 60 * 60 * 1000;
    const timeSinceLastCPC = Date.now() - new Date(contact.lastCPCAt).getTime();

    if (timeSinceLastCPC < cooldownMs) {
      const hoursRemaining = Math.ceil((cooldownMs - timeSinceLastCPC) / (60 * 60 * 1000));
      return {
        allowed: false,
        reason: `CPC em período de espera. Aguarde ${hoursRemaining} hora(s).`,
        hoursRemaining,
      };
    }

    return { allowed: true };
  }

  // Verificar se pode reenviar para um telefone
  async canResend(contactPhone: string, segmentId?: number): Promise<{ allowed: boolean; reason?: string; hoursRemaining?: number }> {
    const config = await this.findOne(segmentId);

    // Se controle de reenvio estiver desativado, permitir sempre
    if (!config.resendCooldownEnabled) {
      return { allowed: true };
    }

    const lastSend = await this.prisma.sendHistory.findFirst({
      where: { contactPhone },
      orderBy: { sentAt: 'desc' },
    });

    if (!lastSend) {
      return { allowed: true };
    }

    const cooldownMs = config.resendCooldownHours * 60 * 60 * 1000;
    const timeSinceLastSend = Date.now() - new Date(lastSend.sentAt).getTime();

    if (timeSinceLastSend < cooldownMs) {
      const hoursRemaining = Math.ceil((cooldownMs - timeSinceLastSend) / (60 * 60 * 1000));
      return {
        allowed: false,
        reason: `Aguarde ${hoursRemaining} hora(s) para reenviar para este contato.`,
        hoursRemaining,
      };
    }

    return { allowed: true };
  }

  // Verificar repescagem (controle de mensagens seguidas)
  async checkRepescagem(contactPhone: string, operatorId: number, segmentId?: number): Promise<{ allowed: boolean; reason?: string }> {
    const config = await this.findOne(segmentId);

    if (!config.repescagemEnabled) {
      return { allowed: true };
    }

    let repescagem = await this.prisma.contactRepescagem.findFirst({
      where: { contactPhone, operatorId },
    });

    if (!repescagem) {
      return { allowed: true };
    }

    // Se tem bloqueio permanente (atingiu limite de repescagens)
    if (repescagem.permanentBlock) {
      return {
        allowed: false,
        reason: 'Limite de repescagens atingido. Aguarde o cliente entrar em contato.',
      };
    }

    // Se está bloqueado temporariamente
    if (repescagem.blockedUntil && new Date() < new Date(repescagem.blockedUntil)) {
      const hoursRemaining = Math.ceil(
        (new Date(repescagem.blockedUntil).getTime() - Date.now()) / (60 * 60 * 1000)
      );
      return {
        allowed: false,
        reason: `Aguarde ${hoursRemaining} hora(s) para enviar nova mensagem.`,
      };
    }

    return { allowed: true };
  }

  // Registrar mensagem enviada pelo operador (para controle de repescagem)
  async registerOperatorMessage(contactPhone: string, operatorId: number, segmentId?: number): Promise<void> {
    const config = await this.findOne(segmentId);

    if (!config.repescagemEnabled) {
      return;
    }

    let repescagem = await this.prisma.contactRepescagem.findFirst({
      where: { contactPhone, operatorId },
    });

    if (!repescagem) {
      repescagem = await this.prisma.contactRepescagem.create({
        data: {
          contactPhone,
          operatorId,
          messagesCount: 1,
          lastMessageAt: new Date(),
        },
      });
      return;
    }

    // Se bloqueio permanente, não faz nada
    if (repescagem.permanentBlock) {
      return;
    }

    // Incrementar contador
    const newCount = repescagem.messagesCount + 1;

    // Verificar se atingiu o limite de mensagens seguidas
    if (newCount >= config.repescagemMaxMessages) {
      const newAttempts = repescagem.attempts + 1;

      // Verificar se atingiu o limite de repescagens
      if (config.repescagemMaxAttempts > 0 && newAttempts >= config.repescagemMaxAttempts) {
        // Bloqueio permanente
        await this.prisma.contactRepescagem.update({
          where: { id: repescagem.id },
          data: {
            messagesCount: 0,
            attempts: newAttempts,
            permanentBlock: true,
            lastMessageAt: new Date(),
          },
        });
      } else {
        // Bloqueio temporário
        const blockedUntil = new Date();
        blockedUntil.setHours(blockedUntil.getHours() + config.repescagemCooldownHours);

        await this.prisma.contactRepescagem.update({
          where: { id: repescagem.id },
          data: {
            messagesCount: 0,
            attempts: newAttempts,
            blockedUntil,
            lastMessageAt: new Date(),
          },
        });
      }
    } else {
      // Apenas incrementar
      await this.prisma.contactRepescagem.update({
        where: { id: repescagem.id },
        data: {
          messagesCount: newCount,
          lastMessageAt: new Date(),
        },
      });
    }
  }

  // Registrar resposta do cliente (reseta repescagem)
  async registerClientResponse(contactPhone: string): Promise<void> {
    // Resetar todos os controles de repescagem para este contato
    await this.prisma.contactRepescagem.updateMany({
      where: { contactPhone },
      data: {
        messagesCount: 0,
        blockedUntil: null,
        permanentBlock: false,
        // Não resetar attempts para manter histórico
      },
    });
  }

  // Registrar envio para histórico (para controle de reenvio)
  async registerSend(contactPhone: string, campaignId?: number, lineId?: number): Promise<void> {
    await this.prisma.sendHistory.create({
      data: {
        contactPhone,
        campaignId,
        lineId,
      },
    });
  }

  // Marcar contato como CPC
  async markAsCPC(contactPhone: string, isCPC: boolean): Promise<void> {
    await this.prisma.contact.updateMany({
      where: { phone: contactPhone },
      data: {
        isCPC,
        lastCPCAt: isCPC ? new Date() : null,
      },
    });
  }

  // Obter lista de evolutions ativas (para filtro de atribuição de linhas)
  async getActiveEvolutions(segmentId?: number): Promise<string[] | null> {
    const config = await this.findOne(segmentId);
    return config.activeEvolutions || null; // null = todas ativas
  }

  // Filtrar linhas por evolutions ativas
  async filterLinesByActiveEvolutions(lines: any[], segmentId?: number): Promise<any[]> {
    const activeEvolutions = await this.getActiveEvolutions(segmentId);
    
    // Se não há restrição (null), retornar todas as linhas
    if (!activeEvolutions || activeEvolutions.length === 0) {
      return lines;
    }
    
    // Filtrar apenas linhas das evolutions ativas
    return lines.filter(line => activeEvolutions.includes(line.evolutionName));
  }

  // Atribuição em massa de linhas aos operadores
  async assignLinesToAllOperators(): Promise<{
    success: boolean;
    assigned: number;
    skipped: number;
    details: Array<{
      operatorName: string;
      operatorId: number;
      segment: number | null;
      linePhone: string | null;
      lineId: number | null;
      status: 'assigned' | 'skipped' | 'already_has_line';
      reason?: string;
    }>;
  }> {
    // Buscar todos os operadores (online e offline)
    const operators = await this.prisma.user.findMany({
      where: {
        role: 'operator',
      },
      orderBy: {
        segment: 'asc',
      },
    });

    const results = {
      success: true,
      assigned: 0,
      skipped: 0,
      details: [] as Array<{
        operatorName: string;
        operatorId: number;
        segment: number | null;
        linePhone: string | null;
        lineId: number | null;
        status: 'assigned' | 'skipped' | 'already_has_line';
        reason?: string;
      }>,
    };

    // Agrupar operadores por segmento
    const operatorsBySegment = new Map<number | null, typeof operators>();
    for (const operator of operators) {
      const segment = operator.segment;
      if (!operatorsBySegment.has(segment)) {
        operatorsBySegment.set(segment, []);
      }
      operatorsBySegment.get(segment)!.push(operator);
    }

    // Processar cada segmento dentro de uma transaction para evitar race conditions
    return await this.prisma.$transaction(async (tx) => {
      // Processar cada segmento
      for (const [segment, segmentOperators] of operatorsBySegment.entries()) {
        // Buscar linhas disponíveis para este segmento
        let availableLines: any[] = [];
        
        if (segment !== null && segment !== undefined) {
          // Buscar linhas do segmento específico
          availableLines = await tx.linesStock.findMany({
          where: {
            lineStatus: 'active',
            segment: segment,
          },
          orderBy: {
            phone: 'asc',
          },
        });
        console.log(`🔍 [Atribuição em Massa] Segmento ${segment}: encontradas ${availableLines.length} linhas do próprio segmento`);
      }

      // Se não encontrou linhas do segmento, buscar linhas padrão (segmento null ou "Padrão")
      if (availableLines.length === 0) {
        // Primeiro tentar linhas com segmento null
        const nullSegmentLines = await tx.linesStock.findMany({
          where: {
            lineStatus: 'active',
            segment: null,
          },
          orderBy: {
            phone: 'asc',
          },
        });
        
        console.log(`🔍 [Atribuição em Massa] Segmento ${segment || 'null'}: encontradas ${nullSegmentLines.length} linhas com segmento null`);
        
        if (nullSegmentLines.length > 0) {
          availableLines = nullSegmentLines;
        } else {
          // Se não encontrou linhas com segmento null, buscar segmento "Padrão"
          const defaultSegment = await tx.segment.findUnique({
            where: { name: 'Padrão' },
          });

          if (defaultSegment) {
            availableLines = await tx.linesStock.findMany({
              where: {
                lineStatus: 'active',
                segment: defaultSegment.id,
              },
              orderBy: {
                phone: 'asc',
              },
            });
            console.log(`🔍 [Atribuição em Massa] Segmento ${segment || 'null'}: encontradas ${availableLines.length} linhas do segmento "Padrão"`);
          } else {
            console.warn(`⚠️ [Atribuição em Massa] Segmento "Padrão" não encontrado no banco`);
          }
        }
      }

      // IMPORTANTE: Filtrar linhas por evolutions ativas ANTES de processar
      availableLines = await this.filterLinesByActiveEvolutions(availableLines, segment || undefined);
      console.log(`🔍 [Atribuição em Massa] Após filtrar por evolutions ativas: ${availableLines.length} linhas disponíveis para segmento ${segment || 'null'}`);

      console.log(`📊 [Atribuição em Massa] Segmento ${segment || 'null'}: ${segmentOperators.length} operadores, ${availableLines.length} linhas disponíveis`);

      if (availableLines.length === 0) {
        // Nenhuma linha disponível para este segmento
        console.warn(`⚠️ [Atribuição em Massa] Nenhuma linha disponível para segmento ${segment || 'null'}`);
        for (const operator of segmentOperators) {
          results.skipped++;
          results.details.push({
            operatorName: operator.name,
            operatorId: operator.id,
            segment: operator.segment,
            linePhone: null,
            lineId: null,
            status: 'skipped',
            reason: 'Nenhuma linha disponível para o segmento',
          });
        }
        continue;
      }

      // Distribuir linhas aos operadores (regra 2x1)
      let lineIndex = 0;
      for (const operator of segmentOperators) {
        // Verificar se operador já tem linha
        let currentLineId = operator.line;
        if (!currentLineId) {
          const lineOperator = await (tx as any).lineOperator.findFirst({
            where: { userId: operator.id },
          });
          currentLineId = lineOperator?.lineId || null;
        }

        // Se operador tem linha, verificar se é de uma evolution ativa
        if (currentLineId) {
          const currentLine = await tx.linesStock.findUnique({
            where: { id: currentLineId },
          });
          
          if (currentLine) {
            // Verificar se a linha atual é de uma evolution ativa
            const activeEvolutions = await this.getActiveEvolutions(operator.segment || undefined);
            
            // Se há evolutions ativas configuradas e a linha atual não está na lista, desvincular
            if (activeEvolutions && activeEvolutions.length > 0) {
              if (!activeEvolutions.includes(currentLine.evolutionName)) {
                // Linha atual não é de uma evolution ativa, desvincular
                console.log(`🔄 [Atribuição em Massa] Desvinculando operador ${operator.name} da linha ${currentLine.phone} (evolution: ${currentLine.evolutionName} não está ativa)`);
                
                // Remover vínculo
                await (tx as any).lineOperator.deleteMany({
                  where: { userId: operator.id, lineId: currentLineId },
                });
                
                // Limpar campo legacy
                await tx.user.update({
                  where: { id: operator.id },
                  data: { line: null },
                });
                
                // Continuar para atribuir nova linha
                currentLineId = null;
              } else {
                // Linha atual é de uma evolution ativa, manter
                results.skipped++;
                results.details.push({
                  operatorName: operator.name,
                  operatorId: operator.id,
                  segment: operator.segment,
                  linePhone: currentLine.phone,
                  lineId: currentLineId,
                  status: 'already_has_line',
                  reason: 'Operador já possui linha atribuída de evolution ativa',
                });
                continue;
              }
            } else {
              // Sem restrição de evolutions, manter linha atual
              results.skipped++;
              results.details.push({
                operatorName: operator.name,
                operatorId: operator.id,
                segment: operator.segment,
                linePhone: currentLine.phone,
                lineId: currentLineId,
                status: 'already_has_line',
                reason: 'Operador já possui linha atribuída',
              });
              continue;
            }
          }
        }

        // LÓGICA SIMPLIFICADA: 
        // 1. Operador tem linha? Não -> atribuir primeira linha disponível
        // 2. Atualizar segmento da linha para o segmento do operador
        // 3. Próximo operador
        let assignedLine = null;

        for (const candidateLine of availableLines) {
          // Verificar quantos operadores já estão vinculados
          const operatorsCount = await (tx as any).lineOperator.count({
            where: { lineId: candidateLine.id },
          });

          // Se linha já tem 2 operadores, pular
          if (operatorsCount >= 2) {
            continue;
          }

          // Verificar se operador já está vinculado a esta linha
          const existing = await (tx as any).lineOperator.findFirst({
            where: {
              lineId: candidateLine.id,
              userId: operator.id,
            },
          }).catch(() => null);

          if (existing) {
            continue; // Operador já está vinculado a esta linha
          }

          // Verificar se a linha já tem operadores de outro segmento
          const existingOperators = await (tx as any).lineOperator.findMany({
            where: { lineId: candidateLine.id },
            include: { user: true },
          });

          // Se a linha já tem operadores, verificar se são do mesmo segmento
          if (existingOperators.length > 0) {
            const allSameSegment = existingOperators.every((lo: any) => {
              // Se ambos são null, considerar mesmo segmento
              if (lo.user.segment === null && operator.segment === null) return true;
              // Comparar segmentos
              return lo.user.segment === operator.segment;
            });
            
            if (!allSameSegment) {
              // Linha já tem operador de outro segmento, pular esta linha
              continue;
            }
          }

          // Linha disponível! Atribuir e sair do loop
          assignedLine = candidateLine;
          break;
        }

        if (assignedLine) {
          console.log(`✅ [Atribuição em Massa] Atribuindo linha ${assignedLine.phone} (ID: ${assignedLine.id}, Segmento: ${assignedLine.segment}) ao operador ${operator.name} (ID: ${operator.id}, Segmento: ${operator.segment})`);
          
          // Vincular operador à linha (usando tx dentro da transaction)
          await (tx as any).lineOperator.create({
            data: {
              lineId: assignedLine.id,
              userId: operator.id,
            },
          });

          // Atualizar campos legacy
          await tx.user.update({
            where: { id: operator.id },
            data: { line: assignedLine.id },
          });

          // Se for o primeiro operador da linha, atualizar linkedTo
          const operatorsCount = await (tx as any).lineOperator.count({
            where: { lineId: assignedLine.id },
          });
          if (operatorsCount === 1) {
            await tx.linesStock.update({
              where: { id: assignedLine.id },
              data: { linkedTo: operator.id },
            });
          }

          // SEMPRE atualizar segmento da linha para o segmento do operador
          // Se operador tem segmento, atualizar linha para esse segmento
          if (operator.segment !== null && assignedLine.segment !== operator.segment) {
            await tx.linesStock.update({
              where: { id: assignedLine.id },
              data: { segment: operator.segment },
            });
            console.log(`🔄 [Atribuição em Massa] Linha ${assignedLine.phone} atualizada de segmento ${assignedLine.segment || 'null'} para ${operator.segment}`);
          } else if (operator.segment === null && assignedLine.segment !== null) {
            // Se operador não tem segmento mas linha tem, manter segmento da linha
            console.log(`ℹ️ [Atribuição em Massa] Linha ${assignedLine.phone} mantém segmento ${assignedLine.segment} (operador sem segmento)`);
          }

          results.assigned++;
          results.details.push({
            operatorName: operator.name,
            operatorId: operator.id,
            segment: operator.segment,
            linePhone: assignedLine.phone,
            lineId: assignedLine.id,
            status: 'assigned',
          });
        } else {
          // Verificar quantas linhas realmente têm espaço (usando tx)
          let linesWithSpace = 0;
          for (const line of availableLines) {
            const count = await (tx as any).lineOperator.count({
              where: { lineId: line.id },
            });
            if (count < 2) {
              linesWithSpace++;
            }
          }
          
          const reason = availableLines.length === 0 
            ? 'Nenhuma linha disponível para o segmento'
            : linesWithSpace === 0
            ? 'Todas as linhas disponíveis já têm 2 operadores'
            : 'Nenhuma linha compatível encontrada (verificar segmentos)';
          
          console.warn(`⚠️ [Atribuição em Massa] Operador ${operator.name} (ID: ${operator.id}, Segmento: ${operator.segment}) não recebeu linha. ${availableLines.length} linhas disponíveis, ${linesWithSpace} com espaço. Motivo: ${reason}`);
          
          results.skipped++;
          results.details.push({
            operatorName: operator.name,
            operatorId: operator.id,
            segment: operator.segment,
            linePhone: null,
            lineId: null,
            status: 'skipped',
            reason,
          });
        }
      }
      }

      console.log(`📊 [Atribuição em Massa] Resultado final: ${results.assigned} atribuídas, ${results.skipped} puladas`);
      console.log(`📊 [Atribuição em Massa] Detalhes: ${results.details.filter(d => d.status === 'assigned').length} atribuídas, ${results.details.filter(d => d.status === 'already_has_line').length} já tinham linha, ${results.details.filter(d => d.status === 'skipped').length} puladas`);

      return results;
    }, { timeout: 30000 }); // Timeout de 30 segundos para a transaction
  }

  // Desatribuir todas as linhas dos operadores e alterar todas as linhas para segmento "Padrão"
  async unassignAllLines(): Promise<{
    success: boolean;
    unassignedOperators: number;
    linesUpdated: number;
    reassignedOperators: number;
    message: string;
  }> {
    try {
      console.log('🔄 [Desatribuição em Massa] Iniciando desatribuição de todas as linhas...');

      // 1. Buscar segmento "Padrão"
      const defaultSegment = await this.prisma.segment.findUnique({
        where: { name: 'Padrão' },
      });

      if (!defaultSegment) {
        throw new Error('Segmento "Padrão" não encontrado no banco de dados');
      }

      // 2. Desatribuir TODOS os operadores de TODAS as linhas (sem exceção)
      // Primeiro, contar quantos vínculos existem
      const totalLinksBefore = await (this.prisma as any).lineOperator.count({});
      console.log(`🔍 [Desatribuição em Massa] Total de vínculos antes: ${totalLinksBefore}`);
      
      const deletedCount = await (this.prisma as any).lineOperator.deleteMany({});
      console.log(`✅ [Desatribuição em Massa] ${deletedCount.count} vínculos de operadores removidos`);
      
      // Verificar se realmente removeu tudo
      const totalLinksAfter = await (this.prisma as any).lineOperator.count({});
      if (totalLinksAfter > 0) {
        console.warn(`⚠️ [Desatribuição em Massa] Ainda existem ${totalLinksAfter} vínculos após deleteMany! Forçando remoção...`);
        // Forçar remoção novamente
        await (this.prisma as any).lineOperator.deleteMany({});
      }

      // 3. Limpar campo legacy 'line' de TODOS os operadores (sem exceção)
      const updatedUsers = await this.prisma.user.updateMany({
        where: {
          role: 'operator',
        },
        data: {
          line: null,
        },
      });
      console.log(`✅ [Desatribuição em Massa] Campo legacy "line" limpo de ${updatedUsers.count} operadores`);
      
      // Verificar se realmente limpou tudo
      const operatorsWithLine = await this.prisma.user.count({
        where: {
          role: 'operator',
          line: { not: null },
        },
      });
      if (operatorsWithLine > 0) {
        console.warn(`⚠️ [Desatribuição em Massa] Ainda existem ${operatorsWithLine} operadores com campo 'line' preenchido! Forçando limpeza...`);
        await this.prisma.user.updateMany({
          where: {
            role: 'operator',
            line: { not: null },
          },
          data: {
            line: null,
          },
        });
      }

      // 4. Limpar campo legacy 'linkedTo' de TODAS as linhas
      await this.prisma.linesStock.updateMany({
        where: {
          lineStatus: 'active',
        },
        data: {
          linkedTo: null,
        },
      });
      console.log('✅ [Desatribuição em Massa] Campo legacy "linkedTo" limpo de todas as linhas');

      // 5. Atualizar todas as linhas ativas para o segmento "Padrão"
      const updatedLines = await this.prisma.linesStock.updateMany({
        where: {
          lineStatus: 'active',
          segment: { not: defaultSegment.id },
        },
        data: {
          segment: defaultSegment.id,
        },
      });
      console.log(`✅ [Desatribuição em Massa] ${updatedLines.count} linhas atualizadas para o segmento "Padrão"`);

      // 6. Também atualizar linhas com segmento null
      const updatedNullLines = await this.prisma.linesStock.updateMany({
        where: {
          lineStatus: 'active',
          segment: null,
        },
        data: {
          segment: defaultSegment.id,
        },
      });
      console.log(`✅ [Desatribuição em Massa] ${updatedNullLines.count} linhas com segmento null atualizadas para "Padrão"`);

      const totalLinesUpdated = updatedLines.count + updatedNullLines.count;

      return {
        success: true,
        unassignedOperators: deletedCount.count,
        linesUpdated: totalLinesUpdated,
        reassignedOperators: 0,
        message: `Desatribuição concluída: ${deletedCount.count} operadores desvinculados, ${totalLinesUpdated} linhas atualizadas para segmento "Padrão"`,
      };
    } catch (error) {
      console.error('❌ [Desatribuição em Massa] Erro:', error);
      throw error;
    }
  }
}

