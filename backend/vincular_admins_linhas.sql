-- ============================================================================
-- Script para vincular Administradores e Supervisores às linhas ativas
-- ============================================================================
-- IMPORTANTE: Este script vincula admins/supervisors a TODAS as linhas ativas
-- para que eles possam receber mensagens em tempo real.
--
-- REQUISITO: O modo compartilhado (sharedLineMode) deve estar ativo no
-- ControlPanel para permitir mais de 2 operadores por linha.
-- ============================================================================

-- PASSO 1: Verificar modo compartilhado (deve retornar true)
SELECT
  id,
  "sharedLineMode",
  CASE
    WHEN "sharedLineMode" = true THEN '✅ Modo compartilhado ATIVO - pode prosseguir'
    ELSE '⚠️ ATENÇÃO: Modo compartilhado INATIVO - ative antes de continuar'
  END as status
FROM "ControlPanel"
LIMIT 1;

-- ============================================================================
-- Se o modo compartilhado NÃO estiver ativo, execute este comando primeiro:
-- ============================================================================
-- UPDATE "ControlPanel" SET "sharedLineMode" = true WHERE id = 1;
-- ============================================================================

-- PASSO 2: Visualizar quais admins/supervisors serão vinculados
SELECT
  u.id,
  u.name,
  u.email,
  u.role,
  u.status,
  u.segment,
  COUNT(lo."lineId") as linhas_atuais
FROM "User" u
LEFT JOIN "LineOperator" lo ON lo."userId" = u.id
WHERE u.role IN ('admin', 'supervisor')
GROUP BY u.id, u.name, u.email, u.role, u.status, u.segment
ORDER BY u.role, u.name;

-- PASSO 3: Visualizar linhas ativas que receberão os vínculos
SELECT
  l.id,
  l.phone,
  l."lineStatus",
  l.segment,
  COUNT(lo."userId") as operadores_atuais,
  STRING_AGG(u.name || ' (' || u.role || ')', ', ') as operadores
FROM "LinesStock" l
LEFT JOIN "LineOperator" lo ON lo."lineId" = l.id
LEFT JOIN "User" u ON u.id = lo."userId"
WHERE l."lineStatus" = 'active'
GROUP BY l.id, l.phone, l."lineStatus", l.segment
ORDER BY l.id;

-- ============================================================================
-- PASSO 4: EXECUTAR VINCULAÇÃO
-- ============================================================================
-- Este INSERT vincula todos os admins/supervisors a TODAS as linhas ativas
-- Ignora duplicatas (se o vínculo já existir)
-- ============================================================================

INSERT INTO "LineOperator" ("lineId", "userId", "createdAt", "updatedAt")
SELECT
  l.id as "lineId",
  u.id as "userId",
  NOW() as "createdAt",
  NOW() as "updatedAt"
FROM "LinesStock" l
CROSS JOIN "User" u
WHERE
  l."lineStatus" = 'active'                    -- Apenas linhas ativas
  AND u.role IN ('admin', 'supervisor')         -- Apenas admins e supervisors
  -- Removido filtro de status para vincular TODOS (online e offline)
  AND NOT EXISTS (                              -- Evitar duplicatas
    SELECT 1
    FROM "LineOperator" lo
    WHERE lo."lineId" = l.id
      AND lo."userId" = u.id
  );

-- PASSO 5: Atualizar campo legacy 'line' na tabela User (compatibilidade)
-- Define a primeira linha ativa como a linha principal do admin
UPDATE "User" u
SET line = (
  SELECT MIN(l.id)
  FROM "LinesStock" l
  WHERE l."lineStatus" = 'active'
)
WHERE u.role IN ('admin', 'supervisor')
  AND u.line IS NULL;

-- ============================================================================
-- VERIFICAÇÃO PÓS-EXECUÇÃO
-- ============================================================================

-- Verificar vínculos criados
SELECT
  u.id as user_id,
  u.name as user_name,
  u.role,
  u.status,
  COUNT(lo."lineId") as total_linhas_vinculadas,
  STRING_AGG(l.phone, ', ' ORDER BY l.id) as linhas_phone
FROM "User" u
LEFT JOIN "LineOperator" lo ON lo."userId" = u.id
LEFT JOIN "LinesStock" l ON l.id = lo."lineId"
WHERE u.role IN ('admin', 'supervisor')
GROUP BY u.id, u.name, u.role, u.status
ORDER BY u.role, u.name;

-- Verificar total de operadores por linha (deve incluir admins agora)
SELECT
  l.id,
  l.phone,
  l."lineStatus",
  COUNT(lo."userId") as total_operadores,
  STRING_AGG(
    u.name || ' (' || u.role || ', ' || u.status || ')',
    ', '
    ORDER BY u.role, u.name
  ) as operadores
FROM "LinesStock" l
LEFT JOIN "LineOperator" lo ON lo."lineId" = l.id
LEFT JOIN "User" u ON u.id = lo."userId"
WHERE l."lineStatus" = 'active'
GROUP BY l.id, l.phone, l."lineStatus"
ORDER BY l.id;

-- ============================================================================
-- LIMPEZA (Caso precise desfazer)
-- ============================================================================
-- Para remover todos os vínculos de admins/supervisors:
-- ============================================================================
-- DELETE FROM "LineOperator"
-- WHERE "userId" IN (
--   SELECT id FROM "User" WHERE role IN ('admin', 'supervisor')
-- );
--
-- UPDATE "User"
-- SET line = NULL
-- WHERE role IN ('admin', 'supervisor');
-- ============================================================================
