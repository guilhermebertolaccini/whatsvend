-- ===================================================================
-- SETUP COMPLETO DO BANCO DE DADOS - VEND
-- Descrição: Script SQL completo para criar todo o banco de dados do zero
-- Data: 2025-01-XX
-- ===================================================================
-- 
-- INSTRUÇÕES DE EXECUÇÃO:
-- 
-- 1. Conecte-se ao PostgreSQL:
--    psql -U seu_usuario -d seu_banco
--
-- 2. Execute o script:
--    \i /caminho/para/COMPLETE_DATABASE_SETUP.sql
--    OU
--    psql -U seu_usuario -d seu_banco -f COMPLETE_DATABASE_SETUP.sql
--
-- 3. IMPORTANTE - Se o enum Role já existia sem 'digital':
--    Após executar o script, se aparecer um aviso sobre 'digital',
--    execute separadamente (fora de transação):
--    ALTER TYPE "Role" ADD VALUE 'digital';
--
-- CARACTERÍSTICAS:
-- - Script idempotente (pode ser executado múltiplas vezes sem problemas)
-- - Todas as alterações são feitas dentro de transações
-- - Cria todos os enums, tabelas, índices, foreign keys e triggers
-- - Inclui todas as migrations incrementais já aplicadas
--
-- ===================================================================

BEGIN;

-- ===================================================================
-- PARTE 1: CRIAR ENUMS
-- ===================================================================

-- Enum Role
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    CREATE TYPE "Role" AS ENUM ('admin', 'operator', 'supervisor', 'ativador', 'digital');
    RAISE NOTICE 'Enum Role criado com sucesso (incluindo digital)';
  ELSE
    -- Verificar se 'digital' existe, se não, avisar
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'digital' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')
    ) THEN
      RAISE NOTICE '⚠️  ATENÇÃO: Enum Role existe, mas "digital" não está presente.';
      RAISE NOTICE 'Execute após o COMMIT: ALTER TYPE "Role" ADD VALUE ''digital'';';
    ELSE
      RAISE NOTICE 'Enum Role já existe com todos os valores (incluindo digital)';
    END IF;
  END IF;
END $$;

-- Enum Status
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Status') THEN
    CREATE TYPE "Status" AS ENUM ('Online', 'Offline');
    RAISE NOTICE 'Enum Status criado com sucesso';
  ELSE
    RAISE NOTICE 'Enum Status já existe';
  END IF;
END $$;

-- Enum LineStatus
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LineStatus') THEN
    CREATE TYPE "LineStatus" AS ENUM ('active', 'ban');
    RAISE NOTICE 'Enum LineStatus criado com sucesso';
  ELSE
    RAISE NOTICE 'Enum LineStatus já existe';
  END IF;
END $$;

-- Enum Sender
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Sender') THEN
    CREATE TYPE "Sender" AS ENUM ('operator', 'contact');
    RAISE NOTICE 'Enum Sender criado com sucesso';
  ELSE
    RAISE NOTICE 'Enum Sender já existe';
  END IF;
END $$;

-- Enum Speed
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Speed') THEN
    CREATE TYPE "Speed" AS ENUM ('fast', 'medium', 'slow');
    RAISE NOTICE 'Enum Speed criado com sucesso';
  ELSE
    RAISE NOTICE 'Enum Speed já existe';
  END IF;
END $$;

-- Enum Identifier
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Identifier') THEN
    CREATE TYPE "Identifier" AS ENUM ('cliente', 'proprietario');
    RAISE NOTICE 'Enum Identifier criado com sucesso';
  ELSE
    RAISE NOTICE 'Enum Identifier já existe';
  END IF;
END $$;

-- ===================================================================
-- PARTE 2: CRIAR TABELAS BASE
-- ===================================================================

-- Tabela User
CREATE TABLE IF NOT EXISTS "User" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "segment" INTEGER,
  "line" INTEGER,
  "status" "Status" NOT NULL DEFAULT 'Offline',
  "oneToOneActive" BOOLEAN NOT NULL DEFAULT true,
  "identifier" "Identifier" NOT NULL DEFAULT 'proprietario',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Tabela Segment
