-- ===================================================================
-- CONSOLIDATED MIGRATIONS - Deploy Completo
-- Descrição: Todas as alterações necessárias para o deploy
-- Data: 2025-01-XX
-- ===================================================================
-- Este arquivo consolida todas as migrations necessárias:
-- 1. Adicionar campo identifier (cliente/proprietario) em User e Segment
-- 2. Adicionar campo isAdminTest (teste administrador) em Conversation e Campaign
-- ===================================================================

BEGIN;

-- ===================================================================
-- 1. ADICIONAR CAMPO IDENTIFIER (cliente/proprietario)
-- ===================================================================

-- 1.1. Criar enum Identifier se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Identifier') THEN
    CREATE TYPE "Identifier" AS ENUM ('cliente', 'proprietario');
    RAISE NOTICE 'Enum Identifier criado com sucesso';
  ELSE
    RAISE NOTICE 'Enum Identifier já existe';
  END IF;
END $$;

-- 1.2. Adicionar campo identifier na tabela User
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'User' AND column_name = 'identifier'
  ) THEN
    -- Primeiro adicionar a coluna como nullable temporariamente para permitir DEFAULT
    ALTER TABLE "User" ADD COLUMN "identifier" "Identifier";
    -- Atualizar valores existentes (se houver) - padrão: proprietario (vê tudo)
    UPDATE "User" SET "identifier" = 'proprietario' WHERE "identifier" IS NULL;
    -- Tornar NOT NULL com DEFAULT
    ALTER TABLE "User" ALTER COLUMN "identifier" SET NOT NULL;
    ALTER TABLE "User" ALTER COLUMN "identifier" SET DEFAULT 'proprietario';
    CREATE INDEX IF NOT EXISTS "User_identifier_idx" ON "User"("identifier");
    RAISE NOTICE 'Campo identifier adicionado à tabela User';
  ELSE
    RAISE NOTICE 'Campo identifier já existe na tabela User';
  END IF;
END $$;

-- 1.3. Adicionar campo identifier na tabela Segment
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Segment' AND column_name = 'identifier'
  ) THEN
    -- Primeiro adicionar a coluna como nullable temporariamente para permitir DEFAULT
    ALTER TABLE "Segment" ADD COLUMN "identifier" "Identifier";
    -- Atualizar valores existentes (se houver)
    UPDATE "Segment" SET "identifier" = 'proprietario' WHERE "identifier" IS NULL;
    -- Tornar NOT NULL com DEFAULT
    ALTER TABLE "Segment" ALTER COLUMN "identifier" SET NOT NULL;
    ALTER TABLE "Segment" ALTER COLUMN "identifier" SET DEFAULT 'proprietario';
    RAISE NOTICE 'Campo identifier adicionado à tabela Segment';
  ELSE
    RAISE NOTICE 'Campo identifier já existe na tabela Segment';
  END IF;
END $$;

-- 1.4. Comentários
COMMENT ON COLUMN "User"."identifier" IS 'cliente ou proprietario - usado para filtrar relatórios';
COMMENT ON COLUMN "Segment"."identifier" IS 'cliente ou proprietario - usado para filtrar relatórios';

-- ===================================================================
-- 2. ADICIONAR CAMPO ISADMINTEST (teste administrador)
-- ===================================================================

-- 2.1. Adicionar campo isAdminTest na tabela Conversation
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Conversation' AND column_name = 'isAdminTest'
  ) THEN
    ALTER TABLE "Conversation" ADD COLUMN "isAdminTest" BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS "Conversation_isAdminTest_idx" ON "Conversation"("isAdminTest");
    RAISE NOTICE 'Campo isAdminTest adicionado à tabela Conversation';
  ELSE
    RAISE NOTICE 'Campo isAdminTest já existe na tabela Conversation';
  END IF;
END $$;

-- 2.2. Adicionar campo isAdminTest na tabela Campaign
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Campaign' AND column_name = 'isAdminTest'
  ) THEN
    ALTER TABLE "Campaign" ADD COLUMN "isAdminTest" BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS "Campaign_isAdminTest_idx" ON "Campaign"("isAdminTest");
    RAISE NOTICE 'Campo isAdminTest adicionado à tabela Campaign';
  ELSE
    RAISE NOTICE 'Campo isAdminTest já existe na tabela Campaign';
  END IF;
END $$;

-- 2.3. Comentários
COMMENT ON COLUMN "Conversation"."isAdminTest" IS 'Se true, é ação de teste administrador e não aparece nos relatórios';
COMMENT ON COLUMN "Campaign"."isAdminTest" IS 'Se true, é ação de teste administrador e não aparece nos relatórios';

