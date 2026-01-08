import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import csv from 'csv-parser';
import { Readable } from 'stream';

@Injectable()
export class SegmentsService {
  constructor(private prisma: PrismaService) {}

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
    await this.findOne(id);

    return this.prisma.segment.update({
      where: { id },
      data: updateSegmentDto,
    });
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