CREATE TABLE IF NOT EXISTS "Segment" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL UNIQUE,
  "allowsFreeMessage" BOOLEAN NOT NULL DEFAULT true,
  "identifier" "Identifier" NOT NULL DEFAULT 'proprietario',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- Tabela Tabulation
CREATE TABLE IF NOT EXISTS "Tabulation" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "isCPC" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tabulation_pkey" PRIMARY KEY ("id")
);

-- Tabela Contact
CREATE TABLE IF NOT EXISTS "Contact" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "segment" INTEGER,
  "cpf" TEXT,
  "contract" TEXT,
  "isCPC" BOOLEAN NOT NULL DEFAULT false,
  "lastCPCAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- Tabela Campaign
CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "contactSegment" INTEGER,
  "dateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lineReceptor" INTEGER,
  "response" BOOLEAN NOT NULL DEFAULT false,
  "speed" "Speed" NOT NULL,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "useTemplate" BOOLEAN NOT NULL DEFAULT false,
  "templateId" INTEGER,
  "templateVariables" TEXT,
  "endTime" TIMESTAMP(3),
  "isAdminTest" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- Tabela BlockList
CREATE TABLE IF NOT EXISTS "BlockList" (
  "id" SERIAL NOT NULL,
  "name" TEXT,
  "phone" TEXT,
  "cpf" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlockList_pkey" PRIMARY KEY ("id")
);

-- Tabela Evolution
CREATE TABLE IF NOT EXISTS "Evolution" (
  "id" SERIAL NOT NULL,
  "evolutionName" TEXT NOT NULL UNIQUE,
  "evolutionUrl" TEXT NOT NULL,
  "evolutionKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Evolution_pkey" PRIMARY KEY ("id")
);

-- Tabela LinesStock
CREATE TABLE IF NOT EXISTS "LinesStock" (
  "id" SERIAL NOT NULL,
  "phone" TEXT NOT NULL UNIQUE,
  "lineStatus" "LineStatus" NOT NULL DEFAULT 'active',
  "segment" INTEGER,
  "linkedTo" INTEGER,
  "evolutionName" TEXT NOT NULL,
  "oficial" BOOLEAN NOT NULL DEFAULT false,
  "token" TEXT,
  "businessID" TEXT,
  "numberId" TEXT,
  "receiveMedia" BOOLEAN NOT NULL DEFAULT false,
  "isReserve" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LinesStock_pkey" PRIMARY KEY ("id")
);

-- Tabela LineOperator
CREATE TABLE IF NOT EXISTS "LineOperator" (
  "id" SERIAL NOT NULL,
  "lineId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LineOperator_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LineOperator_lineId_userId_key" UNIQUE ("lineId", "userId")
);

-- Tabela Conversation
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" SERIAL NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "segment" INTEGER,
  "userName" TEXT,
  "userLine" INTEGER,
  "userId" INTEGER,
  "message" TEXT NOT NULL,
  "sender" "Sender" NOT NULL,
  "datetime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tabulation" INTEGER,
  "messageType" TEXT NOT NULL DEFAULT 'text',
  "mediaUrl" TEXT,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "isAdminTest" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- Tabela ConversationOperatorBinding (Nova - vínculo 24h)
CREATE TABLE IF NOT EXISTS "ConversationOperatorBinding" (
  "id" SERIAL NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "lineId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationOperatorBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationOperatorBinding_contactPhone_lineId_key" UNIQUE ("contactPhone", "lineId")
);

