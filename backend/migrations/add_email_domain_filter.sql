-- ============================================================================
-- Migration: Adicionar função e índice para filtro por domínio de email
-- Data: 2026-01-05
-- Descrição: Permite filtrar usuários digital/supervisor por domínio de email
-- ============================================================================

-- PASSO 1: Criar função para extrair domínio do email
-- ============================================================================
CREATE OR REPLACE FUNCTION get_email_domain(email TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(SUBSTRING(email FROM '@(.*)$'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Teste da função:
-- SELECT get_email_domain('usuario@paschoalotto.com.br'); -- retorna 'paschoalotto.com.br'
-- SELECT get_email_domain('admin@taticamarketing.com.br'); -- retorna 'taticamarketing.com.br'

-- ============================================================================
-- PASSO 2: Criar índice para otimizar buscas por domínio de email
-- ============================================================================
CREATE INDEX IF NOT EXISTS "User_email_domain_idx"
ON "User" (LOWER(SUBSTRING(email FROM '@(.*)$')));

-- ============================================================================
-- PASSO 3: Verificação pós-migration
-- ============================================================================

-- Verificar se a função foi criada:
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'get_email_domain';

-- Verificar se o índice foi criado:
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'User' AND indexname = 'User_email_domain_idx';

-- Testar filtro por domínio (exemplo):
SELECT id, name, email, role, segment
FROM "User"
WHERE get_email_domain(email) = 'paschoalotto.com.br'
AND email NOT LIKE '%@vend%'
AND email NOT LIKE '%@tatica%';

-- ============================================================================
-- ROLLBACK (caso precise reverter)
-- ============================================================================
-- DROP FUNCTION IF EXISTS get_email_domain(TEXT);
-- DROP INDEX IF EXISTS "User_email_domain_idx";
-- ============================================================================
