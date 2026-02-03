#!/bin/bash

# Script de Deploy Automatizado - NewVend
# Uso: ./deploy.sh [ambiente]
# Exemplo: ./deploy.sh production

set -e  # Parar em caso de erro

ENVIRONMENT=${1:-production}
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🚀 Iniciando deploy do NewVend (ambiente: $ENVIRONMENT)..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para log
log_info() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 1. Verificar pré-requisitos
log_info "Verificando pré-requisitos..."
command -v docker >/dev/null 2>&1 || { log_error "Docker não encontrado. Instale Docker primeiro."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { log_error "Docker Compose não encontrado. Instale Docker Compose primeiro."; exit 1; }

# 2. Backup do banco (se existir)
if docker-compose ps postgres | grep -q "Up"; then
    log_info "Fazendo backup do banco de dados..."
    mkdir -p $BACKUP_DIR
    docker-compose exec -T postgres pg_dump -U postgres vend > "$BACKUP_DIR/backup_$TIMESTAMP.sql" || log_warn "Não foi possível fazer backup"
    log_info "Backup salvo em: $BACKUP_DIR/backup_$TIMESTAMP.sql"
fi

# 3. Aplicar migrations
log_info "Aplicando migrations do banco de dados..."
if [ -f "migrations/complete_migration.sql" ]; then
    docker-compose exec -T postgres psql -U postgres -d vend -f /dev/stdin < migrations/complete_migration.sql || log_warn "Algumas migrations podem já estar aplicadas"
else
    log_warn "Arquivo de migrations não encontrado. Pulando..."
fi

# 4. Build do backend
log_info "Fazendo build do backend..."
docker-compose build backend || log_error "Erro no build do backend"

# 5. Parar serviços antigos
log_info "Parando serviços antigos..."
docker-compose down

# 6. Iniciar serviços
log_info "Iniciando serviços..."
docker-compose up -d

# 7. Aguardar serviços iniciarem
log_info "Aguardando serviços iniciarem..."
sleep 10

# 8. Verificar saúde dos serviços
log_info "Verificando saúde dos serviços..."

# Verificar backend
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    log_info "Backend está respondendo!"
else
    log_error "Backend não está respondendo. Verifique os logs: docker-compose logs backend"
    exit 1
fi

# Verificar banco
if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    log_info "PostgreSQL está rodando!"
else
    log_error "PostgreSQL não está respondendo"
    exit 1
fi

# Verificar Redis
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    log_info "Redis está rodando!"
else
    log_error "Redis não está respondendo"
    exit 1
fi

# 9. Verificar endpoints importantes
log_info "Verificando endpoints..."

if curl -f http://localhost:3000/api/docs > /dev/null 2>&1; then
    log_info "Swagger está acessível em: http://localhost:3000/api/docs"
else
    log_warn "Swagger pode não estar acessível"
fi

# Verificação de métricas removida (Prometheus desabilitado)

# 10. Mostrar status final
log_info "Deploy concluído com sucesso! 🎉"
echo ""
echo "📊 Status dos serviços:"
docker-compose ps
echo ""
echo "📝 URLs importantes:"
echo "  - API: http://localhost:3000"
echo "  - Swagger: http://localhost:3000/api/docs"
echo ""
echo "📋 Para ver logs:"
echo "  docker-compose logs -f backend"
echo ""
echo "🔄 Para reiniciar:"
echo "  docker-compose restart backend"

