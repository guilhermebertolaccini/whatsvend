-- ============================================
-- OTIMIZAÇÕES POSTGRESQL PARA 200 USUÁRIOS
-- ============================================
-- Execute este script como superuser (postgres)
-- psql -U postgres -d seu_banco -f optimize_postgresql.sql

-- ============================================
-- 1. CONFIGURAÇÕES DE CONEXÃO
-- ============================================

-- Aumentar número máximo de conexões (padrão: 100)
-- Para 200 usuários simultâneos + margem de segurança
ALTER SYSTEM SET max_connections = 250;

-- ============================================
-- 2. MEMÓRIA (Ajustar conforme RAM disponível)
-- ============================================

-- Shared Buffers: 25% da RAM (32GB = 8GB)
-- Otimizado para servidor: 16 vCPU, 32GB RAM
ALTER SYSTEM SET shared_buffers = '8GB';

-- Effective Cache Size: 75% da RAM disponível (24GB)
-- PostgreSQL assume que o OS também usa cache
ALTER SYSTEM SET effective_cache_size = '24GB';

-- Work Memory: para operações de ordenação e hash
-- Fórmula: (RAM - shared_buffers) / (max_connections * 2)
-- (32GB - 8GB) / (250 * 2) = 24GB / 500 = ~48MB por conexão
-- Usamos 32MB para ser conservador e permitir múltiplas operações simultâneas
ALTER SYSTEM SET work_mem = '32MB';

-- Maintenance Work Memory: para operações de manutenção (VACUUM, CREATE INDEX)
-- Com 32GB RAM, podemos usar mais para manutenção
ALTER SYSTEM SET maintenance_work_mem = '2GB';

-- ============================================
-- 3. CHECKPOINT E WAL (Write-Ahead Logging)
-- ============================================

-- Reduzir frequência de checkpoints (melhora performance de escrita)
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
-- WAL buffers: 16MB é suficiente, mas com mais RAM podemos aumentar
ALTER SYSTEM SET wal_buffers = '32MB';
-- Estatísticas mais detalhadas para queries complexas
ALTER SYSTEM SET default_statistics_target = 200;
-- Checkpoint timeout: aumentar para reduzir I/O
ALTER SYSTEM SET checkpoint_timeout = '15min';

-- ============================================
-- 4. QUERY PLANNER (Otimizado para 16 vCPU)
-- ============================================

-- Habilitar parallel queries (melhora queries complexas)
-- Com 16 vCPU, podemos usar mais workers paralelos
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers = 12;
ALTER SYSTEM SET max_worker_processes = 16;
-- Parallel query cost threshold: reduzir para usar paralelismo mais frequentemente
ALTER SYSTEM SET parallel_setup_cost = 1000;
ALTER SYSTEM SET parallel_tuple_cost = 0.01;

-- ============================================
-- 5. LOGGING (Opcional - pode desabilitar em produção)
-- ============================================

-- Log apenas erros e queries lentas (> 1 segundo)
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- Log queries > 1s
ALTER SYSTEM SET log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ';
-- Log connections e desconexões (útil para debug)
ALTER SYSTEM SET log_connections = false;
ALTER SYSTEM SET log_disconnections = false;

-- ============================================
-- 6. CONEXÕES IDLE E TIMEOUTS
-- ============================================

-- Fechar conexões idle após 10 minutos (economiza recursos)
ALTER SYSTEM SET idle_in_transaction_session_timeout = '10min';
-- Statement timeout: cancelar queries muito lentas (> 5 minutos)
ALTER SYSTEM SET statement_timeout = '5min';
-- Lock timeout: aguardar locks por até 30 segundos
ALTER SYSTEM SET lock_timeout = '30s';

-- ============================================
-- 7. APLICAR CONFIGURAÇÕES
-- ============================================

-- Recarregar configurações (sem reiniciar)
SELECT pg_reload_conf();

-- ============================================
-- 8. VERIFICAR CONFIGURAÇÕES APLICADAS
-- ============================================

SELECT name, setting, unit, context 
FROM pg_settings 
WHERE name IN (
  'max_connections',
  'shared_buffers',
  'effective_cache_size',
  'work_mem',
  'maintenance_work_mem',
  'checkpoint_completion_target',
  'checkpoint_timeout',
  'wal_buffers',
  'max_parallel_workers_per_gather',
  'max_parallel_workers',
  'max_worker_processes',
  'statement_timeout',
  'lock_timeout'
)
ORDER BY name;

-- ============================================
-- 9. VERIFICAR CONEXÕES ATIVAS
-- ============================================

SELECT 
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active,
  count(*) FILTER (WHERE state = 'idle') as idle,
  count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
WHERE datname = current_database();

-- ============================================
-- 10. VERIFICAR ÍNDICES (Importante para performance)
-- ============================================

-- Listar tabelas sem índices (pode indicar problemas)
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename 
    FROM pg_indexes 
    WHERE schemaname = 'public'
  )
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

