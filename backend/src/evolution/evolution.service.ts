import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateEvolutionDto } from './dto/create-evolution.dto';
import { UpdateEvolutionDto } from './dto/update-evolution.dto';
import axios from 'axios';

@Injectable()
export class EvolutionService {
  constructor(private prisma: PrismaService) {}

  async create(createEvolutionDto: CreateEvolutionDto) {
    const existing = await this.prisma.evolution.findUnique({
      where: { evolutionName: createEvolutionDto.evolutionName },
    });

    if (existing) {
      throw new ConflictException('Evolution com este nome já existe');
    }

    // Testar conexão com a Evolution API
    try {
      await axios.get(`${createEvolutionDto.evolutionUrl}/manager/getInstances`, {
        headers: {
          'apikey': createEvolutionDto.evolutionKey,
        },
      });
    } catch (error) {
      throw new Error('Não foi possível conectar à Evolution API. Verifique a URL e a chave.');
    }

    return this.prisma.evolution.create({
      data: createEvolutionDto,
    });
  }

  async findAll() {
    return this.prisma.evolution.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const evolution = await this.prisma.evolution.findUnique({
      where: { id },
    });

    if (!evolution) {
      throw new NotFoundException(`Evolution com ID ${id} não encontrada`);
    }

    return evolution;
  }

  async findByName(evolutionName: string) {
    return this.prisma.evolution.findUnique({
      where: { evolutionName },
    });
  }

  async update(id: number, updateEvolutionDto: UpdateEvolutionDto) {
    await this.findOne(id);

    return this.prisma.evolution.update({
      where: { id },
      data: updateEvolutionDto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.evolution.delete({
      where: { id },
    });
  }

  async testConnection(evolutionName: string) {
    const evolution = await this.findByName(evolutionName);
    
    if (!evolution) {
      throw new NotFoundException('Evolution não encontrada');
    }

    try {
      const response = await axios.get(`${evolution.evolutionUrl}/manager/getInstances`, {
        headers: {
          'apikey': evolution.evolutionKey,
        },
      });

      return {
        success: true,
        message: 'Conexão estabelecida com sucesso',
        instances: response.data,
      };
    } catch (error) {
      throw new Error(`Erro ao conectar: ${error.response?.data?.message || error.message}`);
    }
  }
}
