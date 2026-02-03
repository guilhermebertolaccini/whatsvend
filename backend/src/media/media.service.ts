import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class MediaService {
  private readonly uploadsDir = './uploads';

  constructor(private prisma: PrismaService) {}

  /**
   * Salvar referência de mídia no banco
   */
  async saveMediaReference(data: {
    conversationId: number;
    filePath: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }) {
    // Aqui você pode criar uma tabela Media se quiser rastrear melhor
    // Por enquanto, a URL já está em Conversation.mediaUrl
    console.log(`📎 Mídia salva: ${data.fileName} (${data.fileSize} bytes)`);
  }

  /**
   * Buscar arquivo
   */
  async getFilePath(filename: string): Promise<string> {
    const filePath = path.join(this.uploadsDir, filename);
    
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      throw new NotFoundException('Arquivo não encontrado');
    }
  }

  /**
   * Download de mídia da Evolution (quando webhook recebe mídia)
   */
  async downloadMediaFromEvolution(mediaUrl: string, fileName: string): Promise<string> {
    try {
      const axios = require('axios');
      const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
      
      const filePath = path.join(this.uploadsDir, fileName);
      await fs.mkdir(this.uploadsDir, { recursive: true });
      await fs.writeFile(filePath, response.data);
      
      console.log(`📥 Mídia baixada da Evolution: ${fileName}`);
      return fileName;
    } catch (error) {
      console.error('❌ Erro ao baixar mídia da Evolution:', error.message);
      return null;
    }
  }

  /**
   * CRON JOB: Limpar arquivos de conversas finalizadas há mais de 15 dias
   * Roda todo dia às 3h da manhã
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanOldMedia() {
    console.log('🧹 Iniciando limpeza de mídias antigas...');

    try {
      // Data limite: 15 dias atrás
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

      // Buscar conversas finalizadas (com tabulação) há mais de 15 dias
      const oldConversations = await this.prisma.conversation.findMany({
        where: {
          tabulation: { not: null }, // Apenas finalizadas
          updatedAt: { lte: fifteenDaysAgo }, // Há mais de 15 dias
          mediaUrl: { not: null }, // Que tem mídia
        },
        select: {
          id: true,
          mediaUrl: true,
          contactPhone: true,
        },
      });

      console.log(`📊 Encontradas ${oldConversations.length} conversas com mídia para limpar`);

      let deletedCount = 0;
      let errorCount = 0;

      for (const conv of oldConversations) {
        try {
          // Extrair nome do arquivo da URL
          // Assumindo mediaUrl como: "/uploads/media-123456.jpg" ou "http://..."
          const urlObj = new URL(conv.mediaUrl, 'http://localhost');
          const fileName = path.basename(urlObj.pathname);
          const filePath = path.join(this.uploadsDir, fileName);

          // Deletar arquivo físico
          await fs.unlink(filePath);
          
          // Limpar referência no banco
          await this.prisma.conversation.update({
            where: { id: conv.id },
            data: { mediaUrl: null },
          });

          deletedCount++;
          console.log(`✅ Mídia deletada: ${fileName} (contato: ${conv.contactPhone})`);
        } catch (error) {
          errorCount++;
          console.warn(`⚠️ Erro ao deletar mídia da conversa ${conv.id}:`, error.message);
        }
      }

      console.log(`🧹 Limpeza concluída: ${deletedCount} arquivos deletados, ${errorCount} erros`);
    } catch (error) {
      console.error('❌ Erro na limpeza de mídias:', error);
    }
  }

  /**
   * Limpar arquivos órfãos (no diretório mas não no banco)
   * Roda uma vez por semana aos domingos às 4h
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanOrphanFiles() {
    console.log('🧹 Iniciando limpeza de arquivos órfãos...');

    try {
      const files = await fs.readdir(this.uploadsDir);
      
      let orphanCount = 0;

      for (const file of files) {
        // Verificar se o arquivo está referenciado em alguma conversa
        const count = await this.prisma.conversation.count({
          where: {
            mediaUrl: {
              contains: file,
            },
          },
        });

        // Se não está referenciado, deletar
        if (count === 0) {
          const filePath = path.join(this.uploadsDir, file);
          await fs.unlink(filePath);
          orphanCount++;
          console.log(`🗑️ Arquivo órfão deletado: ${file}`);
        }
      }

      console.log(`🧹 Limpeza de órfãos concluída: ${orphanCount} arquivos deletados`);
    } catch (error) {
      console.error('❌ Erro na limpeza de órfãos:', error);
    }
  }
}

