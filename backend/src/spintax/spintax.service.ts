import { Injectable } from '@nestjs/common';

@Injectable()
export class SpintaxService {
  /**
   * Gera variações de texto usando sintaxe Spintax
   * Exemplo: "{Oi|Olá|E aí}, tudo {bem|bom|certo}?" → "Olá, tudo bem?"
   * 
   * @param template Template com sintaxe Spintax
   * @returns Texto com variações aplicadas
   */
  spinText(template: string): string {
    if (!template) return template;

    // Processar todas as variações {opção1|opção2|opção3}
    let result = template;
    let maxIterations = 100; // Prevenir loops infinitos
    let iterations = 0;

    while (result.includes('{') && result.includes('}') && iterations < maxIterations) {
      result = result.replace(/\{([^}]+)\}/g, (match, options) => {
        const choices = options.split('|').map(opt => opt.trim());
        if (choices.length === 0) return match;
        
        // Escolher aleatoriamente uma opção
        const randomIndex = Math.floor(Math.random() * choices.length);
        return choices[randomIndex];
      });
      iterations++;
    }

    return result;
  }

  /**
   * Gera múltiplas variações de um template
   * @param template Template com sintaxe Spintax
   * @param count Número de variações a gerar
   * @returns Array de variações únicas
   */
  generateVariations(template: string, count: number = 5): string[] {
    const variations = new Set<string>();
    let attempts = 0;
    const maxAttempts = count * 10; // Limite de tentativas

    while (variations.size < count && attempts < maxAttempts) {
      const variation = this.spinText(template);
      if (variation && variation !== template) {
        variations.add(variation);
      }
      attempts++;
    }

    // Se não gerou variações suficientes, adicionar a original
    if (variations.size === 0) {
      variations.add(template);
    }

    return Array.from(variations);
  }

  /**
   * Verifica se um texto contém sintaxe Spintax
   * @param text Texto a verificar
   * @returns true se contém Spintax
   */
  hasSpintax(text: string): boolean {
    return text.includes('{') && text.includes('}');
  }

  /**
   * Aplica Spintax a uma mensagem, retornando variação única
   * Se não tiver Spintax, retorna o texto original
   * @param message Mensagem original
   * @returns Mensagem com variação aplicada
   */
  applySpintax(message: string): string {
    if (!this.hasSpintax(message)) {
      return message;
    }
    return this.spinText(message);
  }
}

