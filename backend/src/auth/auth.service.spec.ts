import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('deve retornar usuário quando credenciais são válidas', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Test User',
        role: 'operator',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      // Mock bcrypt compare
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
      });
    });

    it('deve lançar UnauthorizedException quando usuário não existe', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateUser('invalid@example.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException quando senha é inválida', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: '$2b$10$hashedpassword',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);

      await expect(
        service.validateUser('test@example.com', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('deve retornar token JWT quando login é bem-sucedido', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'operator',
      };

      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.login(mockUser);

      expect(result).toEqual({
        access_token: 'mock-jwt-token',
        user: mockUser,
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });
  });
});


