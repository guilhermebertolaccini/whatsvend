import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as argon2 from 'argon2';

import { OperatorQueueService } from '../operator-queue/operator-queue.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private queueService: OperatorQueueService,
  ) { }

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
    const updateData: any = {};
    if (user.role === 'operator') {
      updateData.status = 'Online';
    } else {
      updateData.name = user.name;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Se for operador, tentar alocar linha IMEDIATAMENTE após login
    if (user.role === 'operator') {
      console.log(`⚡ [Auth] Login de operador ${user.name} (ID: ${user.id}) - Iniciando alocação imediata de linha`);

      // Executar em background para não bloquear o response do login
      setImmediate(async () => {
        try {
          // Verificar se já tem linha
          const existingLine = await this.prisma.lineOperator.findFirst({
            where: { userId: user.id }
          });

          if (!existingLine && !user.line) {
            // Adicionar à fila e processar imediatamente
            await this.queueService.addToQueue(user.id, user.segment || null, 0);
            await this.queueService.processQueue();
            console.log(`✅ [Auth] Alocação imediata processada para ${user.name}`);
          } else {
            console.log(`ℹ️ [Auth] Operador ${user.name} já possui linha, pulando alocação`);
          }
        } catch (error) {
          console.error(`❌ [Auth] Erro na alocação imediata pós-login: ${error.message}`);
        }
      });
    }

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
