-- ============================================
-- SQL PARA ATUALIZAR O BANCO DE DADOS
-- Execute este SQL no seu banco PostgreSQL
-- ============================================

-- 1. Adicionar coluna activeEvolutions na tabela ControlPanel (se ainda não existir)
-- Verificar primeiro se a coluna já existe antes de executar
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

-- 2. Criar tabela MessageQueue (fila de mensagens quando não há operador online)
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

-- 3. Criar índices para a tabela MessageQueue
CREATE INDEX IF NOT EXISTS "MessageQueue_status_idx" ON "MessageQueue"("status");
CREATE INDEX IF NOT EXISTS "MessageQueue_contactPhone_idx" ON "MessageQueue"("contactPhone");
CREATE INDEX IF NOT EXISTS "MessageQueue_segment_idx" ON "MessageQueue"("segment");
CREATE INDEX IF NOT EXISTS "MessageQueue_createdAt_idx" ON "MessageQueue"("createdAt");

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute estas queries para verificar se tudo foi criado corretamente:

-- Verificar se a coluna activeEvolutions existe
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'ControlPanel' AND column_name = 'activeEvolutions';

-- Verificar se a tabela MessageQueue foi criada
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_name = 'MessageQueue';

-- Verificar índices da MessageQueue
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'MessageQueue';

-- 4. Adicionar colunas para mensagem automática quando cliente não responde
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ControlPanel' 
        AND column_name = 'autoMessageEnabled'
    ) THEN
        ALTER TABLE "ControlPanel" ADD COLUMN "autoMessageEnabled" BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE 'Coluna autoMessageEnabled adicionada à tabela ControlPanel';
    ELSE
        RAISE NOTICE 'Coluna autoMessageEnabled já existe na tabela ControlPanel';
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
        RAISE NOTICE 'Coluna autoMessageHours adicionada à tabela ControlPanel';
    ELSE
        RAISE NOTICE 'Coluna autoMessageHours já existe na tabela ControlPanel';
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
        RAISE NOTICE 'Coluna autoMessageText adicionada à tabela ControlPanel';
    ELSE
        RAISE NOTICE 'Coluna autoMessageText já existe na tabela ControlPanel';
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
        RAISE NOTICE 'Coluna autoMessageMaxAttempts adicionada à tabela ControlPanel';
    ELSE
        RAISE NOTICE 'Coluna autoMessageMaxAttempts já existe na tabela ControlPanel';
    END IF;
END $$;

-- 5. Criar tabela SystemEvent para eventos do sistema
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

-- 6. Criar índices para a tabela SystemEvent
CREATE INDEX IF NOT EXISTS "SystemEvent_type_idx" ON "SystemEvent"("type");
CREATE INDEX IF NOT EXISTS "SystemEvent_module_idx" ON "SystemEvent"("module");
CREATE INDEX IF NOT EXISTS "SystemEvent_userId_idx" ON "SystemEvent"("userId");
CREATE INDEX IF NOT EXISTS "SystemEvent_severity_idx" ON "SystemEvent"("severity");
CREATE INDEX IF NOT EXISTS "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");

-- 7. Adicionar foreign key para User (se ainda não existir)
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

