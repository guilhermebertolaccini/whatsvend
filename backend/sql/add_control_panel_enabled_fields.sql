-- Adicionar campos enabled no ControlPanel para ativar/desativar controles
-- Execute este script como superuser (postgres)
-- psql -U postgres -d seu_banco -f add_control_panel_enabled_fields.sql

-- Adicionar campo blockPhrasesEnabled (ativar/desativar frases de bloqueio)
ALTER TABLE "ControlPanel"
ADD COLUMN IF NOT EXISTS "blockPhrasesEnabled" BOOLEAN DEFAULT true;

-- Adicionar campo cpcCooldownEnabled (ativar/desativar temporizador de CPC)
ALTER TABLE "ControlPanel"
ADD COLUMN IF NOT EXISTS "cpcCooldownEnabled" BOOLEAN DEFAULT true;

-- Adicionar campo resendCooldownEnabled (ativar/desativar controle de reenvio)
ALTER TABLE "ControlPanel"
ADD COLUMN IF NOT EXISTS "resendCooldownEnabled" BOOLEAN DEFAULT true;

-- Atualizar registros existentes para ter os valores padrão (true = ativado)
UPDATE "ControlPanel"
SET 
  "blockPhrasesEnabled" = COALESCE("blockPhrasesEnabled", true),
  "cpcCooldownEnabled" = COALESCE("cpcCooldownEnabled", true),
  "resendCooldownEnabled" = COALESCE("resendCooldownEnabled", true);

-- Verificar se os campos foram adicionados corretamente
SELECT 
  "id",
  "segmentId",
  "blockPhrasesEnabled",
  "cpcCooldownEnabled",
  "resendCooldownEnabled",
  "repescagemEnabled"
FROM "ControlPanel"
LIMIT 5;