-- Tabela Tag
CREATE TABLE IF NOT EXISTS "Tag" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "segment" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- Tabela ApiLog
CREATE TABLE IF NOT EXISTS "ApiLog" (
  "id" SERIAL NOT NULL,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "requestPayload" TEXT NOT NULL,
  "responsePayload" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

-- Tabela Template
CREATE TABLE IF NOT EXISTS "Template" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'pt_BR',
  "category" TEXT NOT NULL DEFAULT 'MARKETING',
  "segmentId" INTEGER,
  "lineId" INTEGER,
  "namespace" TEXT,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "headerType" TEXT,
  "headerContent" TEXT,
  "bodyText" TEXT NOT NULL,
  "footerText" TEXT,
  "buttons" TEXT,
  "variables" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- Tabela TemplateMessage
CREATE TABLE IF NOT EXISTS "TemplateMessage" (
  "id" SERIAL NOT NULL,
  "templateId" INTEGER NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "contactName" TEXT,
  "lineId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "messageId" TEXT,
  "variables" TEXT,
  "errorMessage" TEXT,
  "campaignId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemplateMessage_pkey" PRIMARY KEY ("id")
);

-- Tabela ControlPanel
CREATE TABLE IF NOT EXISTS "ControlPanel" (
  "id" SERIAL NOT NULL,
  "segmentId" INTEGER,
  "blockPhrasesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "blockPhrases" TEXT,
  "blockTabulationId" INTEGER,
  "cpcCooldownEnabled" BOOLEAN NOT NULL DEFAULT true,
  "cpcCooldownHours" INTEGER NOT NULL DEFAULT 24,
  "resendCooldownEnabled" BOOLEAN NOT NULL DEFAULT true,
  "resendCooldownHours" INTEGER NOT NULL DEFAULT 24,
  "repescagemEnabled" BOOLEAN NOT NULL DEFAULT false,
  "repescagemMaxMessages" INTEGER NOT NULL DEFAULT 2,
  "repescagemCooldownHours" INTEGER NOT NULL DEFAULT 24,
  "repescagemMaxAttempts" INTEGER NOT NULL DEFAULT 2,
  "activeEvolutions" TEXT,
  "autoMessageEnabled" BOOLEAN NOT NULL DEFAULT false,
  "autoMessageHours" INTEGER NOT NULL DEFAULT 24,
  "autoMessageText" TEXT,
  "autoMessageMaxAttempts" INTEGER NOT NULL DEFAULT 1,
  "sharedLineMode" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ControlPanel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ControlPanel_segmentId_key" UNIQUE ("segmentId")
);

-- Tabela ContactRepescagem
CREATE TABLE IF NOT EXISTS "ContactRepescagem" (
  "id" SERIAL NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "operatorId" INTEGER NOT NULL,
  "messagesCount" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" TIMESTAMP(3),
  "permanentBlock" BOOLEAN NOT NULL DEFAULT false,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactRepescagem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactRepescagem_contactPhone_operatorId_key" UNIQUE ("contactPhone", "operatorId")
);

-- Tabela SendHistory
CREATE TABLE IF NOT EXISTS "SendHistory" (
  "id" SERIAL NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "campaignId" INTEGER,
  "lineId" INTEGER,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SendHistory_pkey" PRIMARY KEY ("id")
);

-- Tabela MessageQueue
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "MessageQueue_pkey" PRIMARY KEY ("id")
);

-- Tabela SystemEvent
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

-- Tabela OperatorQueue
CREATE TABLE IF NOT EXISTS "OperatorQueue" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "segmentId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "assignedLineId" INTEGER,
  CONSTRAINT "OperatorQueue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperatorQueue_userId_status_key" UNIQUE ("userId", "status")
);

-- Tabela LineAvailabilityLog
CREATE TABLE IF NOT EXISTS "LineAvailabilityLog" (
  "id" SERIAL NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalActiveLines" INTEGER NOT NULL,
  "linesWithZeroOperators" INTEGER NOT NULL,
  "linesWithOneOperator" INTEGER NOT NULL,
  "linesWithTwoOperators" INTEGER NOT NULL,
  "operatorsOnline" INTEGER NOT NULL,
  "operatorsWithoutLine" INTEGER NOT NULL,
  "operatorsInQueue" INTEGER NOT NULL,
  "availabilityPercent" DECIMAL(5,2) NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  CONSTRAINT "LineAvailabilityLog_pkey" PRIMARY KEY ("id")
);

COMMIT;

-- ===================================================================
-- PARTE 3: ADICIONAR FOREIGN KEYS E CONSTRAINTS
-- ===================================================================

BEGIN;

