-- ===================================================================
-- Migration: Sistema de Fila de Espera + Linhas Reservadas
-- Descrição: Adiciona fila para operadores sem linha e marca linhas reservadas
-- Data: 2025-12-23
-- ===================================================================

-- 1. Criar tabela OperatorQueue (Fila de Espera)
CREATE TABLE IF NOT EXISTS "OperatorQueue" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "segmentId" INTEGER REFERENCES "Segment"("id") ON DELETE SET NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'waiting', -- waiting, assigned, expired
  "priority" INTEGER NOT NULL DEFAULT 0, -- Prioridade (maior = mais urgente)
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "assignedAt" TIMESTAMP,
  "expiresAt" TIMESTAMP,
  "assignedLineId" INTEGER REFERENCES "LinesStock"("id") ON DELETE SET NULL,

  -- Índices para performance
  CONSTRAINT "OperatorQueue_userId_status_unique" UNIQUE("userId", "status")
);

-- Índices para queries rápidas
CREATE INDEX IF NOT EXISTS "OperatorQueue_status_priority_idx" ON "OperatorQueue"("status", "priority" DESC, "createdAt" ASC);
CREATE INDEX IF NOT EXISTS "OperatorQueue_segmentId_idx" ON "OperatorQueue"("segmentId");
CREATE INDEX IF NOT EXISTS "OperatorQueue_userId_idx" ON "OperatorQueue"("userId");

-- Comentários
COMMENT ON TABLE "OperatorQueue" IS 'Fila de espera para operadores sem linha disponível';
COMMENT ON COLUMN "OperatorQueue"."status" IS 'waiting: aguardando linha | assigned: linha atribuída | expired: expirou sem atribuição';
COMMENT ON COLUMN "OperatorQueue"."priority" IS 'Prioridade na fila (0=normal, 1=alta, 2=crítica)';

-- 2. Adicionar campo isReserve em LinesStock (Linhas Reservadas)
ALTER TABLE "LinesStock"
ADD COLUMN IF NOT EXISTS "isReserve" BOOLEAN NOT NULL DEFAULT false;

-- Comentário
COMMENT ON COLUMN "LinesStock"."isReserve" IS 'Se true, linha é reservada (aceita apenas 1 operador)';

-- 3. Marcar 15 linhas como reserva (se houver linhas suficientes)
DO $$
DECLARE
  lines_to_reserve INTEGER;
  total_active_lines INTEGER;
BEGIN
  -- Contar linhas ativas
  SELECT COUNT(*) INTO total_active_lines
  FROM "LinesStock"
  WHERE "lineStatus" = 'active';

  -- Calcular quantas marcar como reserva (15% do total, mínimo 10, máximo 20)
  lines_to_reserve := LEAST(GREATEST(FLOOR(total_active_lines * 0.15), 10), 20);

  IF total_active_lines >= 10 THEN
    -- Marcar linhas com menos operadores vinculados como reserva
    WITH lines_with_operator_count AS (
      SELECT l."id", COUNT(lo."userId") as operator_count
      FROM "LinesStock" l
      LEFT JOIN "LineOperator" lo ON l."id" = lo."lineId"
      WHERE l."lineStatus" = 'active'
      GROUP BY l."id"
      ORDER BY operator_count ASC, l."createdAt" DESC
      LIMIT lines_to_reserve
    )
    UPDATE "LinesStock"
    SET "isReserve" = true
    WHERE "id" IN (SELECT "id" FROM lines_with_operator_count);

    RAISE NOTICE 'Marcadas % linhas como reserva', lines_to_reserve;
  ELSE
    RAISE NOTICE 'Apenas % linhas ativas. Mínimo necessário: 10', total_active_lines;
  END IF;
END $$;

-- 4. Criar tabela de logs de disponibilidade (para histórico)
CREATE TABLE IF NOT EXISTS "LineAvailabilityLog" (
  "id" SERIAL PRIMARY KEY,
  "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
  "totalActiveLines" INTEGER NOT NULL,
  "linesWithZeroOperators" INTEGER NOT NULL,
  "linesWithOneOperator" INTEGER NOT NULL,
  "linesWithTwoOperators" INTEGER NOT NULL,
  "operatorsOnline" INTEGER NOT NULL,
  "operatorsWithoutLine" INTEGER NOT NULL,
  "operatorsInQueue" INTEGER NOT NULL,
  "availabilityPercent" DECIMAL(5,2) NOT NULL,
  "severity" VARCHAR(20) NOT NULL DEFAULT 'INFO' -- INFO, WARNING, CRITICAL
);

-- Índice para queries temporais
CREATE INDEX IF NOT EXISTS "LineAvailabilityLog_timestamp_idx" ON "LineAvailabilityLog"("timestamp" DESC);

-- Comentário
COMMENT ON TABLE "LineAvailabilityLog" IS 'Histórico de disponibilidade de linhas para análise e alertas';

-- 5. Verificar estrutura criada
SELECT
  'OperatorQueue' as table_name,
  COUNT(*) as total_rows
FROM "OperatorQueue"
UNION ALL
SELECT
  'Linhas Reservadas' as table_name,
  COUNT(*) as total_rows
FROM "LinesStock"
WHERE "isReserve" = true
UNION ALL
SELECT
  'LineAvailabilityLog' as table_name,
  COUNT(*) as total_rows
FROM "LineAvailabilityLog";

-- ===================================================================
-- FIM DA MIGRATION
-- ===================================================================
