-- Adicionar campo endTime na tabela Campaign
-- Este campo armazena o horário limite para envio das mensagens da campanha

ALTER TABLE "Campaign" 
ADD COLUMN "endTime" TIMESTAMP(3);

-- Adicionar índice no campo name para melhorar performance nas consultas de estatísticas
CREATE INDEX IF NOT EXISTS "Campaign_name_idx" ON "Campaign"("name");

-- Comentário: O campo endTime é opcional (nullable)
-- Formato esperado: DateTime (TIMESTAMP)
-- Quando preenchido, o sistema distribui as mensagens uniformemente até este horário

