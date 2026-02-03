-- ============================================
-- ÍNDICES ADICIONAIS PARA OTIMIZAÇÃO
-- ============================================
-- Execute este script para criar índices que podem melhorar performance
-- psql -U postgres -d seu_banco -f create_additional_indexes.sql

-- ============================================
-- 1. CONVERSATIONS (Tabela mais acessada)
-- ============================================

-- Índice composto para buscar conversas ativas por operador
CREATE INDEX IF NOT EXISTS idx_conversations_active_user 
ON "Conversation"(userId, tabulation) 
WHERE tabulation IS NULL;

-- Índice para buscar conversas por telefone e data (histórico)
CREATE INDEX IF NOT EXISTS idx_conversations_phone_datetime 
ON "Conversation"(contactPhone, datetime DESC);

-- Índice para relatórios (segmento + data)
CREATE INDEX IF NOT EXISTS idx_conversations_segment_datetime 
ON "Conversation"(segment, datetime DESC);

-- Índice para buscar conversas por linha e operador
CREATE INDEX IF NOT EXISTS idx_conversations_line_user 
ON "Conversation"(userLine, userId, datetime DESC);

-- ============================================
-- 2. CAMPAIGNS (Para estatísticas e relatórios)
-- ============================================

-- Índice composto para estatísticas de campanha
CREATE INDEX IF NOT EXISTS idx_campaigns_name_response 
ON "Campaign"(name, response, dateTime DESC);

-- Índice para buscar campanhas por segmento e data
CREATE INDEX IF NOT EXISTS idx_campaigns_segment_datetime 
ON "Campaign"(contactSegment, dateTime DESC);

-- Índice para campanhas com horário limite
CREATE INDEX IF NOT EXISTS idx_campaigns_endtime 
ON "Campaign"(endTime) 
WHERE endTime IS NOT NULL;

-- ============================================
-- 3. LINE OPERATORS (Relacionamento linha-operador)
-- ============================================

-- Índice para buscar linhas disponíveis (sem operadores ou < 2)
-- Este índice ajuda na atribuição automática de linhas
CREATE INDEX IF NOT EXISTS idx_line_operators_line_count 
ON "LineOperator"(lineId);

-- ============================================
-- 4. USERS (Para buscar operadores online)
-- ============================================

-- Índice composto para buscar operadores online por segmento
CREATE INDEX IF NOT EXISTS idx_users_online_segment 
ON "User"(status, role, segment) 
WHERE status = 'Online' AND role = 'operator';

-- ============================================
-- 5. CONTACTS (Para busca rápida)
-- ============================================

-- Índice para buscar contatos CPC
CREATE INDEX IF NOT EXISTS idx_contacts_cpc 
ON "Contact"(isCPC, lastCPCAt) 
WHERE isCPC = true;

-- ============================================
-- 6. SEND HISTORY (Para controle de reenvio)
-- ============================================

-- Verificar se a tabela existe (pode não existir ainda)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'SendHistory') THEN
    -- Índice para verificar histórico de envio
    CREATE INDEX IF NOT EXISTS idx_send_history_phone_date 
    ON "SendHistory"(contactPhone, sendDate DESC);
  END IF;
END $$;

-- ============================================
-- 7. CONTACT REPESCAGEM (Para controle de repescagem)
-- ============================================

-- Verificar se a tabela existe
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ContactRepescagem') THEN
    -- Índice para verificar status de repescagem
    CREATE INDEX IF NOT EXISTS idx_repescagem_phone 
    ON "ContactRepescagem"(contactPhone, lastOperatorMessageAt);
  END IF;
END $$;

-- ============================================
-- 8. ANALYZE (Atualizar estatísticas)
-- ============================================

-- Atualizar estatísticas do planner para melhor performance
ANALYZE "Conversation";
ANALYZE "Campaign";
ANALYZE "User";
ANALYZE "Contact";
ANALYZE "LinesStock";
ANALYZE "LineOperator";

-- ============================================
-- 9. VERIFICAR ÍNDICES CRIADOS
-- ============================================

SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('Conversation', 'Campaign', 'User', 'Contact', 'LinesStock', 'LineOperator')
ORDER BY tablename, indexname;

