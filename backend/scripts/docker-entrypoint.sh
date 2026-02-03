#!/bin/sh
set -e

echo "🚀 Iniciando aplicação..."

# Aguardar banco de dados estar pronto
echo "⏳ Aguardando banco de dados..."
until npx prisma db push --skip-generate 2>/dev/null; do
  echo "⏳ Banco de dados não está pronto - aguardando..."
  sleep 2
done

echo "✅ Banco de dados conectado!"

# Executar migrations
echo "📦 Executando migrations..."
npx prisma migrate deploy

echo "✅ Migrations executadas!"

# Iniciar aplicação
echo "🎉 Iniciando servidor..."
exec node dist/main

