-- ===================================================================
-- Adicionar campo sharedLineMode no ControlPanel
-- Descrição: Permite que todos os usuários compartilhem a mesma linha
-- Data: 2025-01-XX
-- ===================================================================

-- Adicionar campo sharedLineMode
ALTER TABLE "ControlPanel"
ADD COLUMN IF NOT EXISTS "sharedLineMode" BOOLEAN NOT NULL DEFAULT false;

-- Comentário explicativo
COMMENT ON COLUMN "ControlPanel"."sharedLineMode" IS 'Se true, mesma linha pode ser vinculada a todos os usuários e nunca desvincula. No frontend, mensagens mostram o nome do usuário que enviou.';

-- Verificar a alteração
SELECT 
  column_name, 
  data_type, 
  column_default, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'ControlPanel' 
  AND column_name = 'sharedLineMode';

