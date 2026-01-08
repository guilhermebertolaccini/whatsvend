-- ============================================================================
-- Migration: Adicionar constraint UNIQUE no campo phone da tabela Contact
-- Data: 2026-01-05
-- Descrição: Garante que 1 telefone = 1 contato (não permite duplicatas)
-- ============================================================================

-- PASSO 1: Identificar duplicatas (EXECUTAR PRIMEIRO PARA VER SE HÁ DUPLICATAS)
SELECT phone, COUNT(*) as total, STRING_AGG(id::text, ', ') as contact_ids
FROM "Contact"
GROUP BY phone
HAVING COUNT(*) > 1
ORDER BY total DESC;

-- ============================================================================
-- PASSO 2: REMOVER DUPLICATAS (apenas se o PASSO 1 retornou resultados)
-- ============================================================================
-- IMPORTANTE: Este comando mantém apenas o contato MAIS RECENTE de cada telefone
-- e remove os mais antigos. Revise antes de executar!
-- ============================================================================

-- Comentar/descomentar conforme necessário:
/*
DELETE FROM "Contact" a USING "Contact" b
WHERE a.id < b.id AND a.phone = b.phone;
*/

-- ============================================================================
-- ALTERNATIVA SEGURA: Marcar duplicatas sem deletar
-- ============================================================================
-- Se preferir não deletar, pode adicionar um sufixo aos duplicados:
/*
UPDATE "Contact"
SET phone = phone || '_dup_' || id
WHERE id IN (
  SELECT c1.id
  FROM "Contact" c1
  INNER JOIN "Contact" c2 ON c1.phone = c2.phone AND c1.id < c2.id
);
*/

-- ============================================================================
-- PASSO 3: Adicionar constraint UNIQUE
-- ============================================================================
-- Só execute após garantir que não há duplicatas!
-- ============================================================================

ALTER TABLE "Contact"
ADD CONSTRAINT "Contact_phone_key" UNIQUE ("phone");

-- ============================================================================
-- PASSO 4: Verificação pós-migration
-- ============================================================================

-- Verificar se a constraint foi criada:
SELECT conname, contype, pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = '"Contact"'::regclass
AND contype = 'u';

-- Verificar que não há mais duplicatas:
SELECT phone, COUNT(*) as total
FROM "Contact"
GROUP BY phone
HAVING COUNT(*) > 1;

-- ============================================================================
-- ROLLBACK (caso precise reverter)
-- ============================================================================
-- Para remover a constraint:
-- ALTER TABLE "Contact" DROP CONSTRAINT "Contact_phone_key";
-- ============================================================================