-- Foreign Keys User
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_createdLines_fkey'
  ) THEN
    ALTER TABLE "LinesStock" ADD CONSTRAINT "User_createdLines_fkey" 
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Foreign Keys LineOperator
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LineOperator_lineId_fkey'
  ) THEN
    ALTER TABLE "LineOperator" ADD CONSTRAINT "LineOperator_lineId_fkey" 
    FOREIGN KEY ("lineId") REFERENCES "LinesStock"("id") ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LineOperator_userId_fkey'
  ) THEN
    ALTER TABLE "LineOperator" ADD CONSTRAINT "LineOperator_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Foreign Keys OperatorQueue
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OperatorQueue_userId_fkey'
  ) THEN
    ALTER TABLE "OperatorQueue" ADD CONSTRAINT "OperatorQueue_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OperatorQueue_segmentId_fkey'
  ) THEN
    ALTER TABLE "OperatorQueue" ADD CONSTRAINT "OperatorQueue_segmentId_fkey" 
    FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OperatorQueue_assignedLineId_fkey'
  ) THEN
    ALTER TABLE "OperatorQueue" ADD CONSTRAINT "OperatorQueue_assignedLineId_fkey" 
    FOREIGN KEY ("assignedLineId") REFERENCES "LinesStock"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Foreign Keys SystemEvent
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SystemEvent_userId_fkey'
  ) THEN
    ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

-- ===================================================================
-- PARTE 4: CRIAR ÍNDICES
-- ===================================================================

BEGIN;

-- Índices User
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_segment_idx" ON "User"("segment");
CREATE INDEX IF NOT EXISTS "User_line_idx" ON "User"("line");
CREATE INDEX IF NOT EXISTS "User_role_status_idx" ON "User"("role", "status");
CREATE INDEX IF NOT EXISTS "User_identifier_idx" ON "User"("identifier");

-- Índices Segment
CREATE INDEX IF NOT EXISTS "Segment_name_idx" ON "Segment"("name");
CREATE INDEX IF NOT EXISTS "Segment_identifier_idx" ON "Segment"("identifier");

-- Índices Tabulation
CREATE INDEX IF NOT EXISTS "Tabulation_name_idx" ON "Tabulation"("name");

-- Índices Contact
CREATE INDEX IF NOT EXISTS "Contact_phone_idx" ON "Contact"("phone");
CREATE INDEX IF NOT EXISTS "Contact_cpf_idx" ON "Contact"("cpf");
CREATE INDEX IF NOT EXISTS "Contact_segment_idx" ON "Contact"("segment");
CREATE INDEX IF NOT EXISTS "Contact_isCPC_idx" ON "Contact"("isCPC");

-- Índices Campaign
CREATE INDEX IF NOT EXISTS "Campaign_contactPhone_idx" ON "Campaign"("contactPhone");
CREATE INDEX IF NOT EXISTS "Campaign_contactSegment_idx" ON "Campaign"("contactSegment");
CREATE INDEX IF NOT EXISTS "Campaign_lineReceptor_idx" ON "Campaign"("lineReceptor");
CREATE INDEX IF NOT EXISTS "Campaign_response_idx" ON "Campaign"("response");
CREATE INDEX IF NOT EXISTS "Campaign_dateTime_idx" ON "Campaign"("dateTime");
CREATE INDEX IF NOT EXISTS "Campaign_templateId_idx" ON "Campaign"("templateId");
CREATE INDEX IF NOT EXISTS "Campaign_name_idx" ON "Campaign"("name");

-- Índices BlockList
CREATE INDEX IF NOT EXISTS "BlockList_phone_idx" ON "BlockList"("phone");
CREATE INDEX IF NOT EXISTS "BlockList_cpf_idx" ON "BlockList"("cpf");

-- Índices LinesStock
CREATE INDEX IF NOT EXISTS "LinesStock_phone_idx" ON "LinesStock"("phone");
CREATE INDEX IF NOT EXISTS "LinesStock_lineStatus_idx" ON "LinesStock"("lineStatus");
CREATE INDEX IF NOT EXISTS "LinesStock_segment_idx" ON "LinesStock"("segment");
CREATE INDEX IF NOT EXISTS "LinesStock_linkedTo_idx" ON "LinesStock"("linkedTo");
CREATE INDEX IF NOT EXISTS "LinesStock_evolutionName_idx" ON "LinesStock"("evolutionName");
CREATE INDEX IF NOT EXISTS "LinesStock_createdBy_idx" ON "LinesStock"("createdBy");
CREATE INDEX IF NOT EXISTS "LinesStock_isReserve_idx" ON "LinesStock"("isReserve");

