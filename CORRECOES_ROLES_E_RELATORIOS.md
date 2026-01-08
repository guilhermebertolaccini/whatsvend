# Correções - Roles (Digital/Supervisor) e Relatórios

## 📋 Resumo das Correções Necessárias

### 1. **Roles Digital e Supervisor - Permissões**
- ✅ Role "digital" já existe no banco
- ❌ Precisa implementar filtro por domínio de email
- ❌ Precisa tag roxa no frontend para digital

### 2. **Relatórios - Correções de Colunas**
- Relatório Status Linha: Business → "ID Negócio", QualityScore → "Pontuação", Tier → "Nível"
- Relatório Resumo Atendimentos: Remover colunas duplicadas
- Relatório Consolidado: Corrigir [object Object]

---

## 🔐 1. Roles Digital e Supervisor

### Regras de Negócio:
1. **Digital:**
   - Vê tudo de todos os segmentos
   - NÃO pode ver dados de @vend ou @tatica
   - Só vê dados do mesmo domínio de email (@paschoalotto.com.br por exemplo)

2. **Supervisor:**
   - Vê apenas seu próprio segmento
   - NÃO pode ver dados de @vend ou @tatica
   - Só vê dados do mesmo domínio de email

### SQL para criar função de filtro por domínio:

```sql
-- ============================================================================
-- Função para extrair domínio do email
-- ============================================================================
CREATE OR REPLACE FUNCTION get_email_domain(email TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(SUBSTRING(email FROM '@(.*)$'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Exemplo de uso:
-- SELECT get_email_domain('usuario@paschoalotto.com.br'); -- retorna 'paschoalotto.com.br'

-- ============================================================================
-- Índice para otimizar buscas por domínio de email
-- ============================================================================
CREATE INDEX IF NOT EXISTS "User_email_domain_idx"
ON "User" (LOWER(SUBSTRING(email FROM '@(.*)$')));
```

### Modificação no Backend:

**Arquivo:** `backend/src/reports/reports.service.ts`

Adicionar função helper:

```typescript
/**
 * Helper: Filtrar usuários por domínio de email (para digital e supervisor)
 * Digital e Supervisor NÃO podem ver dados de @vend ou @tatica
 * Só podem ver dados do mesmo domínio de email que o deles
 */
private async applyEmailDomainFilter(
  whereClause: any,
  userEmail: string,
  userRole: 'digital' | 'supervisor' | string,
  userSegment?: number
): Promise<any> {
  // Extrair domínio do email do usuário logado
  const userDomain = userEmail.split('@')[1]?.toLowerCase();

  if (!userDomain) {
    return whereClause;
  }

  // Buscar todos os usuários do mesmo domínio (excluindo @vend e @tatica)
  const allowedUsers = await this.prisma.user.findMany({
    where: {
      email: {
        endsWith: `@${userDomain}`,
        NOT: {
          OR: [
            { contains: '@vend' },
            { contains: '@tatica' }
          ]
        }
      },
      // Para supervisor, filtrar também por segmento
      ...(userRole === 'supervisor' && userSegment ? { segment: userSegment } : {})
    },
    select: { id: true }
  });

  const allowedUserIds = allowedUsers.map(u => u.id);

  // Aplicar filtro na whereClause
  if (whereClause.userId) {
    whereClause.userId = { in: allowedUserIds };
  } else {
    whereClause.userId = { in: allowedUserIds };
  }

  // Para supervisor, também filtrar por segmento se aplicável
  if (userRole === 'supervisor' && userSegment) {
    whereClause.segment = userSegment;
  }

  return whereClause;
}
```

### Tag Roxa para Digital no Frontend:

**Arquivo:** `frontend.tatica/src/components/ui/badge.tsx` (ou criar se não existir)

```typescript
// Adicionar variante para digital (roxa)
const badgeVariants = cva(
  "...",
  {
    variants: {
      variant: {
        // ... outras variantes
        digital: "bg-purple-500/10 text-purple-600 border-purple-500/20",
      },
    },
  }
)
```

