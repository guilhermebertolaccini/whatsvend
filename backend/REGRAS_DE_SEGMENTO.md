# Regras de Segmentação de Linhas

## Resumo das Mudanças Implementadas

Este documento descreve as regras de negócio implementadas para garantir a correta alocação de linhas por segmento.

---

## 🚫 Regra 1: Admins NÃO recebem linhas automaticamente

**Problema:** Admins estavam recebendo linhas automaticamente ao ficarem online.

**Solução:** Admins só podem receber linhas manualmente através da interface administrativa.

### Arquivos Modificados:
- `src/websocket/websocket.gateway.ts:159` - Bloqueio na alocação automática ao ficar online
- `src/line-assignment/line-assignment.service.ts:51-53` - Bloqueio no serviço de alocação
- `src/operator-queue/operator-queue.service.ts:33-47` - Bloqueio na fila de espera

### Como funciona:
```typescript
// Verificação adicionada antes de alocar linha
if (user.role === 'admin') {
  return { success: false, reason: 'Admins não recebem linhas automaticamente' };
}
```

---

## 🔒 Regra 2: Linhas só podem ir para operadores do mesmo segmento

**Problema:** Linha do segmento X estava sendo alocada para operador do segmento Y.

**Solução:** Apenas linhas com segmento `null` ou segmento `"Padrão"` podem ser alocadas automaticamente para qualquer segmento.

### Arquivos Modificados:
- `src/line-assignment/line-assignment.service.ts:75-151`

### Prioridades de Alocação:
1. **Prioridade 1:** Linhas que já pertencem ao segmento do operador
2. **Prioridade 2:** Linhas com segmento `null` (nunca foram vinculadas)
3. **Prioridade 3:** Linhas do segmento "Padrão" (podem ser alocadas para qualquer segmento)
4. ~~Prioridade 4: Qualquer linha disponível~~ ❌ **REMOVIDO** (causava o problema)

### Código:
```typescript
// Prioridade 2: Linhas com segmento null
candidateLine = availableLines.find((line) => {
  if (excludeLineId && line.id === excludeLineId) return false;
  if (line.segment !== null) return false;
  if (line.operators.length >= 2) return false;
  if (line.operators.length > 0) return false; // Linha null NUNCA foi usada
  return true;
});

// Prioridade 3: Linhas do segmento "Padrão"
if (!candidateLine && defaultSegment) {
  candidateLine = availableLines.find((line) => {
    if (excludeLineId && line.id === excludeLineId) return false;
    if (line.segment !== defaultSegment.id) return false;
    if (line.operators.length >= 2) return false;
    // Se já tem operadores, verificar se são do mesmo segmento
    if (line.operators.length > 0) {
      const hasDifferentSegment = line.operators.some(
        (op) => op.user?.segment !== userSegment,
      );
      return !hasDifferentSegment;
    }
    return true;
  });
}
```

---

## 🎯 Regra 3: Linha ganha segmento do operador ao ser vinculada

**Problema:** Linhas não estavam herdando o segmento do operador na primeira vinculação.

**Solução:** Quando uma linha `null` ou `"Padrão"` é vinculada a um operador, ela automaticamente ganha o segmento desse operador.

### Arquivos Modificados:
- `src/line-assignment/line-assignment.service.ts:166-186`

### Como funciona:
```typescript
// REGRA IMPORTANTE: Linha ganha segmento do operador na primeira vinculação
// - Se linha tinha segmento null: recebe o segmento do operador
// - Se linha era do segmento "Padrão": recebe o segmento do operador
// - Depois disso, o segmento da linha NUNCA mais pode ser alterado
const shouldUpdateSegment =
  (candidateLine.segment === null ||
   (defaultSegment && candidateLine.segment === defaultSegment.id)) &&
  userSegment !== null;

if (shouldUpdateSegment) {
  await this.prisma.linesStock.update({
    where: { id: candidateLine.id },
    data: { segment: userSegment },
  });

  this.logger.log(
    `Linha ${candidateLine.phone} agora pertence ao segmento ${userSegment}`,
    'LineAssignment',
    { lineId: candidateLine.id, previousSegment: candidateLine.segment, newSegment: userSegment },
  );
}
```

---

