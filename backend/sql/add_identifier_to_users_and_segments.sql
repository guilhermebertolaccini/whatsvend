-- ===================================================================
-- Migration: Adicionar campo Identifier (cliente/proprietario)
-- Descrição: Adiciona campo identifier nas tabelas User e Segment para filtrar relatórios
-- Data: 2025-01-XX
-- ===================================================================

-- 1. Criar enum Identifier se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Identifier') THEN
        CREATE TYPE "Identifier" AS ENUM ('cliente', 'proprietario');
    END IF;
END $$;

-- 2. Adicionar campo identifier na tabela User
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "identifier" "Identifier" NOT NULL DEFAULT 'proprietario';

-- Comentário
COMMENT ON COLUMN "User"."identifier" IS 'Identificador: cliente ou proprietario - usado para filtrar relatórios (cliente só vê seus dados, proprietario vê tudo)';

-- 3. Adicionar campo identifier na tabela Segment
ALTER TABLE "Segment"
ADD COLUMN IF NOT EXISTS "identifier" "Identifier" NOT NULL DEFAULT 'proprietario';

-- Comentário
COMMENT ON COLUMN "Segment"."identifier" IS 'Identificador: cliente ou proprietario - usado para filtrar relatórios';

-- 4. Criar índices para performance
CREATE INDEX IF NOT EXISTS "User_identifier_idx" ON "User"("identifier");
CREATE INDEX IF NOT EXISTS "Segment_identifier_idx" ON "Segment"("identifier");

-- 5. Verificar estrutura criada
SELECT
  'User.identifier' as campo,
  COUNT(*) FILTER (WHERE "identifier" = 'cliente') as clientes,
  COUNT(*) FILTER (WHERE "identifier" = 'proprietario') as proprietarios
FROM "User"
UNION ALL
SELECT
  'Segment.identifier' as campo,
  COUNT(*) FILTER (WHERE "identifier" = 'cliente') as clientes,
  COUNT(*) FILTER (WHERE "identifier" = 'proprietario') as proprietarios
FROM "Segment";

-- ===================================================================
-- FIM DA MIGRATION
-- ===================================================================

