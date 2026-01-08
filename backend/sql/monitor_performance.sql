-- ============================================
-- SCRIPT DE MONITORAMENTO DE PERFORMANCE
-- ============================================
-- Execute periodicamente para monitorar a saúde do banco

-- ============================================
-- 1. CONEXÕES ATIVAS
-- ============================================
SELECT 
  '=== CONEXÕES ===' as info,
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active,
  count(*) FILTER (WHERE state = 'idle') as idle,
  count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
  round(count(*)::numeric / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') * 100, 2) as usage_pct
FROM pg_stat_activity
WHERE datname = current_database();

-- ============================================
-- 2. QUERIES LENTAS (> 1 segundo)
-- ============================================
SELECT 
  '=== QUERIES LENTAS ===' as info,
  pid,
  usename,
  application_name,
  state,
  now() - query_start AS duration,
  LEFT(query, 100) as query_preview
FROM pg_stat_activity
WHERE (now() - query_start) > interval '1 second'
  AND state != 'idle'
  AND datname = current_database()
ORDER BY duration DESC
LIMIT 10;

-- ============================================
-- 3. TAMANHO DAS TABELAS
-- ============================================
SELECT 
  '=== TAMANHO DAS TABELAS ===' as info,
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size,
  n_live_tup as row_count,
  n_dead_tup as dead_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- ============================================
-- 4. ÍNDICES MAIS USADOS
-- ============================================
SELECT 
  '=== ÍNDICES MAIS USADOS ===' as info,
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC
LIMIT 10;

-- ============================================
-- 5. ÍNDICES NUNCA USADOS (candidatos a remoção)
-- ============================================
SELECT 
  '=== ÍNDICES NUNCA USADOS ===' as info,
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================
-- 6. CONFIGURAÇÕES ATUAIS
-- ============================================
SELECT 
  '=== CONFIGURAÇÕES ===' as info,
  name,
  setting,
  unit,
  context
FROM pg_settings
WHERE name IN (
  'max_connections',
  'shared_buffers',
  'effective_cache_size',
  'work_mem',
  'maintenance_work_mem',
  'checkpoint_completion_target',
  'wal_buffers'
)
ORDER BY name;

-- ============================================
-- 7. CACHE HIT RATIO (deve ser > 95%)
-- ============================================
SELECT 
  '=== CACHE HIT RATIO ===' as info,
  round(
    (sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)) * 100,
    2
  ) as cache_hit_ratio_pct
FROM pg_statio_user_tables
WHERE schemaname = 'public';

-- ============================================
-- 8. BLOAT (Tabelas com muitos dead tuples)
-- ============================================
SELECT 
  '=== BLOAT (Dead Tuples) ===' as info,
  schemaname,
  tablename,
  n_live_tup,
  n_dead_tup,
  round(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 1000
ORDER BY n_dead_tup DESC
LIMIT 10;

