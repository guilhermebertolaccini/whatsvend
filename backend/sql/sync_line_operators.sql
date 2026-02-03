-- Script para sincronizar operadores com linhas na tabela LineOperator
-- Este script pega todos os operadores que têm uma linha no campo 'line' (legacy)
-- e cria a entrada correspondente na tabela LineOperator se não existir

-- Inserir operadores que têm linha mas não estão na tabela LineOperator
INSERT INTO "LineOperator" ("lineId", "userId", "createdAt", "updatedAt")
SELECT 
    u."line" as "lineId",
    u.id as "userId",
    NOW() as "createdAt",
    NOW() as "updatedAt"
FROM "User" u
WHERE 
    u."line" IS NOT NULL
    AND u.role = 'operator'
    AND NOT EXISTS (
        SELECT 1 
        FROM "LineOperator" lo 
        WHERE lo."lineId" = u."line" 
        AND lo."userId" = u.id
    )
    AND EXISTS (
        SELECT 1 
        FROM "LinesStock" ls 
        WHERE ls.id = u."line" 
        AND ls."lineStatus" = 'active'
    );

-- Verificar quantos registros foram inseridos
SELECT COUNT(*) as "operadores_sincronizados" 
FROM "LineOperator";

-- Mostrar operadores que ainda têm linha mas não foram sincronizados (linha inativa ou não existe)
SELECT 
    u.id as "userId",
    u.name as "userName",
    u."line" as "lineId",
    ls."lineStatus" as "lineStatus",
    CASE 
        WHEN ls.id IS NULL THEN 'Linha não existe'
        WHEN ls."lineStatus" != 'active' THEN 'Linha inativa'
        ELSE 'Outro motivo'
    END as "motivo"
FROM "User" u
LEFT JOIN "LinesStock" ls ON ls.id = u."line"
WHERE 
    u."line" IS NOT NULL
    AND u.role = 'operator'
    AND NOT EXISTS (
        SELECT 1 
        FROM "LineOperator" lo 
        WHERE lo."lineId" = u."line" 
        AND lo."userId" = u.id
    );

