import { Injectable } from '@nestjs/common';
import { CircuitBreaker } from 'opossum';
import { AppLoggerService } from '../logger/logger.service';

interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  name?: string;
}

@Injectable()
export class CircuitBreakerService {
  private breakers: Map<string, CircuitBreaker> = new Map();

  constructor(private logger: AppLoggerService) {}

  /**
   * Cria ou retorna um circuit breaker existente
   */
  getOrCreate(
    name: string,
    action: (...args: any[]) => Promise<any>,
    options: CircuitBreakerOptions = {},
  ): CircuitBreaker {
    if (this.breakers.has(name)) {
      return this.breakers.get(name)!;
    }

    const defaultOptions = {
      timeout: 5000, // 5 segundos (reduzido de 30s)
      errorThresholdPercentage: 50, // Abre após 50% de erros
      resetTimeout: 30000, // 30 segundos para tentar novamente
      ...options,
    };

    const breaker = new CircuitBreaker(action, {
      timeout: defaultOptions.timeout,
      errorThresholdPercentage: defaultOptions.errorThresholdPercentage,
      resetTimeout: defaultOptions.resetTimeout,
      name: defaultOptions.name || name,
    });

    // Event listeners para monitoramento
    breaker.on('open', () => {
      this.logger.warn(`Circuit breaker "${name}" opened`, 'CircuitBreaker', {
        name,
        state: 'open',
      });
    });

    breaker.on('halfOpen', () => {
      this.logger.log(`Circuit breaker "${name}" half-open (testing)`, 'CircuitBreaker', {
        name,
        state: 'halfOpen',
      });
    });

    breaker.on('close', () => {
      this.logger.log(`Circuit breaker "${name}" closed (healthy)`, 'CircuitBreaker', {
        name,
        state: 'close',
      });
    });

    breaker.on('failure', (error: Error) => {
      this.logger.error(
        `Circuit breaker "${name}" failure`,
        error.stack,
        'CircuitBreaker',
        {
          name,
          error: error.message,
          failures: breaker.stats.failures,
        },
      );
    });

    this.breakers.set(name, breaker);
    return breaker;
  }

  /**
   * Executa uma ação através do circuit breaker
   */
  async execute<T>(
    name: string,
    action: (...args: any[]) => Promise<T>,
    args: any[] = [],
    options?: CircuitBreakerOptions,
  ): Promise<T> {
    const breaker = this.getOrCreate(name, action, options);
    return breaker.fire(...args);
  }

  /**
   * Obtém estatísticas de um circuit breaker
   */
  getStats(name: string) {
    const breaker = this.breakers.get(name);
    if (!breaker) {
      return null;
    }
    return breaker.stats;
  }

  /**
   * Lista todos os circuit breakers
   */
  listBreakers(): string[] {
    return Array.from(this.breakers.keys());
  }
}

