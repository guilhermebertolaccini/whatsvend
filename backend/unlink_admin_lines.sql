-- =====================================================
-- SQL para desvincular todas as linhas dos admins
-- =====================================================
--
-- IMPORTANTE: Execute este script no database correto!
-- Se estiver usando psql, primeiro conecte ao database:
--   \c vend
-- Ou execute diretamente:
--   psql -U postgres -d vend -f unlink_admin_lines.sql
--
-- Para encontrar o nome do database, veja DATABASE_URL no .env:
--   grep DATABASE_URL .env
-- =====================================================

-- 1. Ver quais vínculos serão removidos (executar primeiro para verificar)
SELECT
  lo.id as vinculo_id,
  lo."lineId" as linha_id,
  l.phone as telefone_linha,
  lo."userId" as usuario_id,
  u.name as nome_admin,
  u.email as email_admin
FROM "LineOperator" lo
JOIN "User" u ON u.id = lo."userId"
JOIN "LinesStock" l ON l.id = lo."lineId"
WHERE u.role = 'admin'
ORDER BY u.name, l.phone;

-- 2. Remover os vínculos (executar após verificar acima)
DELETE FROM "LineOperator"
WHERE "userId" IN (
  SELECT id FROM "User" WHERE role = 'admin'
);

-- 3. Verificar que não há mais vínculos de admins
SELECT
  u.role,
  COUNT(lo.id) as quantidade_vinculos
FROM "User" u
LEFT JOIN "LineOperator" lo ON lo."userId" = u.id
GROUP BY u.role
ORDER BY u.role;
