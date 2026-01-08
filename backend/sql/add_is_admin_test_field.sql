-- ===================================================================
-- Migration: Adicionar campo isAdminTest (teste administrador)
-- Descrição: Adiciona campo isAdminTest nas tabelas Conversation e Campaign
--            para marcar ações de teste administrador que não aparecem nos relatórios
-- Data: 2025-01-XX
-- ===================================================================

-- 1. Adicionar campo isAdminTest na tabela Conversation
ALTER TABLE "Conversation"
ADD COLUMN IF NOT EXISTS "isAdminTest" BOOLEAN NOT NULL DEFAULT false;

-- Comentário
COMMENT ON COLUMN "Conversation"."isAdminTest" IS 'Se true, é ação de teste administrador e não aparece nos relatórios';

-- 2. Adicionar campo isAdminTest na tabela Campaign
ALTER TABLE "Campaign"
ADD COLUMN IF NOT EXISTS "isAdminTest" BOOLEAN NOT NULL DEFAULT false;

-- Comentário
COMMENT ON COLUMN "Campaign"."isAdminTest" IS 'Se true, é ação de teste administrador e não aparece nos relatórios';

-- 3. Criar índices para performance (se necessário para filtros)
CREATE INDEX IF NOT EXISTS "Conversation_isAdminTest_idx" ON "Conversation"("isAdminTest");
CREATE INDEX IF NOT EXISTS "Campaign_isAdminTest_idx" ON "Campaign"("isAdminTest");

-- 4. Verificar estrutura criada
SELECT
  'Conversation.isAdminTest' as campo,
  COUNT(*) FILTER (WHERE "isAdminTest" = true) as testes_administrador,
  COUNT(*) FILTER (WHERE "isAdminTest" = false) as acoes_normais
FROM "Conversation"
UNION ALL
SELECT
  'Campaign.isAdminTest' as campo,
  COUNT(*) FILTER (WHERE "isAdminTest" = true) as testes_administrador,
  COUNT(*) FILTER (WHERE "isAdminTest" = false) as acoes_normais
FROM "Campaign";

-- ===================================================================
-- FIM DA MIGRATION
-- ===================================================================

