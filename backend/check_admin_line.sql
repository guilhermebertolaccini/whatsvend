-- Verificar Admin e Linha
SELECT
  u.id as user_id,
  u.name as user_name,
  u.email,
  u.role,
  u.status,
  u."segmentId",
  l.id as line_id,
  l.phone as line_phone,
  l.segment as line_segment,
  lo."lineId" as vinculo_linha,
  lo."userId" as vinculo_user
FROM "User" u
LEFT JOIN "LineOperator" lo ON lo."userId" = u.id
LEFT JOIN "LinesStock" l ON l.id = lo."lineId"
WHERE u.role IN ('admin', 'supervisor')
ORDER BY u.id;

-- Verificar todas as linhas e seus operadores
SELECT
  l.id,
  l.phone,
  l.segment,
  l."lineStatus",
  COUNT(lo."userId") as total_operadores,
  STRING_AGG(u.name || ' (' || u.role || ', ' || u.status || ')', ', ') as operadores
FROM "LinesStock" l
LEFT JOIN "LineOperator" lo ON lo."lineId" = l.id
LEFT JOIN "User" u ON u.id = lo."userId"
GROUP BY l.id, l.phone, l.segment, l."lineStatus"
ORDER BY l.id;
