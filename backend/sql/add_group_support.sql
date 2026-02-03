-- Script para adicionar suporte a grupos (mensagens de grupo do WhatsApp)
-- Este script adiciona campos para identificar e processar mensagens de grupos

-- Adicionar campos de grupo na tabela Conversation
DO $$
BEGIN
  -- Adicionar campo isGroup
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Conversation' AND column_name = 'isGroup'
  ) THEN
    ALTER TABLE "Conversation" ADD COLUMN "isGroup" BOOLEAN NOT NULL DEFAULT false;
    COMMENT ON COLUMN "Conversation"."isGroup" IS 'Se true, é mensagem de grupo';
  END IF;

  -- Adicionar campo groupId
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Conversation' AND column_name = 'groupId'
  ) THEN
    ALTER TABLE "Conversation" ADD COLUMN "groupId" TEXT;
    COMMENT ON COLUMN "Conversation"."groupId" IS 'ID do grupo (remoteJid do grupo, ex: 120363123456789012@g.us)';
  END IF;

  -- Adicionar campo groupName
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Conversation' AND column_name = 'groupName'
  ) THEN
    ALTER TABLE "Conversation" ADD COLUMN "groupName" TEXT;
    COMMENT ON COLUMN "Conversation"."groupName" IS 'Nome do grupo';
  END IF;

  -- Adicionar campo participantName
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Conversation' AND column_name = 'participantName'
  ) THEN
    ALTER TABLE "Conversation" ADD COLUMN "participantName" TEXT;
    COMMENT ON COLUMN "Conversation"."participantName" IS 'Nome do participante que enviou a mensagem (para grupos)';
  END IF;
END $$;

-- Criar índices para melhorar performance de consultas por grupo
CREATE INDEX IF NOT EXISTS "Conversation_isGroup_idx" ON "Conversation"("isGroup");
CREATE INDEX IF NOT EXISTS "Conversation_groupId_idx" ON "Conversation"("groupId");

-- Comentários nas colunas
COMMENT ON COLUMN "Conversation"."isGroup" IS 'Se true, é mensagem de grupo';
COMMENT ON COLUMN "Conversation"."groupId" IS 'ID do grupo (remoteJid do grupo, ex: 120363123456789012@g.us)';
COMMENT ON COLUMN "Conversation"."groupName" IS 'Nome do grupo';
COMMENT ON COLUMN "Conversation"."participantName" IS 'Nome do participante que enviou a mensagem (para grupos)';

