import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { AppLoggerService } from '../logger/logger.service';
import { HumanizationService } from '../humanization/humanization.service';
import { SpintaxService } from '../spintax/spintax.service';
import { PhoneValidationService } from '../phone-validation/phone-validation.service';
import axios from 'axios';

interface SendMessageOptions {
  evolutionUrl: string;
  evolutionKey: string;
  instanceName: string;
  contactPhone: string;
  message: string;
  messageType?: 'text' | 'image' | 'document';
  mediaUrl?: string;
  fileName?: string;
  traceId?: string;
}

@Injectable()
export class MessageSendingService {
  constructor(
    private prisma: PrismaService,
    private circuitBreakerService: CircuitBreakerService,
    private logger: AppLoggerService,
    private spintaxService: SpintaxService,
    private phoneValidationService: PhoneValidationService,
  ) {}

  /**
   * Envia mensagem via Evolution API com circuit breaker e retry inteligente
   */
  async sendMessage(options: SendMessageOptions): Promise<{ success: boolean; error?: string }> {
    const { evolutionUrl, evolutionKey, instanceName, contactPhone, message, messageType, mediaUrl, fileName, traceId } = options;

    try {
      const cleanPhone = this.phoneValidationService.cleanPhone(contactPhone);
      
      // Aplicar Spintax se necessário
      let finalMessage = message;
      if (this.spintaxService.hasSpintax(message)) {
        finalMessage = this.spintaxService.applySpintax(message);
        this.logger.log(
          `Spintax aplicado: "${message}" → "${finalMessage}"`,
          'MessageSending',
          { traceId },
        );
      }

      // Criar ação para circuit breaker
      const sendAction = async () => {
        if (messageType === 'image' && mediaUrl) {
          return await axios.post(
            `${evolutionUrl}/message/sendMedia/${instanceName}`,
            {
              number: cleanPhone,
              mediaUrl,
              caption: finalMessage,
              mediatype: 'image',
            },
            {
              headers: { 'apikey': evolutionKey },
              timeout: 30000,
            }
          );
        } else if (messageType === 'document' && mediaUrl) {
          return await axios.post(
            `${evolutionUrl}/message/sendMedia/${instanceName}`,
            {
              number: cleanPhone,
              mediatype: 'document',
              media: mediaUrl,
              fileName: fileName || 'document.pdf',
              caption: finalMessage,
            },
            {
              headers: { 'apikey': evolutionKey },
              timeout: 30000,
            }
          );
        } else {
          return await axios.post(
            `${evolutionUrl}/message/sendText/${instanceName}`,
            {
              number: cleanPhone,
              text: finalMessage,
            },
            {
              headers: { 'apikey': evolutionKey },
              timeout: 30000,
            }
          );
        }
      };

      // Executar através do circuit breaker
      const breakerName = `evolution-${instanceName}`;
      const response = await this.circuitBreakerService.execute(
        breakerName,
        sendAction,
        [],
        {
          timeout: 5000, // Timeout reduzido para 5s
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        },
      );

      this.logger.log(
        `Mensagem enviada com sucesso para ${cleanPhone}`,
        'MessageSending',
        { contactPhone: cleanPhone, messageType, traceId },
      );

      return { success: true };
    } catch (error: any) {
      const errorMessage = error.message || 'Erro desconhecido';
      const isCircuitOpen = error.name === 'CircuitBreakerOpenError';
      
      this.logger.error(
        `Erro ao enviar mensagem para ${contactPhone}`,
        error.stack,
        'MessageSending',
        {
          contactPhone,
          messageType,
          error: errorMessage,
          isCircuitOpen,
          traceId,
        },
      );

      return {
        success: false,
        error: isCircuitOpen
          ? 'Serviço temporariamente indisponível. Tente novamente em alguns instantes.'
          : errorMessage,
      };
    }
  }

  /**
   * Envia typing indicator
   */
  async sendTypingIndicator(
    evolutionUrl: string,
    evolutionKey: string,
    instanceName: string,
    contactPhone: string,
    isTyping: boolean,
    traceId?: string,
  ): Promise<void> {
    try {
      const cleanPhone = this.phoneValidationService.cleanPhone(contactPhone);
      
      const sendTypingAction = async () => {
        return await axios.post(
          `${evolutionUrl}/chat/sendTyping/${instanceName}`,
          {
            number: cleanPhone,
            value: isTyping,
          },
          {
            headers: { 'apikey': evolutionKey },
            timeout: 5000,
          }
        );
      };

      const breakerName = `evolution-typing-${instanceName}`;
      await this.circuitBreakerService.execute(breakerName, sendTypingAction, [], {
        timeout: 3000,
        errorThresholdPercentage: 70, // Mais tolerante para typing
      });
    } catch (error: any) {
      // Não bloquear se typing indicator falhar
      this.logger.warn(
        `Erro ao enviar typing indicator`,
        'MessageSending',
        { contactPhone, error: error.message, traceId },
      );
    }
  }
}

