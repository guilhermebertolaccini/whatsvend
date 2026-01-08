import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    const isPasswordValid = await argon2.verify(user.password, password);

    if (!isPasswordValid) {
      return null;
    }

    const { password: _, ...result } = user;
    return result;
  }

  async login(user: any) {
    // Atualizar dados do login: status para Online (operadores)
    // Para todos os usuários, fazer um update mínimo para garantir que updatedAt seja atualizado
    const updateData: any = {};
    if (user.role === 'operator') {
      updateData.status = 'Online';
    } else {
      // Para não-operadores, fazer um update que não muda nada mas garante updatedAt seja atualizado
      // Atualizar o name com o mesmo valor força o Prisma a atualizar updatedAt
      updateData.name = user.name;
    }
    
    await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        segment: user.segment,
        line: user.line,
        status: user.role === 'operator' ? 'Online' : user.status,
      },
    };
  }

  async logout(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    // Se o usuário for operator, atualizar status para Offline
    if (user && user.role === 'operator') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: 'Offline' },
      });
    }

    return { message: 'Logout realizado com sucesso' };
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