## 🔐 Regra 4: Segmento da linha não pode ser alterado após vinculação

**Problema:** Era possível alterar manualmente o segmento de uma linha já vinculada.

**Solução:** Proteção no método `update()` para impedir alteração de segmento após vinculação.

### Arquivos Modificados:
- `src/lines/lines.service.ts:470-492`

### Como funciona:
```typescript
// PROTEÇÃO: Segmento da linha NÃO pode ser alterado após vinculação
if (updateLineDto.segment !== undefined) {
  const defaultSegment = await this.prisma.segment.findUnique({
    where: { name: 'Padrão' },
  });

  const isDefaultSegment = currentLine.segment === defaultSegment?.id;
  const isNullSegment = currentLine.segment === null;

  // Verificar se a linha já tem operadores vinculados
  const hasOperators = await this.prisma.lineOperator.count({
    where: { lineId: id },
  });

  if (hasOperators > 0 && !isNullSegment && !isDefaultSegment) {
    throw new BadRequestException(
      'Não é possível alterar o segmento de uma linha que já foi vinculada a operadores. ' +
      'O segmento é definido automaticamente na primeira vinculação e não pode mais ser alterado.'
    );
  }
}
```

---

## 📊 SQL para Desvincular Linhas de Admins

Arquivo: `unlink_admin_lines.sql`

```sql
-- 1. Ver quais vínculos serão removidos (executar primeiro para verificar)
SELECT
  lo.id as vinculo_id,
  lo."lineId" as linha_id,
  l.phone as telefone_linha,
  lo."userId" as usuario_id,
  u.name as nome_admin,
  u.email as email_admin
FROM line_operator lo
JOIN "user" u ON u.id = lo."userId"
JOIN lines_stock l ON l.id = lo."lineId"
WHERE u.role = 'admin'
ORDER BY u.name, l.phone;

-- 2. Remover os vínculos (executar após verificar acima)
DELETE FROM line_operator
WHERE "userId" IN (
  SELECT id FROM "user" WHERE role = 'admin'
);

-- 3. Verificar que não há mais vínculos de admins
SELECT
  u.role,
  COUNT(lo.id) as quantidade_vinculos
FROM "user" u
LEFT JOIN line_operator lo ON lo."userId" = u.id
GROUP BY u.role
ORDER BY u.role;
```

---

## ✅ Resumo das Garantias

Após essas implementações, o sistema garante:

1. ✅ Admins **NUNCA** recebem linhas automaticamente
2. ✅ Linhas **SOMENTE** vão para operadores do mesmo segmento (exceto linhas `null` e `"Padrão"`)
3. ✅ Linhas `null` e `"Padrão"` ganham automaticamente o segmento do operador ao serem vinculadas
4. ✅ Segmento da linha **NÃO pode ser alterado** após vinculação manual
5. ✅ Operadores de segmentos diferentes **NUNCA** compartilham a mesma linha
6. ✅ Sistema de prioridade garante que operadores recebem linhas do próprio segmento primeiro

---

## 🧪 Como Testar

### Teste 1: Admin não recebe linha automaticamente
1. Login como admin
2. Ficar online
3. Verificar que nenhuma linha foi alocada automaticamente

### Teste 2: Segmento é respeitado
1. Criar operador do Segmento A
2. Criar operador do Segmento B
3. Criar linha do Segmento A
4. Operador do Segmento B fica online
5. Verificar que ele **NÃO** recebe a linha do Segmento A

### Teste 3: Linha "Padrão" vira segmento do operador
1. Criar linha com segmento "Padrão"
2. Operador do Segmento X fica online e recebe essa linha
3. Verificar no banco que a linha agora tem `segment = X`

### Teste 4: Não pode alterar segmento após vinculação
1. Vincular linha a operador
2. Tentar alterar segmento da linha via API
3. Verificar erro: "Não é possível alterar o segmento de uma linha..."

---

## 📝 Notas Importantes

- O segmento "Padrão" é especial e funciona como um "curinga" que pode ser alocado para qualquer segmento
- Uma vez que uma linha é vinculada a um segmento (não-Padrão), ela **NUNCA** mais pode mudar
- Admins podem vincular linhas manualmente, mas nunca receberão automaticamente
- A fila de operadores também respeita essas regras de segmentação
