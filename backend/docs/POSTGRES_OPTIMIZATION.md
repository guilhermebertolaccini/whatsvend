# 🚀 Guia de Otimização PostgreSQL - 200 Usuários Simultâneos

## 📋 Pré-requisitos

- Acesso ao PostgreSQL como superuser (postgres)
- Conhecer a quantidade de RAM disponível no servidor
- PostgreSQL 12+ (recomendado 14+)

## 🔧 Passo 1: Ajustar Configurações do PostgreSQL

### 1.1 Localizar arquivo de configuração

```bash
# Encontrar onde está o postgresql.conf
sudo -u postgres psql -c "SHOW config_file;"
```

Ou se estiver usando Docker:
```bash
docker exec -it vend-postgres psql -U postgres -c "SHOW config_file;"
```

### 1.2 Executar script de otimização

```bash
# Se estiver rodando localmente
psql -U postgres -d vend -f backend/sql/optimize_postgresql.sql

# Se estiver usando Docker
docker exec -i vend-postgres psql -U postgres -d vend < backend/sql/optimize_postgresql.sql
```

**⚠️ IMPORTANTE**: Antes de executar, edite o arquivo `optimize_postgresql.sql` e ajuste:
- `shared_buffers`: 25% da sua RAM total
- `effective_cache_size`: 50-75% da sua RAM total

**Exemplos:**
- Servidor com 8GB RAM: `shared_buffers = '2GB'`, `effective_cache_size = '4GB'`
- Servidor com 16GB RAM: `shared_buffers = '4GB'`, `effective_cache_size = '8GB'`

### 1.3 Reiniciar PostgreSQL

```bash
# Local
sudo systemctl restart postgresql

# Docker
docker restart vend-postgres
```

## 📊 Passo 2: Criar Índices Adicionais

```bash
# Executar script de índices
psql -U postgres -d vend -f backend/sql/create_additional_indexes.sql

# Ou via Docker
docker exec -i vend-postgres psql -U postgres -d vend < backend/sql/create_additional_indexes.sql
```

## 🔌 Passo 3: Configurar Connection Pool no Prisma

### 3.1 Atualizar DATABASE_URL

No arquivo `.env` do backend, adicione parâmetros de pool:

```env
# Antes
DATABASE_URL="postgresql://user:pass@host:5432/vend"

# Depois (com connection pool)
DATABASE_URL="postgresql://user:pass@host:5432/vend?connection_limit=20&pool_timeout=20&connect_timeout=10"
```

**Parâmetros:**
- `connection_limit=20`: Máximo de conexões do Prisma (recomendado: 20-30)
- `pool_timeout=20`: Timeout para obter conexão do pool (segundos)
- `connect_timeout=10`: Timeout para conectar ao banco (segundos)

### 3.2 Usar PgBouncer (Opcional - Recomendado para alta carga)

PgBouncer é um connection pooler que reduz o número de conexões reais ao PostgreSQL.

**Instalação:**
```bash
# Ubuntu/Debian
sudo apt-get install pgbouncer

# Ou via Docker
docker run -d --name pgbouncer \
  -e DATABASE_URL="postgresql://user:pass@postgres:5432/vend" \
  -p 6432:6432 \
  edoburu/pgbouncer
```

**Configuração PgBouncer:**
```ini
[databases]
vend = host=postgres port=5432 dbname=vend

[pgbouncer]
pool_mode = transaction
max_client_conn = 200
default_pool_size = 20
reserve_pool_size = 5
```

**Atualizar DATABASE_URL:**
```env
DATABASE_URL="postgresql://user:pass@pgbouncer:6432/vend?connection_limit=20"
```

## 📈 Passo 4: Monitoramento

### 4.1 Verificar conexões ativas

```sql
SELECT 
  count(*) as total,
  count(*) FILTER (WHERE state = 'active') as active,
  count(*) FILTER (WHERE state = 'idle') as idle,
  count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
WHERE datname = 'vend';
```

### 4.2 Verificar queries lentas

```sql
SELECT 
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
  AND state != 'idle'
ORDER BY duration DESC;
```

### 4.3 Verificar uso de índices

```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### 4.4 Verificar tamanho das tabelas

```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## 🔍 Passo 5: Manutenção Regular

### 5.1 VACUUM (Limpeza periódica)

```sql
-- VACUUM automático (já configurado por padrão)
-- Mas pode executar manualmente se necessário:

VACUUM ANALYZE "Conversation";
VACUUM ANALYZE "Campaign";
```

### 5.2 Verificar bloat (tabelas inchadas)

```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  n_dead_tup,
  n_live_tup,
  round(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 0
ORDER BY n_dead_tup DESC;
```

## ⚡ Otimizações Avançadas

### 1. Particionamento de Tabelas Grandes

Se a tabela `Conversation` crescer muito (> 10 milhões de linhas), considere particionar por data:

```sql
-- Exemplo de particionamento mensal
CREATE TABLE "Conversation_2025_01" PARTITION OF "Conversation"
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

### 2. Read Replicas (Para relatórios pesados)

Criar réplicas de leitura para relatórios não bloquearem o banco principal.

### 3. Connection Pooling no Aplicativo

Usar bibliotecas como `pg-pool` ou PgBouncer.

## 📊 Métricas de Sucesso

Após otimizações, você deve ver:

- ✅ Queries < 100ms (média)
- ✅ CPU < 70% (média)
- ✅ RAM < 80% uso
- ✅ Conexões ativas < 80% do max_connections
- ✅ Índices sendo usados (verificar com EXPLAIN ANALYZE)

## 🚨 Troubleshooting

### Problema: "too many connections"

**Solução:**
1. Aumentar `max_connections` no postgresql.conf
2. Usar PgBouncer
3. Reduzir `connection_limit` no Prisma

### Problema: Queries lentas

**Solução:**
1. Verificar se índices estão sendo usados: `EXPLAIN ANALYZE`
2. Executar `ANALYZE` nas tabelas
3. Verificar queries com `pg_stat_statements`

### Problema: Alto uso de memória

**Solução:**
1. Reduzir `shared_buffers`
2. Reduzir `work_mem`
3. Verificar conexões idle e fechá-las

## 📚 Recursos Adicionais

- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Prisma Connection Pooling](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management)
- [PgBouncer Documentation](https://www.pgbouncer.org/)

