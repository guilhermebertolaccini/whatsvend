// Seed script para criar usuário admin
// Execute com: npx ts-node prisma/seed-admin.ts

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
    const email = 'daniel@tatica.com';
    const password = 'abc123';

    // Gerar hash com argon2
    const hashedPassword = await argon2.hash(password);

    console.log('🔐 Hash gerado:', hashedPassword);

    // Upsert do usuário
    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            role: 'admin',
            isActive: true,
        },
        create: {
            name: 'Daniel',
            email,
            password: hashedPassword,
            role: 'admin',
            status: 'Offline',
            oneToOneActive: true,
            isActive: true,
        },
    });

    console.log('✅ Usuário criado/atualizado:', user.email);
    console.log('📧 Email:', email);
    console.log('🔑 Senha:', password);
}

main()
    .catch((e) => {
        console.error('❌ Erro:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