-- ===================================================================
-- 3. VALIDAÇÃO FINAL
-- ===================================================================

-- Verificar se todas as alterações foram aplicadas corretamente
DO $$
DECLARE
  user_identifier_exists BOOLEAN;
  segment_identifier_exists BOOLEAN;
  conversation_isadmintest_exists BOOLEAN;
  campaign_isadmintest_exists BOOLEAN;
BEGIN
  -- Verificar User.identifier
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'User' AND column_name = 'identifier'
  ) INTO user_identifier_exists;

  -- Verificar Segment.identifier
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Segment' AND column_name = 'identifier'
  ) INTO segment_identifier_exists;

  -- Verificar Conversation.isAdminTest
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Conversation' AND column_name = 'isAdminTest'
  ) INTO conversation_isadmintest_exists;

  -- Verificar Campaign.isAdminTest
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Campaign' AND column_name = 'isAdminTest'
  ) INTO campaign_isadmintest_exists;

  -- Relatório final
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RELATÓRIO DE MIGRAÇÃO:';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'User.identifier: %', CASE WHEN user_identifier_exists THEN 'OK' ELSE 'FALTANDO' END;
  RAISE NOTICE 'Segment.identifier: %', CASE WHEN segment_identifier_exists THEN 'OK' ELSE 'FALTANDO' END;
  RAISE NOTICE 'Conversation.isAdminTest: %', CASE WHEN conversation_isadmintest_exists THEN 'OK' ELSE 'FALTANDO' END;
  RAISE NOTICE 'Campaign.isAdminTest: %', CASE WHEN campaign_isadmintest_exists THEN 'OK' ELSE 'FALTANDO' END;
  RAISE NOTICE '========================================';

  IF NOT (user_identifier_exists AND segment_identifier_exists AND 
          conversation_isadmintest_exists AND campaign_isadmintest_exists) THEN
    RAISE WARNING 'Algumas colunas não foram criadas. Verifique os logs acima.';
  ELSE
    RAISE NOTICE 'Todas as migrations foram aplicadas com sucesso!';
  END IF;
END $$;

-- ===================================================================
-- 4. ESTATÍSTICAS (Opcional - para referência)
-- ===================================================================

-- Mostrar estatísticas dos campos criados
SELECT 
  'User.identifier' as campo,
  COUNT(*) FILTER (WHERE "identifier" = 'cliente') as total_cliente,
  COUNT(*) FILTER (WHERE "identifier" = 'proprietario') as total_proprietario,
  COUNT(*) as total
FROM "User"
UNION ALL
SELECT 
  'Segment.identifier' as campo,
  COUNT(*) FILTER (WHERE "identifier" = 'cliente') as total_cliente,
  COUNT(*) FILTER (WHERE "identifier" = 'proprietario') as total_proprietario,
  COUNT(*) as total
FROM "Segment"
UNION ALL
SELECT 
  'Conversation.isAdminTest' as campo,
  COUNT(*) FILTER (WHERE "isAdminTest" = true) as total_cliente,
  COUNT(*) FILTER (WHERE "isAdminTest" = false) as total_proprietario,
  COUNT(*) as total
FROM "Conversation"
UNION ALL
SELECT 
  'Campaign.isAdminTest' as campo,
  COUNT(*) FILTER (WHERE "isAdminTest" = true) as total_cliente,
  COUNT(*) FILTER (WHERE "isAdminTest" = false) as total_proprietario,
  COUNT(*) as total
FROM "Campaign";

COMMIT;

-- ===================================================================
-- FIM DA MIGRATION CONSOLIDADA
-- ===================================================================
-- 
-- IMPORTANTE: 
-- - Este script é idempotente e pode ser executado múltiplas vezes
-- - Todas as alterações são feitas dentro de uma transação (BEGIN/COMMIT)
-- - Em caso de erro, todas as alterações serão revertidas (ROLLBACK)
-- - Verifique os logs do PostgreSQL para confirmar o sucesso
-- 
-- PRÓXIMOS PASSOS APÓS O DEPLOY:
-- 1. Execute o Prisma generate: npx prisma generate
-- 2. Reinicie o backend
-- 3. Teste as funcionalidades:
--    - Criar/editar usuários e segmentos com campo identificador
--    - Gerar relatórios (devem filtrar por identificador)
--    - Usar botão "Teste Admin" no atendimento (apenas admins)
--    - Verificar que ações de teste não aparecem nos relatórios
--    - Testar relatório de linhas com opção "apenas movimentadas"
-- ===================================================================

