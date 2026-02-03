-- ============================================
-- SQL COMPLETO PARA DEPLOY
-- Execute este SQL no seu banco PostgreSQL ANTES do deploy
-- ============================================

-- ============================================
-- 1. ADICIONAR COLUNA activeEvolutions
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ControlPanel' 
        AND column_name = 'activeEvolutions'
    ) THEN
        ALTER TABLE "ControlPanel" ADD COLUMN "activeEvolutions" TEXT;
        RAISE NOTICE 'Coluna activeEvolutions adicionada à tabela ControlPanel';
    ELSE
        RAISE NOTICE 'Coluna activeEvolutions já existe na tabela ControlPanel';
    END IF;
END $$;

-- ============================================
-- 2. CRIAR TABELA MessageQueue
-- ============================================
CREATE TABLE IF NOT EXISTS "MessageQueue" (
    "id" SERIAL NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "message" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "mediaUrl" TEXT,
    "segment" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "MessageQueue_pkey" PRIMARY KEY ("id")
);

-- Criar índices para MessageQueue
CREATE INDEX IF NOT EXISTS "MessageQueue_status_idx" ON "MessageQueue"("status");
CREATE INDEX IF NOT EXISTS "MessageQueue_contactPhone_idx" ON "MessageQueue"("contactPhone");
CREATE INDEX IF NOT EXISTS "MessageQueue_segment_idx" ON "MessageQueue"("segment");
CREATE INDEX IF NOT EXISTS "MessageQueue_createdAt_idx" ON "MessageQueue"("createdAt");

-- ============================================
-- 3. ADICIONAR COLUNAS DE MENSAGEM AUTOMÁTICA
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ControlPanel' 
        AND column_name = 'autoMessageEnabled'
    ) THEN
        ALTER TABLE "ControlPanel" ADD COLUMN "autoMessageEnabled" BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE 'Coluna autoMessageEnabled adicionada';
    ELSE
        RAISE NOTICE 'Coluna autoMessageEnabled já existe';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ControlPanel' 
        AND column_name = 'autoMessageHours'
    ) THEN
        ALTER TABLE "ControlPanel" ADD COLUMN "autoMessageHours" INTEGER NOT NULL DEFAULT 24;
        RAISE NOTICE 'Coluna autoMessageHours adicionada';
    ELSE
        RAISE NOTICE 'Coluna autoMessageHours já existe';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ControlPanel' 
        AND column_name = 'autoMessageText'
    ) THEN
        ALTER TABLE "ControlPanel" ADD COLUMN "autoMessageText" TEXT;
        RAISE NOTICE 'Coluna autoMessageText adicionada';
    ELSE
        RAISE NOTICE 'Coluna autoMessageText já existe';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ControlPanel' 
        AND column_name = 'autoMessageMaxAttempts'
    ) THEN
        ALTER TABLE "ControlPanel" ADD COLUMN "autoMessageMaxAttempts" INTEGER NOT NULL DEFAULT 1;
        RAISE NOTICE 'Coluna autoMessageMaxAttempts adicionada';
    ELSE
        RAISE NOTICE 'Coluna autoMessageMaxAttempts já existe';
    END IF;
END $$;

-- ============================================
-- 4. CRIAR TABELA SystemEvent
-- ============================================
CREATE TABLE IF NOT EXISTS "SystemEvent" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "data" TEXT,
    "userId" INTEGER,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- Criar índices para SystemEvent
CREATE INDEX IF NOT EXISTS "SystemEvent_type_idx" ON "SystemEvent"("type");
CREATE INDEX IF NOT EXISTS "SystemEvent_module_idx" ON "SystemEvent"("module");
CREATE INDEX IF NOT EXISTS "SystemEvent_userId_idx" ON "SystemEvent"("userId");
CREATE INDEX IF NOT EXISTS "SystemEvent_severity_idx" ON "SystemEvent"("severity");
CREATE INDEX IF NOT EXISTS "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");

-- Adicionar foreign key para User
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'SystemEvent_userId_fkey'
    ) THEN
        ALTER TABLE "SystemEvent" 
        ADD CONSTRAINT "SystemEvent_userId_fkey" 
        FOREIGN KEY ("userId") 
        REFERENCES "User"("id") 
        ON DELETE SET NULL 
        ON UPDATE CASCADE;
        RAISE NOTICE 'Foreign key SystemEvent_userId_fkey adicionada';
    ELSE
        RAISE NOTICE 'Foreign key SystemEvent_userId_fkey já existe';
    END IF;
END $$;

-- ============================================
-- 5. ADICIONAR CAMPOS DE ARQUIVAMENTO
-- ============================================
ALTER TABLE "Conversation" 
ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP;

-- Criar índices para arquivamento
CREATE INDEX IF NOT EXISTS "Conversation_archived_datetime_idx" 
ON "Conversation"("archived", "datetime");

CREATE INDEX IF NOT EXISTS "Conversation_archivedAt_idx" 
ON "Conversation"("archivedAt");

-- ============================================
-- 6. CRIAR TABELA LineOperator (se não existir)
-- ============================================
CREATE TABLE IF NOT EXISTS "LineOperator" (
    "id" SERIAL NOT NULL,
    "lineId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineOperator_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LineOperator_lineId_userId_key" UNIQUE ("lineId", "userId")
);

-- Criar índices para LineOperator
CREATE INDEX IF NOT EXISTS "LineOperator_lineId_idx" ON "LineOperator"("lineId");
CREATE INDEX IF NOT EXISTS "LineOperator_userId_idx" ON "LineOperator"("userId");

-- Adicionar foreign keys para LineOperator
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'LineOperator_lineId_fkey'
    ) THEN
        ALTER TABLE "LineOperator" 
        ADD CONSTRAINT "LineOperator_lineId_fkey" 
        FOREIGN KEY ("lineId") 
        REFERENCES "LinesStock"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
        RAISE NOTICE 'Foreign key LineOperator_lineId_fkey adicionada';
    ELSE
        RAISE NOTICE 'Foreign key LineOperator_lineId_fkey já existe';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'LineOperator_userId_fkey'
    ) THEN
        ALTER TABLE "LineOperator" 
        ADD CONSTRAINT "LineOperator_userId_fkey" 
        FOREIGN KEY ("userId") 
        REFERENCES "User"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
        RAISE NOTICE 'Foreign key LineOperator_userId_fkey adicionada';
    ELSE
        RAISE NOTICE 'Foreign key LineOperator_userId_fkey já existe';
    END IF;
END $$;

-- ============================================
-- VERIFICAÇÃO FINAL
-- ============================================
-- Execute estas queries para verificar se tudo foi criado corretamente:

-- Verificar colunas do ControlPanel
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'ControlPanel' 
-- AND column_name IN ('activeEvolutions', 'autoMessageEnabled', 'autoMessageHours', 'autoMessageText', 'autoMessageMaxAttempts');

-- Verificar tabelas criadas
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_name IN ('MessageQueue', 'SystemEvent', 'LineOperator');

-- Verificar colunas de arquivamento
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'Conversation' 
-- AND column_name IN ('archived', 'archivedAt');

-- Verificar índices
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename IN ('MessageQueue', 'SystemEvent', 'LineOperator', 'Conversation')
-- ORDER BY tablename, indexname;

