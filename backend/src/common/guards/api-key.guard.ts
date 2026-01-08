import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Token de autenticação não fornecido');
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const validApiKey = this.configService.get<string>('API_KEY') || 'default-api-key-change-me';

    if (token !== validApiKey) {
      throw new UnauthorizedException('Token de autenticação inválido');
    }

    return true;
  }
}

