-- Adicionar campo allowsFreeMessage na tabela Segment
-- Se false: só pode chamar no 1x1 através de templates
-- Se true: pode chamar no 1x1 com qualquer mensagem

ALTER TABLE "Segment" 
ADD COLUMN IF NOT EXISTS "allowsFreeMessage" BOOLEAN NOT NULL DEFAULT true;

-- Comentário explicativo
COMMENT ON COLUMN "Segment"."allowsFreeMessage" IS 'Se true, permite mensagens livres no 1x1. Se false, só permite templates.';

-- Verificar a alteração
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'Segment' AND column_name = 'allowsFreeMessage';

