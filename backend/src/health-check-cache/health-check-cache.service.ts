import { Injectable } from '@nestjs/common';
import axios from 'axios';

interface CachedHealthStatus {
  status: string;
  expiresAt: Date;
}

@Injectable()
export class HealthCheckCacheService {
  private cache = new Map<string, CachedHealthStatus>();
  private readonly CACHE_TTL = 60000; // 1 minuto em milissegundos

  /**
   * Obtém o status de conexão de uma linha (com cache)
   * @param evolutionUrl URL da Evolution API
   * @param evolutionKey Chave da Evolution API
   * @param instanceName Nome da instância
   * @returns Status da conexão ('open', 'connected', etc.)
   */
  async getConnectionStatus(
    evolutionUrl: string,
    evolutionKey: string,
    instanceName: string,
  ): Promise<string> {
    const cacheKey = `${evolutionUrl}:${instanceName}`;
    const cached = this.cache.get(cacheKey);

    // Se tem cache válido, retornar
    if (cached && cached.expiresAt > new Date()) {
      return cached.status;
    }

    // Fazer request real
    try {
      const healthCheck = await axios.get(
        `${evolutionUrl}/instance/connectionState/${instanceName}`,
        {
          headers: { 'apikey': evolutionKey },
          timeout: 5000,
        }
      );

      const connectionState = healthCheck.data?.state || healthCheck.data?.status || 'unknown';

      // Armazenar no cache
      this.cache.set(cacheKey, {
        status: connectionState,
        expiresAt: new Date(Date.now() + this.CACHE_TTL),
      });

      return connectionState;
    } catch (error) {
      console.error(`❌ [HealthCheckCache] Erro ao verificar status:`, error.message);
      // Em caso de erro, retornar status cached se existir, senão 'unknown'
      return cached?.status || 'unknown';
    }
  }

  /**
   * Limpa o cache de uma linha específica
   * @param evolutionUrl URL da Evolution API
   * @param instanceName Nome da instância
   */
  clearCache(evolutionUrl: string, instanceName: string): void {
    const cacheKey = `${evolutionUrl}:${instanceName}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Limpa todo o cache
   */
  clearAllCache(): void {
    this.cache.clear();
  }

  /**
   * Limpa entradas expiradas do cache
   */
  cleanExpiredEntries(): void {
    const now = new Date();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}

