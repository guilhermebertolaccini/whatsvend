import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateBlocklistDto } from './dto/create-blocklist.dto';
import { UpdateBlocklistDto } from './dto/update-blocklist.dto';

@Injectable()
export class BlocklistService {
  constructor(private prisma: PrismaService) {}

  async create(createBlocklistDto: CreateBlocklistDto) {
    return this.prisma.blockList.create({
      data: createBlocklistDto,
    });
  }

  async findAll(search?: string) {
    return this.prisma.blockList.findMany({
      where: search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { cpf: { contains: search } },
        ],
      } : undefined,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const blocklist = await this.prisma.blockList.findUnique({
      where: { id },
    });

    if (!blocklist) {
      throw new NotFoundException(`Blocklist com ID ${id} não encontrado`);
    }

    return blocklist;
  }

  async isBlocked(phone?: string, cpf?: string): Promise<boolean> {
    const blocked = await this.prisma.blockList.findFirst({
      where: {
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(cpf ? [{ cpf }] : []),
        ],
      },
    });

    return !!blocked;
  }

  async update(id: number, updateBlocklistDto: UpdateBlocklistDto) {
    await this.findOne(id);

    return this.prisma.blockList.update({
      where: { id },
      data: updateBlocklistDto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.blockList.delete({
      where: { id },
    });
  }
}
