import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService) {}

  async create(createTagDto: CreateTagDto) {
    const existingTag = await this.prisma.tag.findUnique({
      where: { name: createTagDto.name },
    });

    if (existingTag) {
      throw new ConflictException('Tag com este nome já existe');
    }

    return this.prisma.tag.create({
      data: createTagDto,
    });
  }

  async findAll(filters?: any) {
    const { search, ...validFilters } = filters || {};
    
    const where = search 
      ? {
          ...validFilters,
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }
      : validFilters;

    return this.prisma.tag.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new NotFoundException(`Tag com ID ${id} não encontrada`);
    }

    return tag;
  }

  async findByName(name: string) {
    return this.prisma.tag.findUnique({
      where: { name },
    });
  }

  async update(id: number, updateTagDto: UpdateTagDto) {
    await this.findOne(id);

    // Se estiver atualizando o nome, verificar se já existe
    if (updateTagDto.name) {
      const existingTag = await this.prisma.tag.findFirst({
        where: {
          name: updateTagDto.name,
          id: { not: id },
        },
      });

      if (existingTag) {
        throw new ConflictException('Tag com este nome já existe');
      }
    }

    // Limpar campos vazios
    const cleanData: any = { ...updateTagDto };
    if (cleanData.segment === '' || cleanData.segment === undefined) {
      cleanData.segment = null;
    }

    return this.prisma.tag.update({
      where: { id },
      data: cleanData,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.tag.delete({
      where: { id },
    });
  }
}

