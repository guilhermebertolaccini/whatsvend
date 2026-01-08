# ⚡ Guia Rápido - Otimização PostgreSQL

## 🚀 Passo a Passo (5 minutos)

### 1. Verificar RAM do servidor
```bash
free -h
# Anote a quantidade de RAM total
```

### 2. Editar configurações de memória

Abra `backend/sql/optimize_postgresql.sql` e ajuste conforme sua RAM:

**Para servidor com 8GB RAM:**
```sql
shared_buffers = '2GB'
effective_cache_size = '4GB'
```

**Para servidor com 16GB RAM:**
```sql
shared_buffers = '4GB'
effective_cache_size = '8GB'
```

### 3. Executar otimizações

```bash
# Se estiver usando Docker
docker exec -i vend-postgres psql -U postgres -d vend < backend/sql/optimize_postgresql.sql

# Se estiver rodando localmente
psql -U postgres -d vend -f backend/sql/optimize_postgresql.sql
```

### 4. Criar índices adicionais

```bash
# Docker
docker exec -i vend-postgres psql -U postgres -d vend < backend/sql/create_additional_indexes.sql

# Local
psql -U postgres -d vend -f backend/sql/create_additional_indexes.sql
```

### 5. Reiniciar PostgreSQL

```bash
# Docker
docker restart vend-postgres

# Local
sudo systemctl restart postgresql
```

### 6. Atualizar DATABASE_URL no .env

No arquivo `backend/.env`, atualize a `DATABASE_URL`:

```env
# ANTES
DATABASE_URL="postgresql://user:pass@host:5432/vend"

# DEPOIS (com connection pool)
DATABASE_URL="postgresql://user:pass@host:5432/vend?connection_limit=20&pool_timeout=20&connect_timeout=10"
```

### 7. Reiniciar backend

```bash
# Docker
docker restart vend-backend

# Local
# Reinicie o processo Node.js
```

### 8. Verificar se está funcionando

```bash
# Executar script de monitoramento
docker exec -i vend-postgres psql -U postgres -d vend < backend/sql/monitor_performance.sql
```

## ✅ Resultados Esperados

Após otimizações, você deve ver:
- ✅ `max_connections = 200`
- ✅ `shared_buffers` configurado (25% da RAM)
- ✅ `effective_cache_size` configurado (50-75% da RAM)
- ✅ Cache hit ratio > 95%
- ✅ Índices criados e sendo usados

## 📊 Monitoramento Contínuo

Execute periodicamente:
```bash
docker exec -i vend-postgres psql -U postgres -d vend < backend/sql/monitor_performance.sql
```

## 🆘 Problemas Comuns

### "permission denied"
```bash
# Execute como superuser
sudo -u postgres psql -d vend -f backend/sql/optimize_postgresql.sql
```

### "too many connections"
- Aumente `max_connections` no script
- Ou use PgBouncer (ver documentação completa)

### Queries ainda lentas
- Verifique se os índices foram criados: `\di` no psql
- Execute `ANALYZE` nas tabelas principais

