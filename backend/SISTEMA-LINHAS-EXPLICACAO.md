# 📱 SISTEMA DE LINHAS - EXPLICAÇÃO COMPLETA

## 🎯 Resumo Rápido

**NÃO, a linha NÃO muda sempre que o operador faz login!**

O sistema é **inteligente** e tenta manter o operador na mesma linha que ele já tinha, desde que:
- A linha ainda exista
- A linha esteja ativa (não banida)
- A linha ainda tenha espaço (máximo 2 operadores)

---

## 🔄 FLUXO COMPLETO - O QUE ACONTECE QUANDO UM OPERADOR FAZ LOGIN

### 1️⃣ **VERIFICAÇÃO INICIAL** (Operador já tem linha?)

Quando o operador conecta via WebSocket, o sistema verifica:

```
┌─────────────────────────────────────┐
│ Operador faz login                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Já tem linha no banco?              │
│ (campo user.line)                   │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │             │
       SIM          NÃO
        │             │
        ▼             ▼
```

### 2️⃣ **SE JÁ TEM LINHA** (Cenário mais comum)

```
┌─────────────────────────────────────┐
│ Operador já tem linha               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Verificar se está na tabela         │
│ LineOperator (sincronização)        │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │             │
    JÁ ESTÁ      NÃO ESTÁ
        │             │
        │             ▼
        │     ┌───────────────────────┐
        │     │ Sincronizar: criar    │
        │     │ entrada na tabela    │
        │     └───────────┬───────────┘
        │                 │
        └─────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Linha ainda existe e está ativa?    │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │             │
       SIM          NÃO
        │             │
        │             ▼
        │     ┌───────────────────────┐
        │     │ Remover linha do     │
        │     │ operador (null)      │
        │     │ Buscar nova linha    │
        │     └──────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ Linha tem menos de 2 operadores?    │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │             │
       SIM          NÃO
        │             │
        │             ▼
        │     ┌───────────────────────┐
        │     │ Linha cheia!         │
        │     │ Buscar nova linha    │
        │     └──────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ ✅ MANTÉM A MESMA LINHA!           │
│ Operador continua com a linha      │
│ que já tinha                        │
└─────────────────────────────────────┘
```

**Resultado:** Operador mantém a mesma linha! ✅

---

### 3️⃣ **SE NÃO TEM LINHA** (Busca nova linha)

Quando o operador não tem linha (primeira vez ou linha foi removida), o sistema busca seguindo esta **PRIORIDADE**:

```
┌─────────────────────────────────────┐
│ Buscar linha disponível            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 1️⃣ PRIORIDADE: Linha do mesmo      │
│    segmento do operador             │
│    (ex: segmento 20 → linha seg 20)│
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │             │
    ENCONTROU    NÃO ENCONTROU
        │             │
        │             ▼
        │     ┌───────────────────────┐
        │     │ 2️⃣ PRIORIDADE: Linha  │
        │     │    "Padrão"           │
        │     └───────────┬───────────┘
        │                 │
        │         ┌───────┴───────┐
        │         │               │
        │    ENCONTROU      NÃO ENCONTROU
        │         │               │
        │         │               ▼
        │         │     ┌───────────────────────┐
        │         │     │ 3️⃣ PRIORIDADE:       │
        │         │     │    Qualquer linha     │
        │         │     │    ativa disponível   │
        │         │     └───────────┬───────────┘
        │         │                 │
        └─────────┴─────────────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ Verificar regras:    │
        │ • Máximo 2 operadores│
        │ • Não misturar        │
        │   segmentos          │
        │ • Evolution ativa    │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ ✅ Atribuir linha    │
        │    ao operador       │
        └──────────────────────┘
```

---

## 📋 REGRAS DE ATRIBUIÇÃO DE LINHAS

### 🔒 **Regra 1: Máximo 2 Operadores por Linha (2x1)**

```
Linha 14976001234:
├── Operador A ✅
└── Operador B ✅
    └── ❌ NÃO PODE TER MAIS OPERADORES!
```

**Por quê?** Para distribuir melhor o trabalho e evitar sobrecarga.

---

### 🎯 **Regra 2: Segmentos NÃO se Misturam**

```
❌ ERRADO:
Linha 14976001234:
├── Operador A (Segmento 20)
└── Operador B (Segmento 25)  ← ❌ Segmentos diferentes!

✅ CORRETO:
Linha 14976001234:
├── Operador A (Segmento 20)
└── Operador B (Segmento 20)  ← ✅ Mesmo segmento!
```

**Por quê?** Cada segmento tem regras e clientes específicos. Misturar pode causar confusão.

---

### 🔄 **Regra 3: Evolutions Ativas**

Apenas linhas de Evolutions **ativas** no painel de controle podem ser atribuídas.

**Exemplo:**
- Evolution "vend" → ✅ Ativa → Linhas podem ser usadas
- Evolution "secundaria" → ❌ Desativada → Linhas NÃO podem ser usadas

---

## 🔄 CENÁRIOS DE REALOCAÇÃO (Quando a linha MUDA)

A linha só muda em situações específicas:

### 1️⃣ **Linha foi Banida/Desconectada**

```
Operador está usando Linha A
         │
         ▼
Linha A foi banida pelo WhatsApp
         │
         ▼
Sistema detecta (health check)
         │
         ▼
Remove operador da Linha A
         │
         ▼
Busca nova linha disponível
         │
         ▼
Atribui Linha B ao operador
         │
         ▼
✅ Operador agora usa Linha B
```

**Quando acontece:** Durante o envio de mensagem, se a linha estiver desconectada.

---

### 2️⃣ **Operador Ficou Offline por 72 Horas**

