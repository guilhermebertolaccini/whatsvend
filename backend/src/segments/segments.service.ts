import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import csv from 'csv-parser';
import { Readable } from 'stream';

@Injectable()
export class SegmentsService {
  constructor(private prisma: PrismaService) { }

  async create(createSegmentDto: CreateSegmentDto) {
    const existing = await this.prisma.segment.findUnique({
      where: { name: createSegmentDto.name },
    });

    if (existing) {
      throw new ConflictException('Segmento com este nome já existe');
    }

    return this.prisma.segment.create({
      data: createSegmentDto,
    });
  }

  async findAll(search?: string) {
    return this.prisma.segment.findMany({
      where: search ? {
        name: {
          contains: search,
          mode: 'insensitive',
        },
      } : undefined,
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: number) {
    const segment = await this.prisma.segment.findUnique({
      where: { id },
    });

    if (!segment) {
      throw new NotFoundException(`Segmento com ID ${id} não encontrado`);
    }

    return segment;
  }

  async update(id: number, updateSegmentDto: UpdateSegmentDto) {
    const segment = await this.findOne(id);

    // Atualizar segmento primeiro
    const updatedSegment = await this.prisma.segment.update({
      where: { id },
      data: updateSegmentDto,
    });

    // Se maxOperatorsPerLine foi alterado, aplicar limite às linhas existentes
    if (updateSegmentDto.maxOperatorsPerLine !== undefined &&
      updateSegmentDto.maxOperatorsPerLine !== segment.maxOperatorsPerLine) {
      await this.enforceOperatorLimitForSegment(id, updateSegmentDto.maxOperatorsPerLine);
    }

    return updatedSegment;
  }

  /**
   * Garante que todas as linhas de um segmento respeitem o limite máximo de operadores.
   * Remove operadores excedentes aleatoriamente e os adiciona à fila para realocação.
   */
  async enforceOperatorLimitForSegment(segmentId: number, maxOperators: number) {
    console.log(`🔧 [SegmentsService] Aplicando limite de ${maxOperators} operador(es) por linha ao segmento ${segmentId}`);

    // Buscar todas as linhas do segmento com seus operadores
    const linesInSegment = await this.prisma.linesStock.findMany({
      where: {
        segment: segmentId,
        lineStatus: 'active',
      },
      include: {
        operators: {
          include: {
            user: true,
          },
        },
      },
    });

    let totalOperatorsRemoved = 0;

    for (const line of linesInSegment) {
      const currentOperatorCount = line.operators.length;

      if (currentOperatorCount > maxOperators) {
        const excessCount = currentOperatorCount - maxOperators;
        console.log(`📋 [SegmentsService] Linha ${line.phone}: ${currentOperatorCount} operadores, removendo ${excessCount}`);

        // Selecionar operadores para manter (aleatório) - embaralhar e pegar os primeiros N
        const shuffledOperators = [...line.operators].sort(() => Math.random() - 0.5);
        const operatorsToRemove = shuffledOperators.slice(maxOperators);

        for (const lineOperator of operatorsToRemove) {
          // Remover vínculo
          await this.prisma.lineOperator.delete({
            where: { id: lineOperator.id },
          });

          // Limpar campo legacy
          await this.prisma.user.update({
            where: { id: lineOperator.userId },
            data: { line: null },
          });

          console.log(`🔗 [SegmentsService] Operador ${lineOperator.user?.name || lineOperator.userId} desvinculado da linha ${line.phone}`);

          // Se operador está online, adicionar à fila para realocação
          if (lineOperator.user?.status === 'Online') {
            // Verificar se já está na fila
            const existingEntry = await this.prisma.operatorQueue.findFirst({
              where: { userId: lineOperator.userId },
            });

            if (!existingEntry) {
              await this.prisma.operatorQueue.create({
                data: {
                  userId: lineOperator.userId,
                  segmentId: lineOperator.user.segment,
                  priority: 1,
                },
              });
              console.log(`📋 [SegmentsService] Operador ${lineOperator.user?.name} adicionado à fila de realocação`);
            }
          }

          totalOperatorsRemoved++;
        }

        // Atualizar linkedTo (campo legacy) - manter o primeiro operador que ficou
        const remainingOperator = shuffledOperators[0];
        await this.prisma.linesStock.update({
          where: { id: line.id },
          data: { linkedTo: remainingOperator?.userId || null },
        });
      }
    }

    if (totalOperatorsRemoved > 0) {
      console.log(`✅ [SegmentsService] Limite aplicado: ${totalOperatorsRemoved} operador(es) removido(s) no segmento ${segmentId}`);
    } else {
      console.log(`✅ [SegmentsService] Nenhum operador precisou ser removido no segmento ${segmentId}`);
    }

    return totalOperatorsRemoved;
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.segment.delete({
      where: { id },
    });
  }

  async importFromCSV(file: Express.Multer.File): Promise<{ success: number; errors: string[] }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Arquivo CSV não fornecido');
    }

    const results: any[] = [];
    const errors: string[] = [];
    let successCount = 0;
    const processedNames = new Set<string>();

    return new Promise((resolve, reject) => {
      const stream = Readable.from(file.buffer.toString('utf-8'));

      stream
        .pipe(csv({ separator: ';' }))
        .on('data', (data) => {
          // Filtrar linhas vazias manualmente
          const hasData = Object.values(data).some(value => value && String(value).trim() !== '');
          if (hasData) {
            results.push(data);
          }
        })
        .on('end', async () => {
          console.log(`📊 Processando ${results.length} linhas do CSV de segmentos`);

          for (const row of results) {
            try {
              // Tentar diferentes nomes de coluna
              const name = row['Nome']?.trim() || row['Name']?.trim() || row['Segmento']?.trim() || row['Segment']?.trim();

              if (!name) {
                errors.push(`Linha ignorada: Nome vazio`);
                continue;
              }

              // Normalizar nome (uppercase para comparação)
              const normalizedName = name.toLowerCase();

              // Verificar se já processamos este nome nesta importação
              if (processedNames.has(normalizedName)) {
                continue; // Pular duplicatas no mesmo CSV
              }

              processedNames.add(normalizedName);

              // Verificar se segmento já existe
              const existing = await this.prisma.segment.findFirst({
                where: {
                  name: {
                    equals: name,
                    mode: 'insensitive',
                  },
                },
              });

              if (existing) {
                errors.push(`Segmento já existe: ${name}`);
                continue;
              }

              // Criar segmento
              await this.prisma.segment.create({
                data: { name },
              });

              successCount++;
              console.log(`✅ Segmento criado: ${name}`);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
              errors.push(`Erro ao processar linha: ${errorMsg}`);
              console.error('❌ Erro ao processar linha do CSV:', error);
            }
          }

          resolve({ success: successCount, errors });
        })
        .on('error', (error) => {
          reject(new BadRequestException(`Erro ao processar CSV: ${error.message}`));
        });
    });
  }
}
