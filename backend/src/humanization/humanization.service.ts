import { Injectable } from '@nestjs/common';

@Injectable()
export class HumanizationService {
  /**
   * Simula o tempo que um humano levaria para ler uma mensagem antes de responder
   * @param messageLength Tamanho da mensagem em caracteres
   * @returns Delay em milissegundos (2-8 segundos)
   */
  async simulateReadingTime(messageLength: number = 100): Promise<number> {
    // Humanos levam mais tempo para ler mensagens longas
    const baseTime = 2000; // 2 segundos base
    const perCharTime = messageLength * 0.05; // 50ms por caractere
    const randomVariation = Math.random() * 3000; // 0-3 segundos de variação
    
    return Math.min(baseTime + perCharTime + randomVariation, 8000); // Máximo 8 segundos
  }

  /**
   * Simula o tempo que um humano levaria para digitar uma mensagem
   * @param messageLength Tamanho da mensagem em caracteres
   * @returns Delay em milissegundos
   */
  async simulateTypingTime(messageLength: number): Promise<number> {
    // Humanos digitam entre 50-100ms por caractere (variação realista)
    const msPerChar = Math.random() * (100 - 50) + 50;
    const totalTypingTime = messageLength * msPerChar;
    
    // Adicionar pequenas pausas naturais (como humanos fazem)
    const pauseCount = Math.floor(messageLength / 20); // Pausa a cada ~20 caracteres
    const pauseTime = pauseCount * (Math.random() * 500 + 200); // 200-700ms por pausa
    
    return totalTypingTime + pauseTime;
  }

  /**
   * Simula o tempo que um humano levaria para "pensar" antes de enviar
   * @returns Delay em milissegundos (1-3 segundos)
   */
  async simulateThinkingTime(): Promise<number> {
    return Math.random() * (3000 - 1000) + 1000; // 1-3 segundos
  }

  /**
   * Calcula o delay total humanizado antes de enviar uma mensagem
   * @param messageLength Tamanho da mensagem em caracteres
   * @param isResponse Se é uma resposta (requer tempo de leitura) ou mensagem nova
   * @returns Delay total em milissegundos (máximo 15 segundos)
   */
  async getHumanizedDelay(messageLength: number, isResponse: boolean = true): Promise<number> {
    let totalDelay = 0;

    if (isResponse) {
      // Se é resposta, simular tempo de leitura
      totalDelay += await this.simulateReadingTime(messageLength);
    }

    // Sempre simular tempo de digitação
    totalDelay += await this.simulateTypingTime(messageLength);

    // Sempre simular tempo de "pensamento"
    totalDelay += await this.simulateThinkingTime();

    // Limitar a máximo 15 segundos para não ser muito lento
    return Math.min(totalDelay, 15000);
  }

  /**
   * Delay aleatório entre mensagens massivas
   * @param minSeconds Mínimo em segundos (padrão: 5)
   * @param maxSeconds Máximo em segundos (padrão: 15)
   * @returns Delay em milissegundos
   */
  async getMassiveMessageDelay(minSeconds: number = 5, maxSeconds: number = 15): Promise<number> {
    const delaySeconds = Math.random() * (maxSeconds - minSeconds) + minSeconds;
    return delaySeconds * 1000; // Converter para milissegundos
  }

  /**
   * Sleep helper
   */
  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