```
Operador ficou offline
         │
         ▼
Sistema verifica (cron job)
         │
         ▼
Offline há > 72 horas?
         │
         ▼
       SIM
         │
         ▼
Remove linha do operador
         │
         ▼
Linha fica disponível para outros
```

**Quando acontece:** Job automático que roda periodicamente.

---

### 3️⃣ **Operador Não Tinha Linha**

```
Operador faz login
         │
         ▼
Não tem linha no banco
         │
         ▼
Sistema busca linha disponível
         │
         ▼
Atribui primeira linha encontrada
```

**Quando acontece:** Primeira vez que o operador usa o sistema, ou após linha ser removida.

---

### 4️⃣ **Erro ao Enviar Mensagem**

```
Operador tenta enviar mensagem
         │
         ▼
Erro: Linha desconectada/timeout
         │
         ▼
Sistema tenta recuperar (3 tentativas)
         │
         ▼
Realoca para nova linha
         │
         ▼
Tenta enviar mensagem novamente
```

**Quando acontece:** Durante o envio de mensagem, se houver erro de conexão.

---

## 📊 TABELAS DO BANCO DE DADOS

### **User (Operador)**
```sql
user.line  -- ID da linha atual (pode ser NULL)
user.segment  -- Segmento do operador
```

### **LineOperator (Vínculo Operador ↔ Linha)**
```sql
lineId  -- ID da linha
userId  -- ID do operador
```

**Importante:** Esta tabela é a **fonte da verdade**. O campo `user.line` é apenas um cache.

### **LinesStock (Linhas)**
```sql
id  -- ID da linha
phone  -- Número da linha
segment  -- Segmento da linha (pode ser NULL ou "Padrão")
lineStatus  -- 'active' ou 'ban'
evolutionName  -- Qual Evolution a linha pertence
```

---

## 🎯 EXEMPLOS PRÁTICOS

### **Exemplo 1: Operador faz login pela manhã**

```
08:00 - Operador João faz login
        │
        ▼
Sistema verifica: João tem linha 14976001234
        │
        ▼
Linha existe? ✅ SIM
Linha está ativa? ✅ SIM
Linha tem espaço? ✅ SIM (só tem João)
        │
        ▼
✅ João mantém a linha 14976001234
```

**Resultado:** Mesma linha! ✅

---

### **Exemplo 2: Operador faz login após linha ser banida**

```
08:00 - Operador Maria faz login
        │
        ▼
Sistema verifica: Maria tem linha 14976005678
        │
        ▼
Linha existe? ✅ SIM
Linha está ativa? ❌ NÃO (foi banida)
        │
        ▼
Remove linha do operador
        │
        ▼
Busca nova linha disponível
        │
        ▼
Encontra linha 14976009999
        │
        ▼
✅ Maria agora usa linha 14976009999
```

**Resultado:** Linha mudou! ⚠️

---

### **Exemplo 3: Dois operadores do mesmo segmento**

```
08:00 - Operador A (Segmento 20) faz login
        │
        ▼
Atribui linha 14976001234 (Segmento 20)
        │
        ▼
09:00 - Operador B (Segmento 20) faz login
        │
        ▼
Busca linha do Segmento 20
        │
        ▼
Encontra linha 14976001234 (tem espaço)
        │
        ▼
✅ Operador B também usa linha 14976001234
```

**Resultado:** Dois operadores na mesma linha (mesmo segmento) ✅

---

## 🔍 COMO VERIFICAR A LINHA DE UM OPERADOR

### **No Banco de Dados:**

```sql
-- Ver linha atual do operador
SELECT u.name, u.line, ls.phone, ls.segment
FROM "User" u
LEFT JOIN "LinesStock" ls ON u.line = ls.id
WHERE u.email = 'operador@exemplo.com';

-- Ver todos os operadores de uma linha
SELECT u.name, u.segment
FROM "LineOperator" lo
JOIN "User" u ON lo."userId" = u.id
WHERE lo."lineId" = 123;
```

### **No Código:**

```typescript
// Verificar linha do operador
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    lineOperators: {
      include: {
        line: true,
      },
    },
  },
});

console.log('Linha atual:', user.line);
console.log('Vínculos:', user.lineOperators);
```

---

## ⚠️ PONTOS IMPORTANTES

### ✅ **O que o sistema FAZ:**

1. **Mantém** a linha do operador quando possível
2. **Sincroniza** automaticamente se necessário
3. **Busca** nova linha apenas quando necessário
4. **Respeita** regras de segmento e 2x1
5. **Realoca** automaticamente se linha for banida

### ❌ **O que o sistema NÃO FAZ:**

1. **NÃO muda** a linha a cada login (só se necessário)
2. **NÃO mistura** segmentos diferentes
3. **NÃO atribui** mais de 2 operadores por linha
4. **NÃO usa** linhas de Evolutions desativadas

---

## 🎯 CONCLUSÃO

**A linha NÃO muda sempre que o operador faz login!**

O sistema é **inteligente** e:
- ✅ Mantém a mesma linha quando possível
- ✅ Só busca nova linha quando necessário
- ✅ Realoca automaticamente em caso de problemas
- ✅ Respeita todas as regras de negócio

**A linha só muda quando:**
1. Linha foi banida/desconectada
2. Operador ficou offline > 72 horas
3. Operador não tinha linha
4. Erro ao enviar mensagem (realocação automática)

---

## 📞 SUPORTE

Se um operador está tendo problemas com linhas:
1. Verificar se a linha está ativa no banco
2. Verificar se o operador está na tabela `LineOperator`
3. Verificar se há linhas disponíveis do segmento
4. Verificar se a Evolution está ativa no painel

