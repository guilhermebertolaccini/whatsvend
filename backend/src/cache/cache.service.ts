import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AppLoggerService } from '../logger/logger.service';

@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private logger: AppLoggerService,
  ) {}

  /**
   * Obtém valor do cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cacheManager.get<T>(key);
      if (value) {
        this.logger.debug(`Cache HIT: ${key}`, 'CacheService');
      } else {
        this.logger.debug(`Cache MISS: ${key}`, 'CacheService');
      }
      return value;
    } catch (error: any) {
      this.logger.warn(`Erro ao buscar cache: ${key}`, 'CacheService', { error: error.message });
      return undefined;
    }
  }

  /**
   * Define valor no cache com TTL
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl || 'default'}ms)`, 'CacheService');
    } catch (error: any) {
      this.logger.warn(`Erro ao definir cache: ${key}`, 'CacheService', { error: error.message });
    }
  }

  /**
   * Remove valor do cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug(`Cache DEL: ${key}`, 'CacheService');
    } catch (error: any) {
      this.logger.warn(`Erro ao deletar cache: ${key}`, 'CacheService', { error: error.message });
    }
  }

  /**
   * Limpa todo o cache (implementação básica)
   * Nota: cache-manager v6 não tem reset(), então usamos del() para chaves conhecidas
   */
  async reset(): Promise<void> {
    try {
      // Em produção, usar Redis diretamente para limpar tudo
      this.logger.warn('Cache reset não implementado completamente. Use Redis diretamente para limpar tudo.', 'CacheService');
    } catch (error: any) {
      this.logger.warn('Erro ao resetar cache', 'CacheService', { error: error.message });
    }
  }

  /**
   * Obtém ou calcula valor (padrão cache-aside)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Invalida cache por padrão (ex: control-panel:*)
   */
  async invalidatePattern(pattern: string): Promise<void> {
    // Redis não suporta pattern delete nativamente no cache-manager
    // Implementação básica - em produção usar Redis diretamente
    this.logger.warn(`Pattern invalidation não implementado: ${pattern}`, 'CacheService');
  }
}

