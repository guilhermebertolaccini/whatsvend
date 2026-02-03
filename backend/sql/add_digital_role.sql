-- =====================================================
-- Script para adicionar role 'digital' ao enum Role
-- =====================================================
-- 
-- INSTRUÇÕES:
-- 1. Execute primeiro a query de verificação para ver se 'digital' já existe
-- 2. Se não existir, execute o comando ALTER TYPE
-- 3. Se já existir, você verá um erro que pode ser ignorado
--
-- IMPORTANTE: ALTER TYPE ... ADD VALUE não pode ser executado dentro de uma transação
-- Execute diretamente no banco de dados (psql, pgAdmin, etc)
--
-- =====================================================

-- PASSO 1: Verificar se 'digital' já existe no enum Role
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM pg_enum 
            WHERE enumlabel = 'digital' 
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')
        ) THEN '✅ O valor "digital" JÁ EXISTE no enum Role - não é necessário executar o ALTER TYPE'
        ELSE '⚠️  O valor "digital" NÃO EXISTE - execute o comando ALTER TYPE abaixo'
    END as status;

-- PASSO 2: Adicionar 'digital' ao enum Role (execute apenas se não existir)
-- Se já existir, você receberá um erro que pode ser ignorado
ALTER TYPE "Role" ADD VALUE 'digital';

-- PASSO 3: Verificar todos os valores atuais do enum Role
SELECT 
    enumlabel as role_value,
    CASE 
        WHEN enumlabel = 'digital' THEN '✅ Adicionado'
        ELSE ''
    END as status
FROM pg_enum
WHERE enumtypid = (
    SELECT oid 
    FROM pg_type 
    WHERE typname = 'Role'
)
ORDER BY enumsortorder;