-- Índices LineOperator
CREATE INDEX IF NOT EXISTS "LineOperator_lineId_idx" ON "LineOperator"("lineId");
CREATE INDEX IF NOT EXISTS "LineOperator_userId_idx" ON "LineOperator"("userId");

-- Índices Evolution
CREATE INDEX IF NOT EXISTS "Evolution_evolutionName_idx" ON "Evolution"("evolutionName");

-- Índices Conversation
CREATE INDEX IF NOT EXISTS "Conversation_contactPhone_idx" ON "Conversation"("contactPhone");
CREATE INDEX IF NOT EXISTS "Conversation_segment_idx" ON "Conversation"("segment");
CREATE INDEX IF NOT EXISTS "Conversation_userLine_idx" ON "Conversation"("userLine");
CREATE INDEX IF NOT EXISTS "Conversation_userId_idx" ON "Conversation"("userId");
CREATE INDEX IF NOT EXISTS "Conversation_tabulation_idx" ON "Conversation"("tabulation");
CREATE INDEX IF NOT EXISTS "Conversation_datetime_idx" ON "Conversation"("datetime");
CREATE INDEX IF NOT EXISTS "Conversation_archived_datetime_idx" ON "Conversation"("archived", "datetime");
CREATE INDEX IF NOT EXISTS "Conversation_archivedAt_idx" ON "Conversation"("archivedAt");

-- Índices ConversationOperatorBinding
CREATE INDEX IF NOT EXISTS "ConversationOperatorBinding_contactPhone_lineId_idx" ON "ConversationOperatorBinding"("contactPhone", "lineId");
CREATE INDEX IF NOT EXISTS "ConversationOperatorBinding_userId_idx" ON "ConversationOperatorBinding"("userId");
CREATE INDEX IF NOT EXISTS "ConversationOperatorBinding_expiresAt_idx" ON "ConversationOperatorBinding"("expiresAt");

-- Índices Tag
CREATE INDEX IF NOT EXISTS "Tag_name_idx" ON "Tag"("name");
CREATE INDEX IF NOT EXISTS "Tag_segment_idx" ON "Tag"("segment");

-- Índices ApiLog
CREATE INDEX IF NOT EXISTS "ApiLog_endpoint_idx" ON "ApiLog"("endpoint");
CREATE INDEX IF NOT EXISTS "ApiLog_method_idx" ON "ApiLog"("method");
CREATE INDEX IF NOT EXISTS "ApiLog_statusCode_idx" ON "ApiLog"("statusCode");
CREATE INDEX IF NOT EXISTS "ApiLog_createdAt_idx" ON "ApiLog"("createdAt");

-- Índices Template
CREATE INDEX IF NOT EXISTS "Template_name_idx" ON "Template"("name");
CREATE INDEX IF NOT EXISTS "Template_segmentId_idx" ON "Template"("segmentId");
CREATE INDEX IF NOT EXISTS "Template_status_idx" ON "Template"("status");
CREATE INDEX IF NOT EXISTS "Template_category_idx" ON "Template"("category");

-- Índices TemplateMessage
CREATE INDEX IF NOT EXISTS "TemplateMessage_templateId_idx" ON "TemplateMessage"("templateId");
CREATE INDEX IF NOT EXISTS "TemplateMessage_contactPhone_idx" ON "TemplateMessage"("contactPhone");
CREATE INDEX IF NOT EXISTS "TemplateMessage_lineId_idx" ON "TemplateMessage"("lineId");
CREATE INDEX IF NOT EXISTS "TemplateMessage_status_idx" ON "TemplateMessage"("status");
CREATE INDEX IF NOT EXISTS "TemplateMessage_campaignId_idx" ON "TemplateMessage"("campaignId");
CREATE INDEX IF NOT EXISTS "TemplateMessage_createdAt_idx" ON "TemplateMessage"("createdAt");

-- Índices ControlPanel
CREATE INDEX IF NOT EXISTS "ControlPanel_segmentId_idx" ON "ControlPanel"("segmentId");

-- Índices ContactRepescagem
CREATE INDEX IF NOT EXISTS "ContactRepescagem_contactPhone_idx" ON "ContactRepescagem"("contactPhone");
CREATE INDEX IF NOT EXISTS "ContactRepescagem_operatorId_idx" ON "ContactRepescagem"("operatorId");
CREATE INDEX IF NOT EXISTS "ContactRepescagem_blockedUntil_idx" ON "ContactRepescagem"("blockedUntil");

