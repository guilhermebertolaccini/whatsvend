/**
 * Script para criar/atualizar usuário admin padrão
 * Gera o hash correto da senha usando argon2
 * 
 * Uso: node backend/sql/create_admin_user.js
 */

const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('🔐 Criando/atualizando usuário admin...');

    const email = 'admin@taticamarketing.com.br';
    const password = 'Estreluda1.';
    const name = 'Admin';

    // Gerar hash da senha
    console.log('📝 Gerando hash da senha...');
    const hashedPassword = await argon2.hash(password);

    // Criar ou atualizar usuário
    const admin = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        password: hashedPassword,
        role: 'admin',
        status: 'Offline',
        identifier: 'proprietario',
        oneToOneActive: true,
      },
      create: {
        name,
        email,
        password: hashedPassword,
        role: 'admin',
        status: 'Offline',
        identifier: 'proprietario',
        oneToOneActive: true,
      },
    });

    console.log('✅ Usuário admin criado/atualizado com sucesso!');
    console.log('📧 Email:', admin.email);
    console.log('👤 Nome:', admin.name);
    console.log('🔑 Senha: Estreluda1.');
    console.log('🎭 Role:', admin.role);
  } catch (error) {
    console.error('❌ Erro ao criar usuário admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();

