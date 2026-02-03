import { Test, TestingModule } from '@nestjs/testing';
import { LineAssignmentService } from './line-assignment.service';
import { PrismaService } from '../prisma.service';
import { LinesService } from '../lines/lines.service';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { AppLoggerService } from '../logger/logger.service';

describe('LineAssignmentService', () => {
  let service: LineAssignmentService;
  let prismaService: PrismaService;
  let linesService: LinesService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    linesStock: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockLinesService = {
    assignOperatorToLine: jest.fn(),
  };

  const mockControlPanelService = {
    getActiveEvolutions: jest.fn(),
    filterLinesByActiveEvolutions: jest.fn(),
  };

  const mockLoggerService = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LineAssignmentService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: LinesService,
          useValue: mockLinesService,
        },
        {
          provide: ControlPanelService,
          useValue: mockControlPanelService,
        },
        {
          provide: AppLoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<LineAssignmentService>(LineAssignmentService);
    prismaService = module.get<PrismaService>(PrismaService);
    linesService = module.get<LinesService>(LinesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAvailableLineForOperator', () => {
    it('deve retornar linha existente se operador já tem linha ativa', async () => {
      const mockUser = {
        id: 1,
        name: 'Test Operator',
        line: 100,
        segment: 1,
        lineOperators: [],
      };

      const mockLine = {
        id: 100,
        phone: '5511999999999',
        lineStatus: 'active',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.linesStock.findUnique.mockResolvedValue(mockLine);

      const result = await service.findAvailableLineForOperator(1, 1);

      expect(result.success).toBe(true);
      expect(result.lineId).toBe(100);
      expect(result.linePhone).toBe('5511999999999');
    });

    it('deve retornar erro se usuário não existe', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findAvailableLineForOperator(999, 1);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Usuário não encontrado');
    });

    it('deve atribuir nova linha se operador não tem linha', async () => {
      const mockUser = {
        id: 1,
        name: 'Test Operator',
        line: null,
        segment: 1,
        lineOperators: [],
      };

      const mockAvailableLines = [
        {
          id: 200,
          phone: '5511888888888',
          lineStatus: 'active',
          segment: 1,
          operators: [],
        },
      ];

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockControlPanelService.getActiveEvolutions.mockResolvedValue(null);
      mockControlPanelService.filterLinesByActiveEvolutions.mockResolvedValue(
        mockAvailableLines,
      );
      mockLinesService.assignOperatorToLine.mockResolvedValue(undefined);

      const result = await service.findAvailableLineForOperator(1, 1);

      expect(result.success).toBe(true);
      expect(result.lineId).toBe(200);
      expect(mockLinesService.assignOperatorToLine).toHaveBeenCalledWith(200, 1);
    });
  });
});