-- Índices SendHistory
CREATE INDEX IF NOT EXISTS "SendHistory_contactPhone_idx" ON "SendHistory"("contactPhone");
CREATE INDEX IF NOT EXISTS "SendHistory_sentAt_idx" ON "SendHistory"("sentAt");

-- Índices MessageQueue
CREATE INDEX IF NOT EXISTS "MessageQueue_status_idx" ON "MessageQueue"("status");
CREATE INDEX IF NOT EXISTS "MessageQueue_contactPhone_idx" ON "MessageQueue"("contactPhone");
CREATE INDEX IF NOT EXISTS "MessageQueue_segment_idx" ON "MessageQueue"("segment");
CREATE INDEX IF NOT EXISTS "MessageQueue_createdAt_idx" ON "MessageQueue"("createdAt");

-- Índices SystemEvent
CREATE INDEX IF NOT EXISTS "SystemEvent_type_idx" ON "SystemEvent"("type");
CREATE INDEX IF NOT EXISTS "SystemEvent_module_idx" ON "SystemEvent"("module");
CREATE INDEX IF NOT EXISTS "SystemEvent_userId_idx" ON "SystemEvent"("userId");
CREATE INDEX IF NOT EXISTS "SystemEvent_severity_idx" ON "SystemEvent"("severity");
CREATE INDEX IF NOT EXISTS "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");

-- Índices OperatorQueue
CREATE INDEX IF NOT EXISTS "OperatorQueue_status_priority_createdAt_idx" ON "OperatorQueue"("status", "priority", "createdAt");
CREATE INDEX IF NOT EXISTS "OperatorQueue_segmentId_idx" ON "OperatorQueue"("segmentId");
CREATE INDEX IF NOT EXISTS "OperatorQueue_userId_idx" ON "OperatorQueue"("userId");

-- Índices LineAvailabilityLog
CREATE INDEX IF NOT EXISTS "LineAvailabilityLog_timestamp_idx" ON "LineAvailabilityLog"("timestamp");
CREATE INDEX IF NOT EXISTS "LineAvailabilityLog_severity_idx" ON "LineAvailabilityLog"("severity");

COMMIT;

-- ===================================================================
-- PARTE 5: CRIAR TRIGGERS PARA UPDATEDAT
-- ===================================================================

BEGIN;

-- Função para atualizar updatedAt
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $function$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- Triggers para updatedAt
DO $$ 
DECLARE
  tables_to_update TEXT[] := ARRAY[
    'User', 'Segment', 'Tabulation', 'Contact', 'Campaign', 'BlockList',
    'LinesStock', 'LineOperator', 'Evolution', 'Conversation', 
    'ConversationOperatorBinding', 'Tag', 'Template', 'TemplateMessage',
    'ControlPanel', 'ContactRepescagem', 'MessageQueue', 'OperatorQueue'
  ];
  table_name TEXT;
  trigger_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY tables_to_update
  LOOP
    trigger_name := table_name || '_updatedAt';
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = trigger_name
    ) THEN
      EXECUTE format('
        CREATE TRIGGER %I
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()',
        trigger_name, table_name
      );
      RAISE NOTICE 'Trigger % criado com sucesso', trigger_name;
    ELSE
      RAISE NOTICE 'Trigger % já existe', trigger_name;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ===================================================================
-- PARTE 6: ADICIONAR CAMPO 'digital' AO ENUM ROLE (se não existir)
-- ===================================================================
-- IMPORTANTE: ALTER TYPE não pode ser executado dentro de transação
-- Se o enum Role já existia sem 'digital', execute este comando separadamente

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'digital' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')
    ) THEN
      RAISE NOTICE '⚠️  ATENÇÃO: O valor "digital" não existe no enum Role.';
      RAISE NOTICE 'Execute manualmente após este script: ALTER TYPE "Role" ADD VALUE ''digital'';';
    ELSE
      RAISE NOTICE '✅ O valor "digital" já existe no enum Role';
    END IF;
  ELSE
    RAISE NOTICE '✅ Enum Role foi criado com "digital" incluído';
  END IF;
END $$;

-- ===================================================================
-- PARTE 7: VALIDAÇÃO FINAL
-- ===================================================================

