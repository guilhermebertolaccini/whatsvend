-- ====================================================================
-- SQL COMPLETO PARA ATUALIZAÇÃO: MODO LINHA COMPARTILHADA + ROLE DIGITAL
-- ====================================================================
-- Este arquivo contém TODAS as alterações necessárias para:
-- 1. Suportar role 'digital'
-- 2. Implementar modo de linha compartilhada (LineOperator)
-- 3. Vincular admins e supervisores às linhas ativas
-- ====================================================================

-- ============================================================
-- 1. ADICIONAR ROLE 'DIGITAL' AO ENUM (se ainda não existir)
-- ============================================================
DO $$
BEGIN
    -- Verificar se o valor 'digital' já existe no enum
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'Role' AND e.enumlabel = 'digital'
    ) THEN
        -- Adicionar 'digital' ao enum Role
        ALTER TYPE "Role" ADD VALUE 'digital';
        RAISE NOTICE '✅ Role "digital" adicionada ao enum';
    ELSE
        RAISE NOTICE '⚠️ Role "digital" já existe no enum';
    END IF;
END $$;

-- ============================================================
-- 2. CRIAR TABELA LineOperator (se não existir)
-- ============================================================
CREATE TABLE IF NOT EXISTS "LineOperator" (
    id SERIAL PRIMARY KEY,
    "lineId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LineOperator_lineId_userId_key" UNIQUE ("lineId", "userId"),
    CONSTRAINT "LineOperator_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "LinesStock"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LineOperator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS "LineOperator_lineId_idx" ON "LineOperator"("lineId");
CREATE INDEX IF NOT EXISTS "LineOperator_userId_idx" ON "LineOperator"("userId");

-- ============================================================
-- 3. VINCULAR TODOS OS ADMINS E SUPERVISORES ÀS LINHAS ATIVAS
-- ============================================================

-- 3.1. Vincular ADMINS a todas as linhas ativas (máximo 2 admins por linha)
INSERT INTO "LineOperator" ("lineId", "userId", "createdAt", "updatedAt")
SELECT
    l.id AS "lineId",
    u.id AS "userId",
    NOW() AS "createdAt",
    NOW() AS "updatedAt"
FROM "User" u
CROSS JOIN "LinesStock" l
WHERE u.role = 'admin'
  AND l."lineStatus" = 'active'
  AND NOT EXISTS (
      -- Não vincular se já existe
      SELECT 1 FROM "LineOperator" lo
      WHERE lo."lineId" = l.id AND lo."userId" = u.id
  )
  AND (
      -- Limitar a 2 admins por linha
      SELECT COUNT(*) FROM "LineOperator" lo
      WHERE lo."lineId" = l.id
  ) < 2
ON CONFLICT ("lineId", "userId") DO NOTHING;

-- 3.2. Vincular SUPERVISORES às linhas do MESMO SEGMENTO (máximo 2 supervisores por linha)
INSERT INTO "LineOperator" ("lineId", "userId", "createdAt", "updatedAt")
SELECT
    l.id AS "lineId",
    u.id AS "userId",
    NOW() AS "createdAt",
    NOW() AS "updatedAt"
FROM "User" u
INNER JOIN "LinesStock" l ON l.segment = u.segment
WHERE u.role = 'supervisor'
  AND l."lineStatus" = 'active'
  AND u.segment IS NOT NULL
  AND NOT EXISTS (
      -- Não vincular se já existe
      SELECT 1 FROM "LineOperator" lo
      WHERE lo."lineId" = l.id AND lo."userId" = u.id
  )
  AND (
      -- Limitar a 2 supervisores por linha
      SELECT COUNT(*) FROM "LineOperator" lo
      WHERE lo."lineId" = l.id
  ) < 2
ON CONFLICT ("lineId", "userId") DO NOTHING;

-- 3.3. Vincular OPERADORES ONLINE que já possuem linha (campo legacy "User".line)
-- Migrar do campo legado para a tabela LineOperator
INSERT INTO "LineOperator" ("lineId", "userId", "createdAt", "updatedAt")
SELECT
    u.line AS "lineId",
    u.id AS "userId",
    NOW() AS "createdAt",
    NOW() AS "updatedAt"
FROM "User" u
WHERE u.role = 'operator'
  AND u.line IS NOT NULL
  AND NOT EXISTS (
      -- Não vincular se já existe
      SELECT 1 FROM "LineOperator" lo
      WHERE lo."lineId" = u.line AND lo."userId" = u.id
  )
ON CONFLICT ("lineId", "userId") DO NOTHING;

-- ============================================================
-- 4. VERIFICAR RESULTADOS
-- ============================================================

-- Ver total de vínculos criados por role
SELECT
    u.role,
    COUNT(*) AS total_vinculos
FROM "LineOperator" lo
INNER JOIN "User" u ON u.id = lo."userId"
GROUP BY u.role
ORDER BY u.role;

-- Ver quantos operadores por linha
SELECT
    l.phone AS linha,
    l."lineStatus" AS status,
    COUNT(lo."userId") AS total_operadores,
    STRING_AGG(u.name || ' (' || u.role || ')', ', ') AS operadores
FROM "LinesStock" l
LEFT JOIN "LineOperator" lo ON lo."lineId" = l.id
LEFT JOIN "User" u ON u.id = lo."userId"
WHERE l."lineStatus" = 'active'
GROUP BY l.id, l.phone, l."lineStatus"
ORDER BY total_operadores DESC, l.phone;

-- Ver usuários sem linha vinculada
SELECT
    u.name,
    u.email,
    u.role,
    u.segment,
    u.status
FROM "User" u
WHERE u.role IN ('admin', 'supervisor', 'operator')
  AND NOT EXISTS (
      SELECT 1 FROM "LineOperator" lo WHERE lo."userId" = u.id
  )
ORDER BY u.role, u.name;

-- ============================================================
-- 5. LIMPEZA (OPCIONAL - Apenas se necessário)
-- ============================================================

-- Remover vínculos duplicados (caso existam)
-- DELETE FROM "LineOperator" lo1
-- WHERE EXISTS (
--     SELECT 1 FROM "LineOperator" lo2
--     WHERE lo2."lineId" = lo1."lineId"
--       AND lo2."userId" = lo1."userId"
--       AND lo2.id < lo1.id
-- );

-- Remover vínculos com linhas inativas (CUIDADO: pode afetar histórico)
-- DELETE FROM "LineOperator" lo
-- WHERE EXISTS (
--     SELECT 1 FROM "LinesStock" l
--     WHERE l.id = lo."lineId"
--       AND l."lineStatus" != 'active'
-- );

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================

-- Mensagem final
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '====================================================================';
    RAISE NOTICE '✅ ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!';
    RAISE NOTICE '====================================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Próximos passos:';
    RAISE NOTICE '1. Verificar os resultados acima';
    RAISE NOTICE '2. Reiniciar o backend: npm run start:dev';
    RAISE NOTICE '3. Fazer git add . && git commit && git push';
    RAISE NOTICE '';
    RAISE NOTICE '====================================================================';
END $$;
