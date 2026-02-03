import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(async () => {
  // Setup antes de todos os testes
});

afterAll(async () => {
  // Cleanup após todos os testes
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Setup antes de cada teste
});

afterEach(async () => {
  // Cleanup após cada teste
});


