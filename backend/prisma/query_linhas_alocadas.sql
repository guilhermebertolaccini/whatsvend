-- Query: Linhas vinculadas a segmentos (cada linha aparece apenas uma vez - primeira alocação)
-- Traz: Data de vínculo, Número, Segmento, Se foi banida

SELECT DISTINCT ON (se.data::json->>'phone')
    se."createdAt" AS "Data de Vínculo",
    CAST(se.data::json->>'phone' AS VARCHAR) AS "Número da Linha",
    CAST(se.data::json->>'segmentName' AS VARCHAR) AS "Segmento",
    CASE 
        WHEN ls."lineStatus" = 'ban' THEN 'Sim'
        ELSE 'Não'
    END AS "Banida"
FROM "SystemEvent" se
LEFT JOIN "LinesStock" ls ON CAST(se.data::json->>'lineId' AS INTEGER) = ls.id
WHERE se.type = 'line_assigned'
ORDER BY se.data::json->>'phone', se."createdAt" ASC;
