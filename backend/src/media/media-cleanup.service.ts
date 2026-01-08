import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppLoggerService } from '../logger/logger.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class MediaCleanupService {
  private readonly UPLOADS_DIR = './uploads';
  private readonly MAX_AGE_DAYS = 30; // Manter arquivos por 30 dias

  constructor(private logger: AppLoggerService) {}

  /**
   * Cron job: Limpar arquivos antigos a cada dia às 3h da manhã
   */
  @Cron('0 3 * * *') // Às 3h da manhã todos os dias
  async cleanupOldFiles(): Promise<void> {
    try {
      this.logger.log('Iniciando limpeza de arquivos antigos', 'MediaCleanup');

      const files = await fs.readdir(this.UPLOADS_DIR);
      const now = Date.now();
      const maxAgeMs = this.MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

      let deletedCount = 0;
      let totalSize = 0;

      for (const file of files) {
        try {
          const filePath = path.join(this.UPLOADS_DIR, file);
          const stats = await fs.stat(filePath);

          // Verificar se é arquivo (não pasta)
          if (!stats.isFile()) {
            continue;
          }

          // Verificar idade do arquivo
          const fileAge = now - stats.mtimeMs;
          if (fileAge > maxAgeMs) {
            // Deletar arquivo antigo
            await fs.unlink(filePath);
            deletedCount++;
            totalSize += stats.size;

            this.logger.log(
              `Arquivo deletado: ${file} (${(stats.size / 1024 / 1024).toFixed(2)}MB, ${Math.floor(fileAge / (24 * 60 * 60 * 1000))} dias)`,
              'MediaCleanup',
            );
          }
        } catch (fileError) {
          this.logger.error(
            `Erro ao processar arquivo ${file}`,
            fileError.stack,
            'MediaCleanup',
            { file, error: fileError.message },
          );
        }
      }

      if (deletedCount > 0) {
        this.logger.log(
          `Limpeza concluída: ${deletedCount} arquivo(s) deletado(s), ${(totalSize / 1024 / 1024).toFixed(2)}MB liberados`,
          'MediaCleanup',
          { deletedCount, totalSizeMB: (totalSize / 1024 / 1024).toFixed(2) },
        );
      } else {
        this.logger.log('Nenhum arquivo antigo encontrado para limpeza', 'MediaCleanup');
      }
    } catch (error) {
      this.logger.error(
        'Erro ao executar limpeza de arquivos',
        error.stack,
        'MediaCleanup',
        { error: error.message },
      );
    }
  }

  /**
   * Limpar todos os arquivos temporários (temp-*)
   */
  async cleanupTempFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.UPLOADS_DIR);
      let deletedCount = 0;

      for (const file of files) {
        if (file.startsWith('temp-')) {
          try {
            const filePath = path.join(this.UPLOADS_DIR, file);
            await fs.unlink(filePath);
            deletedCount++;
          } catch (fileError) {
            this.logger.error(
              `Erro ao deletar arquivo temporário ${file}`,
              fileError.stack,
              'MediaCleanup',
            );
          }
        }
      }

      if (deletedCount > 0) {
        this.logger.log(
          `${deletedCount} arquivo(s) temporário(s) deletado(s)`,
          'MediaCleanup',
          { deletedCount },
        );
      }
    } catch (error) {
      this.logger.error(
        'Erro ao limpar arquivos temporários',
        error.stack,
        'MediaCleanup',
        { error: error.message },
      );
    }
  }

  /**
   * Obter estatísticas do diretório de uploads
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSizeMB: number;
    oldFiles: number;
    oldFilesSizeMB: number;
  }> {
    try {
      const files = await fs.readdir(this.UPLOADS_DIR);
      const now = Date.now();
      const maxAgeMs = this.MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

      let totalFiles = 0;
      let totalSize = 0;
      let oldFiles = 0;
      let oldFilesSize = 0;

      for (const file of files) {
        try {
          const filePath = path.join(this.UPLOADS_DIR, file);
          const stats = await fs.stat(filePath);

          if (stats.isFile()) {
            totalFiles++;
            totalSize += stats.size;

            const fileAge = now - stats.mtimeMs;
            if (fileAge > maxAgeMs) {
              oldFiles++;
              oldFilesSize += stats.size;
            }
          }
        } catch {
          // Ignorar erros ao processar arquivo individual
        }
      }

      return {
        totalFiles,
        totalSizeMB: totalSize / 1024 / 1024,
        oldFiles,
        oldFilesSizeMB: oldFilesSize / 1024 / 1024,
      };
    } catch (error) {
      this.logger.error(
        'Erro ao obter estatísticas de storage',
        error.stack,
        'MediaCleanup',
      );
      return {
        totalFiles: 0,
        totalSizeMB: 0,
        oldFiles: 0,
        oldFilesSizeMB: 0,
      };
    }
  }
}
