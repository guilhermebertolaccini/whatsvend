import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { LinesService } from './lines.service';

@Injectable()
export class LinesSchedulerService {
  private readonly logger = new Logger(LinesSchedulerService.name);
  private isRunning = false;

  constructor(
    private prisma: PrismaService,
    private linesService: LinesService
  ) { }

  /**
   * Job que verifica a saúde de TODAS as linhas a cada 30 minutos.
   * Executa verifyLineHealth (force check na Evolution).
   */
  @Cron('*/30 * * * *')
  async verifyAllLines() {
    if (this.isRunning) {
      this.logger.warn('⚠️ Job de verificação de linhas já está rodando. Pulando execução.');
      return;
    }

    this.isRunning = true;
    this.logger.log('🕵️‍♂️ [LinesScheduler] Iniciando verificação periódica de TODAS as linhas...');

    try {
      // Buscar todas as linhas (sem filtros)
      // Usar LinesService.findAll ou Prisma direto?
      // O LinesService.findAll retorna DTOs complexos. Vamos usar Prisma direto para ser mais leve e pegar só o ID.
      const allLines = await this.prisma.linesStock.findMany({
        select: { id: true, phone: true }
      });

      this.logger.log(`📊 [LinesScheduler] Total de linhas a verificar: ${allLines.length}`);

      let checkedCount = 0;
      let bannedCount = 0;
      let activatedCount = 0;

      for (const line of allLines) {
        try {
          // Delay de 2 segundos para não sobrecarregar a Evolution
          if (checkedCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          const result = await this.linesService.verifyLineHealth(line.id);

          if (result.actionTaken === 'banned') {
            bannedCount++;
            this.logger.warn(`🚫 [LinesScheduler] Linha ${line.phone} foi BANIDA automaticamente.`);
          } else if (result.actionTaken === 'activated') {
            activatedCount++;
            this.logger.log(`🟢 [LinesScheduler] Linha ${line.phone} foi ATIVADA automaticamente.`);
          }

          checkedCount++;

        } catch (error: any) {
          this.logger.error(`❌ [LinesScheduler] Erro ao verificar linha ${line.phone}: ${error.message}`);
        }
      }

      this.logger.log(`✅ [LinesScheduler] Job Finalizado. Verificadas: ${checkedCount}, Banidas: ${bannedCount}, Reativadas: ${activatedCount}`);

    } catch (error) {
      this.logger.error('❌ [LinesScheduler] Erro fatal no Job de verificação:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Job que verifica operadores offline há > 72 horas e libera suas linhas
   * Executa a cada hora
   */
  @Cron(CronExpression.EVERY_HOUR)
  async releaseLinesFromOfflineOperators() {
    console.log('🔄 [LinesScheduler] Iniciando verificação de operadores offline há > 72 horas...');

    const seventyTwoHoursAgo = new Date();
    seventyTwoHoursAgo.setHours(seventyTwoHoursAgo.getHours() - 72);

    try {
      // Buscar operadores offline há mais de 72 horas que têm linhas atribuídas
      const offlineOperators = await this.prisma.user.findMany({
        where: {
          role: 'operator',
          status: 'Offline',
          updatedAt: {
            lte: seventyTwoHoursAgo, // Offline há mais de 72 horas
          },
          lineOperators: {
            some: {}, // Tem pelo menos uma linha atribuída
          },
        },
        include: {
          lineOperators: {
            include: {
              line: true,
            },
          },
        },
      });

      console.log(`📊 [LinesScheduler] Encontrados ${offlineOperators.length} operadores offline há > 72 horas com linhas atribuídas`);

      let releasedCount = 0;

      for (const operator of offlineOperators) {
        for (const lineOperator of operator.lineOperators) {
          try {
            // Desvincular operador da linha
            await this.prisma.lineOperator.delete({
              where: {
                id: lineOperator.id,
              },
            });

            // Atualizar campo legacy
            await this.prisma.user.update({
              where: { id: operator.id },
              data: { line: null },
            });

            // Se era o único operador da linha, limpar linkedTo
            const remainingOperators = await this.prisma.lineOperator.count({
              where: { lineId: lineOperator.lineId },
            });

            if (remainingOperators === 0) {
              await this.prisma.linesStock.update({
                where: { id: lineOperator.lineId },
                data: { linkedTo: null },
              });
            }

            releasedCount++;
            console.log(`✅ [LinesScheduler] Linha ${lineOperator.line.phone} liberada do operador ${operator.name} (offline há > 72h)`);
          } catch (error) {
            console.error(`❌ [LinesScheduler] Erro ao liberar linha ${lineOperator.lineId} do operador ${operator.id}:`, error);
          }
        }
      }

      console.log(`✅ [LinesScheduler] Processo concluído: ${releasedCount} linha(s) liberada(s)`);
    } catch (error) {
      console.error('❌ [LinesScheduler] Erro ao processar liberação de linhas:', error);
    }
  }
}

