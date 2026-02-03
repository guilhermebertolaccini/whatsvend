-- ===================================================================
-- ADICIONAR TABELA ConversationOperatorBinding
-- Descrição: Vínculo entre conversa (contactPhone + lineId) e operador por 24 horas
-- Garante que respostas sempre vão para o mesmo operador
-- Data: 2025-01-XX
-- ===================================================================

BEGIN;

-- Criar tabela ConversationOperatorBinding se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'ConversationOperatorBinding'
  ) THEN
    CREATE TABLE "ConversationOperatorBinding" (
      "id" SERIAL NOT NULL,
      "contactPhone" TEXT NOT NULL,
      "lineId" INTEGER NOT NULL,
      "userId" INTEGER NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "ConversationOperatorBinding_pkey" PRIMARY KEY ("id")
    );

    RAISE NOTICE 'Tabela ConversationOperatorBinding criada com sucesso';
  ELSE
    RAISE NOTICE 'Tabela ConversationOperatorBinding já existe';
  END IF;
END $$;

-- Criar constraint única para contactPhone + lineId se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'ConversationOperatorBinding_contactPhone_lineId_key'
  ) THEN
    CREATE UNIQUE INDEX "ConversationOperatorBinding_contactPhone_lineId_key" 
    ON "ConversationOperatorBinding"("contactPhone", "lineId");
    RAISE NOTICE 'Constraint única contactPhone_lineId criada com sucesso';
  ELSE
    RAISE NOTICE 'Constraint única contactPhone_lineId já existe';
  END IF;
END $$;

-- Criar índice para contactPhone + lineId se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'ConversationOperatorBinding_contactPhone_lineId_idx'
  ) THEN
    CREATE INDEX "ConversationOperatorBinding_contactPhone_lineId_idx" 
    ON "ConversationOperatorBinding"("contactPhone", "lineId");
    RAISE NOTICE 'Índice contactPhone_lineId criado com sucesso';
  ELSE
    RAISE NOTICE 'Índice contactPhone_lineId já existe';
  END IF;
END $$;

-- Criar índice para userId se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'ConversationOperatorBinding_userId_idx'
  ) THEN
    CREATE INDEX "ConversationOperatorBinding_userId_idx" 
    ON "ConversationOperatorBinding"("userId");
    RAISE NOTICE 'Índice userId criado com sucesso';
  ELSE
    RAISE NOTICE 'Índice userId já existe';
  END IF;
END $$;

-- Criar índice para expiresAt se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'ConversationOperatorBinding_expiresAt_idx'
  ) THEN
    CREATE INDEX "ConversationOperatorBinding_expiresAt_idx" 
    ON "ConversationOperatorBinding"("expiresAt");
    RAISE NOTICE 'Índice expiresAt criado com sucesso';
  ELSE
    RAISE NOTICE 'Índice expiresAt já existe';
  END IF;
END $$;

-- Criar função para atualizar updatedAt (se não existir)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $function$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- Adicionar trigger para atualizar updatedAt automaticamente
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'ConversationOperatorBinding_updatedAt'
  ) THEN
    CREATE TRIGGER "ConversationOperatorBinding_updatedAt"
    BEFORE UPDATE ON "ConversationOperatorBinding"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

    RAISE NOTICE 'Trigger updatedAt criado com sucesso';
  ELSE
    RAISE NOTICE 'Trigger updatedAt já existe';
  END IF;
END $$;

COMMIT;

-- Comentários para documentação (executados após COMMIT)
COMMENT ON TABLE "ConversationOperatorBinding" IS 'Vínculo entre conversa (contactPhone + lineId) e operador por 24 horas. Garante que respostas sempre vão para o mesmo operador.';
COMMENT ON COLUMN "ConversationOperatorBinding"."contactPhone" IS 'Telefone do contato';
COMMENT ON COLUMN "ConversationOperatorBinding"."lineId" IS 'ID da linha utilizada';
COMMENT ON COLUMN "ConversationOperatorBinding"."userId" IS 'ID do operador vinculado';
COMMENT ON COLUMN "ConversationOperatorBinding"."expiresAt" IS 'Data de expiração do vínculo (24 horas após criação)';

