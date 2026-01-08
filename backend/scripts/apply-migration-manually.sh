#!/bin/sh
# Script para aplicar a migration manualmente no banco de dados
# Use este script se a migration não for aplicada automaticamente

echo "Aplicando migration para adicionar coluna activeEvolutions..."

# Executar a migration SQL diretamente
psql $DATABASE_URL -c "ALTER TABLE \"ControlPanel\" ADD COLUMN IF NOT EXISTS \"activeEvolutions\" TEXT;"

if [ $? -eq 0 ]; then
  echo "✅ Migration aplicada com sucesso!"
else
  echo "❌ Erro ao aplicar migration"
  exit 1
fi

