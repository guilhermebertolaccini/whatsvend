import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTabulationDto } from './dto/create-tabulation.dto';
import { UpdateTabulationDto } from './dto/update-tabulation.dto';

@Injectable()
export class TabulationsService {
  constructor(private prisma: PrismaService) {}

  async create(createTabulationDto: CreateTabulationDto) {
    return this.prisma.tabulation.create({
      data: createTabulationDto,
    });
  }

  async findAll(search?: string) {
    return this.prisma.tabulation.findMany({
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
    const tabulation = await this.prisma.tabulation.findUnique({
      where: { id },
    });

    if (!tabulation) {
      throw new NotFoundException(`Tabulação com ID ${id} não encontrada`);
    }

    return tabulation;
  }

  async update(id: number, updateTabulationDto: UpdateTabulationDto) {
    await this.findOne(id);

    return this.prisma.tabulation.update({
      where: { id },
      data: updateTabulationDto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.tabulation.delete({
      where: { id },
    });
  }
}