**Onde usar a badge (exemplo em lista de usuários):**

```tsx
{user.role === 'digital' && (
  <Badge variant="digital">Digital</Badge>
)}
```

---

## 📊 2. Correções nos Relatórios

### 2.1. Relatório Status Linha

**Problema:** Colunas com nomes em inglês não modificados

**Correção:**

```typescript
// backend/src/reports/reports.service.ts - linha ~691

return {
  Data: this.formatDate(line.updatedAt),
  Número: line.phone,
  'ID Negócio': line.businessID || 'N/A',        // Business → ID Negócio
  'Pontuação de Qualidade': 'N/A',               // QualityScore → Pontuação de Qualidade
  'Nível': 'N/A',                                // Tier → Nível
  Segmento: segment?.name || 'Sem segmento',
};
```

### 2.2. Relatório Resumo Atendimentos

**Problema:** Colunas com dados repetidos (Data Início conversa, Data de início da conversa, Data e Hora início da Conversa)

**Solução:** Buscar função `getResumoAtendimentosReport` e consolidar em uma única coluna.

Procurar por:
```typescript
'Data Início conversa': ...
'Data de início da conversa': ...
'Data e Hora ínicio da Conversa': ...
```

Substituir por:
```typescript
'Data/Hora Início': this.formatDateTime(conversation.datetime),
```

### 2.3. Relatório Consolidado

**Problema:** Dados quebrados com `[object Object]`

**Causa:** Provavelmente tentando exibir um objeto complexo como string.

**Solução:** Verificar a função `getConsolidadoReport` e serializar objetos corretamente.

Exemplo de correção:
```typescript
// ERRADO:
'Campo': someObject,

// CORRETO:
'Campo': typeof someObject === 'object' ? JSON.stringify(someObject) : someObject,
// OU melhor ainda, extrair campo específico:
'Campo': someObject?.propriedade || 'N/A',
```

---

## ✅ Checklist de Implementação

### Backend:
- [ ] Criar função SQL `get_email_domain()` e índice
- [ ] Adicionar `applyEmailDomainFilter()` em `reports.service.ts`
- [ ] Aplicar filtro em todos os relatórios para roles digital/supervisor
- [ ] Corrigir colunas do Relatório Status Linha (Business, QualityScore, Tier)
- [ ] Corrigir colunas duplicadas do Relatório Resumo Atendimentos
- [ ] Corrigir `[object Object]` do Relatório Consolidado

### Frontend:
- [ ] Adicionar variante "digital" (roxa) no Badge component
- [ ] Aplicar tag roxa onde role === 'digital' é exibido

---

## 🧪 Como Testar

### 1. Teste de Roles:
```sql
-- Criar usuário digital
INSERT INTO "User" (name, email, password, role, segment, status)
VALUES ('Digital Teste', 'digital@paschoalotto.com.br', 'hash', 'digital', NULL, 'Online');

-- Criar usuário supervisor
INSERT INTO "User" (name, email, password, role, segment, status)
VALUES ('Supervisor Teste', 'supervisor@paschoalotto.com.br', 'hash', 'supervisor', 1, 'Online');

-- Verificar filtros:
-- Digital deve ver todos os segmentos do domínio @paschoalotto.com.br
-- Supervisor deve ver apenas segmento 1 do domínio @paschoalotto.com.br
-- Ambos NÃO devem ver dados de @vend ou @tatica
```

### 2. Teste de Relatórios:
1. Gerar Relatório Status Linha → verificar colunas traduzidas
2. Gerar Relatório Resumo Atendimentos → verificar que não há colunas duplicadas
3. Gerar Relatório Consolidado → verificar que não há `[object Object]`

---

## 📝 Próximos Passos

1. Executar SQL de criação de função de domínio
2. Modificar `reports.service.ts` com filtros
3. Atualizar frontend com tag roxa
4. Testar com usuários digital/supervisor
5. Corrigir relatórios um por um

