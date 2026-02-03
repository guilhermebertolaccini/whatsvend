-- Adicionar campos de arquivamento na tabela Conversation
ALTER TABLE "Conversation" 
ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP;

-- Criar índice para melhorar performance de queries de arquivamento
CREATE INDEX IF NOT EXISTS "Conversation_archived_datetime_idx" 
ON "Conversation"("archived", "datetime");

CREATE INDEX IF NOT EXISTS "Conversation_archivedAt_idx" 
ON "Conversation"("archivedAt");