BEGIN;

DO $$
DECLARE
  table_count INTEGER;
  enum_count INTEGER;
BEGIN
  -- Contar tabelas criadas
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name IN (
    'User', 'Segment', 'Tabulation', 'Contact', 'Campaign', 'BlockList',
    'LinesStock', 'LineOperator', 'Evolution', 'Conversation',
    'ConversationOperatorBinding', 'Tag', 'ApiLog', 'Template',
    'TemplateMessage', 'ControlPanel', 'ContactRepescagem', 'SendHistory',
    'MessageQueue', 'SystemEvent', 'OperatorQueue', 'LineAvailabilityLog'
  );

  -- Contar enums criados
  SELECT COUNT(*) INTO enum_count
  FROM pg_type
  WHERE typname IN ('Role', 'Status', 'LineStatus', 'Sender', 'Speed', 'Identifier');

  RAISE NOTICE '========================================';
  RAISE NOTICE 'RELATÓRIO FINAL:';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tabelas criadas: %', table_count;
  RAISE NOTICE 'Enums criados: %', enum_count;
  RAISE NOTICE '========================================';

  IF table_count < 22 THEN
    RAISE WARNING 'Algumas tabelas podem não ter sido criadas. Verifique os logs acima.';
  ELSE
    RAISE NOTICE '✅ Todas as tabelas foram criadas com sucesso!';
  END IF;
END $$;

COMMIT;

-- ===================================================================
-- PARTE 8: CRIAR USUÁRIO ADMIN PADRÃO
-- ===================================================================
-- IMPORTANTE: A senha precisa ser hasheada com argon2
-- Execute o script Node.js create_admin_user.js após este SQL
-- OU execute manualmente via backend (API ou seed)

BEGIN;

-- Criar usuário admin padrão
-- Email: admin@taticamarketing.com.br
-- Senha: Estreluda1.
DO $$
BEGIN
  -- Verificar se o usuário já existe
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE "email" = 'admin@taticamarketing.com.br') THEN
    -- Inserir usuário com senha hasheada (argon2)
    INSERT INTO "User" (
      "name",
      "email",
      "password",
      "role",
      "status",
      "identifier",
      "oneToOneActive"
    ) VALUES (
      'Admin',
      'admin@taticamarketing.com.br',
      '$argon2id$v=19$m=65536,t=3,p=4$si0tEOAckrmhi4wn+NEBFA$Nt0AQrJoBZ68rlEgArRvqpD8gW1i4Ez6DnG3zfkCLG0', -- Hash de 'Estreluda1.'
      'admin',
      'Offline',
      'proprietario',
      true
    );
    
    RAISE NOTICE '✅ Usuário admin criado com sucesso!';
    RAISE NOTICE '📧 Email: admin@taticamarketing.com.br';
    RAISE NOTICE '🔑 Senha: Estreluda1.';
  ELSE
    -- Se já existe, atualizar a senha (caso tenha sido alterada)
    UPDATE "User" 
    SET 
      "password" = '$argon2id$v=19$m=65536,t=3,p=4$si0tEOAckrmhi4wn+NEBFA$Nt0AQrJoBZ68rlEgArRvqpD8gW1i4Ez6DnG3zfkCLG0',
      "name" = 'Admin',
      "role" = 'admin',
      "identifier" = 'proprietario',
      "oneToOneActive" = true
    WHERE "email" = 'admin@taticamarketing.com.br';
    
    RAISE NOTICE '✅ Usuário admin atualizado: admin@taticamarketing.com.br';
    RAISE NOTICE '🔑 Senha resetada para: Estreluda1.';
  END IF;
END $$;

COMMIT;

-- ===================================================================
-- FIM DO SETUP COMPLETO
-- ===================================================================
-- 
-- PRÓXIMOS PASSOS:
-- 1. Se o enum Role não tiver 'digital', execute:
--    ALTER TYPE "Role" ADD VALUE 'digital';
--
-- 2. Execute o Prisma generate para atualizar o client:
--    npx prisma generate
--
-- 4. (Opcional) Execute o seed para criar dados iniciais:
--    npm run prisma:seed
--
-- 5. Inicie o backend:
--    npm run start:dev
--
-- ===================================================================

