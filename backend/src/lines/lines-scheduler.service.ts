import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LinesSchedulerService {
  constructor(private prisma: PrismaService) {}

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

