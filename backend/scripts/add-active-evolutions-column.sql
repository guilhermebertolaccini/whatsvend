-- Script SQL para adicionar coluna activeEvolutions ao ControlPanel
-- Execute este script diretamente no banco de dados se a migration não for aplicada automaticamente

ALTER TABLE "ControlPanel" ADD COLUMN IF NOT EXISTS "activeEvolutions" TEXT;

