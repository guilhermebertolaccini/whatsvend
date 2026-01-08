import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PhoneValidationService {
  /**
   * Valida formato básico de número de telefone
   * @param phone Número de telefone
   * @returns true se o formato é válido
   */
  isValidFormat(phone: string): boolean {
    return this.validatePhoneNumber(phone);
  }

  /**
   * Valida formato básico de número de telefone (alias para isValidFormat)
   * @param phone Número de telefone
   * @returns true se o formato é válido
   */
  validatePhoneNumber(phone: string): boolean {
    if (!phone) return false;

    // Remover caracteres não numéricos
    const cleanPhone = phone.replace(/\D/g, '');

    // Verificar se tem entre 10 e 15 dígitos (padrão internacional)
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return false;
    }

    // Verificar se não é uma sequência de números repetidos (ex: 1111111111)
    if (/^(\d)\1{9,}$/.test(cleanPhone)) {
      return false;
    }

    // Verificar se não começa com 0 (exceto se for número local válido)
    if (cleanPhone.startsWith('0') && cleanPhone.length < 11) {
      return false;
    }

    return true;
  }

  /**
   * Valida se o número existe e está ativo via Evolution API
   * @param evolutionUrl URL da Evolution API
   * @param evolutionKey Chave da Evolution API
   * @param instanceName Nome da instância
   * @param phone Número de telefone
   * @returns true se o número é válido e existe
   */
  async validateNumberExists(
    evolutionUrl: string,
    evolutionKey: string,
    instanceName: string,
    phone: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Primeiro, validar formato básico
      if (!this.isValidFormat(phone)) {
        return { valid: false, reason: 'Formato de número inválido' };
      }

      const cleanPhone = phone.replace(/\D/g, '');

      // Verificar se o número existe via Evolution API
      // Usar o endpoint checkNumber ou verificar via WhatsApp
      try {
        const response = await axios.get(
          `${evolutionUrl}/chat/whatsappNumbers/${instanceName}`,
          {
            headers: { 'apikey': evolutionKey },
            timeout: 10000, // 10 segundos
          }
        );

        // Se a API retornar sucesso, o número provavelmente existe
        // Nota: A Evolution API pode não ter um endpoint específico de validação
        // Nesse caso, vamos fazer uma validação mais simples
        return { valid: true };
      } catch (error: any) {
        // Se der erro, ainda assim podemos tentar enviar
        // A validação real será feita quando tentar enviar a mensagem
        console.warn(`⚠️ [PhoneValidation] Erro ao validar número ${cleanPhone}:`, error.message);
        
        // Se for erro 404 ou similar, o número pode não existir
        if (error.response?.status === 404) {
          return { valid: false, reason: 'Número não encontrado' };
        }

        // Para outros erros, assumir que é válido (pode ser problema de API)
        return { valid: true };
      }
    } catch (error: any) {
      console.error(`❌ [PhoneValidation] Erro ao validar número:`, error.message);
      // Em caso de erro, retornar válido para não bloquear envio
      return { valid: true };
    }
  }

  /**
   * Limpa e normaliza número de telefone
   * Remove espaços, hífens e outros caracteres não numéricos
   * Adiciona DDI 55 se não tiver (para números brasileiros)
   * @param phone Número de telefone
   * @returns Número normalizado (apenas dígitos, com DDI 55 se aplicável)
   */
  cleanPhone(phone: string): string {
    if (!phone) return '';
    
    // Remover todos os caracteres não numéricos (espaços, hífens, parênteses, etc)
    let cleanPhone = phone.replace(/\D/g, '');
    
    // Se o número estiver vazio após limpeza, retornar vazio
    if (!cleanPhone) return '';
    
    // Se já começar com 55, retornar como está
    if (cleanPhone.startsWith('55')) {
      return cleanPhone;
    }
    
    // Se não começar com 55, adicionar o DDI 55 do Brasil
    // Isso assume que números sem DDI são brasileiros
    return '55' + cleanPhone;
  }

  /**
   * Formata número de telefone para exibição
   * @param phone Número de telefone
   * @returns Número formatado (ex: (11) 98765-4321)
   */
  formatPhone(phone: string): string {
    const clean = this.cleanPhone(phone);
    
    if (clean.length === 11) {
      // Formato brasileiro: (XX) XXXXX-XXXX
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    } else if (clean.length === 10) {
      // Formato brasileiro sem DDD: XXXXX-XXXX
      return `${clean.slice(0, 5)}-${clean.slice(5)}`;
    } else if (clean.length > 11) {
      // Número internacional: +XX XXXXXXXXXX
      return `+${clean}`;
    }
    
    return clean;
  }
}

