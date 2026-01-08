-- Atualizar role de usuários específicos para supervisor
-- Baseado na lista de emails fornecida

UPDATE "User"
SET 
  role = 'supervisor',
  "updatedAt" = NOW()
WHERE email IN (
  'lubernini@paschoalotto.com.br',
  'brucdfonseca@paschoalotto.com.br',
  'bvroliveira@paschoalotto.com.br',
  'jazsouza@paschoalotto.com.br',
  'mrnunes@paschoalotto.com.br',
  'egfsantos@paschoalotto.com.br',
  'ygscavinato@paschoalotto.com.br',
  'gdsgregorio@paschoalotto.com.br',
  'ggtorres@paschoalotto.com.br',
  'ldstorres@paschoalotto.com.br',
  'fgmastrangelo@paschoalotto.com.br',
  'edohohmuth@paschoalotto.com.br',
  'hmcsilva@paschoalotto.com.br',
  'whaka@paschoalotto.com.br',
  'idainezi@paschoalotto.com.br',
  'vinpmdcamargo@paschoalotto.com.br',
  'jdias@paschoalotto.com.br',
  'jhcnsantos@paschoalotto.com.br'
);

-- Verificar quantos usuários foram atualizados
SELECT 
  COUNT(*) as total_atualizados,
  role,
  COUNT(*) FILTER (WHERE role = 'supervisor') as agora_supervisores
FROM "User"
WHERE email IN (
  'lubernini@paschoalotto.com.br',
  'brucdfonseca@paschoalotto.com.br',
  'bvroliveira@paschoalotto.com.br',
  'jazsouza@paschoalotto.com.br',
  'mrnunes@paschoalotto.com.br',
  'egfsantos@paschoalotto.com.br',
  'ygscavinato@paschoalotto.com.br',
  'gdsgregorio@paschoalotto.com.br',
  'ggtorres@paschoalotto.com.br',
  'ldstorres@paschoalotto.com.br',
  'fgmastrangelo@paschoalotto.com.br',
  'edohohmuth@paschoalotto.com.br',
  'hmcsilva@paschoalotto.com.br',
  'whaka@paschoalotto.com.br',
  'idainezi@paschoalotto.com.br',
  'vinpmdcamargo@paschoalotto.com.br',
  'jdias@paschoalotto.com.br',
  'jhcnsantos@paschoalotto.com.br'
)
GROUP BY role;

