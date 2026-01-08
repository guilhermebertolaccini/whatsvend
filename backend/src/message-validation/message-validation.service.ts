import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { PhoneValidationService } from '../phone-validation/phone-validation.service';
import { RateLimitingService } from '../rate-limiting/rate-limiting.service';
import { LineReputationService } from '../line-reputation/line-reputation.service';
import { AppLoggerService } from '../logger/logger.service';

interface ValidationResult {
  valid: boolean;
  reason?: string;
  metadata?: any;
}

@Injectable()
export class MessageValidationService {
  constructor(
    private prisma: PrismaService,
    private controlPanelService: ControlPanelService,
    private phoneValidationService: PhoneValidationService,
    private rateLimitingService: RateLimitingService,
    private lineReputationService: LineReputationService,
    private logger: AppLoggerService,
  ) {}

  /**
   * Valida se uma mensagem pode ser enviada
   * Centraliza todas as validações (elimina duplicação)
   */
  async validateMessage(
    userId: number,
    contactPhone: string,
    lineId: number,
    isNewConversation: boolean,
    traceId?: string,
  ): Promise<ValidationResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { valid: false, reason: 'Usuário não encontrado' };
      }

      // 1. Validação de número
      if (!this.phoneValidationService.validatePhoneNumber(contactPhone)) {
        this.logger.warn(
          `Número inválido: ${contactPhone}`,
          'MessageValidation',
          { userId, contactPhone, traceId },
        );
        return { valid: false, reason: 'Número de telefone inválido' };
      }

      // 2. Validação de permissão 1x1 (se for nova conversa)
      // Administradores sempre têm permissão de 1x1
      if (isNewConversation && !user.oneToOneActive && user.role !== 'admin') {
        this.logger.warn(
          `Operador ${user.name} sem permissão para 1x1`,
          'MessageValidation',
          { userId, contactPhone, traceId },
        );
        return { valid: false, reason: 'Você não tem permissão para iniciar conversas 1x1' };
      }

      // 3. Validação CPC
      const cpcCheck = await this.controlPanelService.canContactCPC(contactPhone, user.segment);
      if (!cpcCheck.allowed) {
        this.logger.warn(
          `Bloqueio CPC para ${contactPhone}`,
          'MessageValidation',
          { userId, contactPhone, reason: cpcCheck.reason, traceId },
        );
        return {
          valid: false,
          reason: cpcCheck.reason,
          metadata: { hoursRemaining: cpcCheck.hoursRemaining },
        };
      }

      // 4. Validação Repescagem
      const repescagemCheck = await this.controlPanelService.checkRepescagem(
        contactPhone,
        userId,
        user.segment,
      );
      if (!repescagemCheck.allowed) {
        this.logger.warn(
          `Bloqueio Repescagem para ${contactPhone}`,
          'MessageValidation',
          { userId, contactPhone, reason: repescagemCheck.reason, traceId },
        );
        return { valid: false, reason: repescagemCheck.reason };
      }

      // 5. Validação Rate Limiting
      const canSend = await this.rateLimitingService.canSendMessage(lineId);
      if (!canSend) {
        const rateLimitInfo = await this.rateLimitingService.getRateLimitInfo(lineId);
        this.logger.warn(
          `Limite de mensagens atingido para linha ${lineId}`,
          'MessageValidation',
          { userId, lineId, rateLimitInfo, traceId },
        );
        return {
          valid: false,
          reason: `Limite de mensagens atingido. Você enviou ${rateLimitInfo.messagesToday}/${rateLimitInfo.limit.daily} mensagens hoje e ${rateLimitInfo.messagesLastHour}/${rateLimitInfo.limit.hourly} na última hora.`,
          metadata: rateLimitInfo,
        };
      }

      // 6. Validação Reputação da Linha
      const isLineHealthy = await this.lineReputationService.isLineHealthy(lineId);
      if (!isLineHealthy) {
        this.logger.warn(
          `Linha ${lineId} com baixa reputação`,
          'MessageValidation',
          { userId, lineId, traceId },
        );
        return {
          valid: false,
          reason: 'Esta linha está temporariamente indisponível devido à baixa reputação.',
        };
      }

      // 7. Validação de linha ativa
      const line = await this.prisma.linesStock.findUnique({
        where: { id: lineId },
      });

      if (!line || line.lineStatus !== 'active') {
        this.logger.warn(
          `Linha ${lineId} não disponível`,
          'MessageValidation',
          { userId, lineId, lineStatus: line?.lineStatus, traceId },
        );
        return { valid: false, reason: 'Linha não disponível' };
      }

      return { valid: true };
    } catch (error: any) {
      this.logger.error(
        `Erro ao validar mensagem`,
        error.stack,
        'MessageValidation',
        { userId, contactPhone, lineId, error: error.message, traceId },
      );
      return { valid: false, reason: 'Erro ao validar mensagem' };
    }
  }
}

