# 📚 Tutorial Vend - Guia de Permissões por Perfil

Este documento descreve as funcionalidades disponíveis para cada perfil de usuário na plataforma Vend.

---

## 📋 Sumário

1. [Operador](#-operador)
2. [Supervisor](#-supervisor)
3. [Digital](#-digital)
4. [Ativador](#-ativador)
5. [Administrador](#-administrador)

---

## 👤 Operador

O **Operador** é responsável pelo atendimento direto aos clientes via WhatsApp.

### ✅ O que pode fazer:

| Funcionalidade | Descrição |
|----------------|-----------|
| **Atendimento** | Enviar e receber mensagens de clientes |
| **Conversas** | Visualizar e gerenciar suas próprias conversas |
| **Tabular conversas** | Finalizar conversas com tabulação |
| **Contatos** | Criar, visualizar e editar contatos |
| **Iniciar 1x1** | Enviar mensagem para novo contato |
| **Enviar mídia** | Enviar imagens, documentos e arquivos |
| **Templates** | Usar templates pré-aprovados |

### ❌ O que NÃO pode fazer:

- Acessar relatórios
- Criar/editar usuários
- Gerenciar linhas
- Criar campanhas
- Acessar painel de controle

### 💡 Dicas:

- As conversas ficam em **"Atendimento"** quando o cliente respondeu
- Conversas vão para **"Stand By"** após 6h sem resposta do cliente
- Sempre tabule as conversas finalizadas

---

## 📊 Supervisor

O **Supervisor** monitora a operação e tem acesso a relatórios.

### ✅ O que pode fazer:

| Funcionalidade | Descrição |
|----------------|-----------|
| **Relatórios** | Acessar todos os relatórios de produtividade |
| **Monitoramento** | Visualizar conversas de todos os operadores |
| **Usuários** | Visualizar lista de usuários |
| **Conversas** | Ver conversas ativas e tabuladas |
| **Tabulações** | Gerenciar tipos de tabulação |
| **Blocklist** | Gerenciar lista de bloqueados |
| **Logs** | Visualizar logs de API |
| **Linhas** | Visualizar status das linhas |
| **Produtividade** | Ver estatísticas de produtividade |
| **Arquivamento** | Acessar conversas arquivadas |

### ❌ O que NÃO pode fazer:

- Criar/editar linhas
- Deletar usuários
- Gerenciar evolutions
- Criar segmentos
- Gerenciar tags

### 💡 Dicas:

- Use os filtros de data nos relatórios
- Monitore o painel de produtividade regularmente
- Verifique conversas em Stand By que precisam de ação

---

## 🎯 Digital

O **Digital** gerencia campanhas e tem acesso a relatórios.

### ✅ O que pode fazer:

| Funcionalidade | Descrição |
|----------------|-----------|
| **Campanhas** | Criar, editar e disparar campanhas |
| **Relatórios** | Acessar todos os relatórios |
| **Conversas** | Visualizar e gerenciar conversas |
| **Tabulações** | Gerenciar tipos de tabulação |
| **Blocklist** | Gerenciar lista de bloqueados |
| **Contatos** | Criar e gerenciar contatos |
| **Usuários** | Criar operadores para seu segmento |
| **Templates** | Usar templates nas campanhas |

### ❌ O que NÃO pode fazer:

- Gerenciar linhas
- Criar evolutions
- Acessar painel de controle administrativo
- Deletar usuários de outros segmentos

### 💡 Dicas:

- Verifique a blocklist antes de criar campanhas
- Use filtros de segmento nos relatórios
- Monitore as taxas de resposta das campanhas

---

## 📱 Ativador

O **Ativador** é responsável por conectar e gerenciar linhas WhatsApp.

### ✅ O que pode fazer:

| Funcionalidade | Descrição |
|----------------|-----------|
| **Linhas** | Criar novas linhas |
| **QR Code** | Gerar e escanear QR Code para conectar |
| **Evolutions** | Visualizar lista de evolutions |
| **Status** | Verificar status de conexão das linhas |

### ❌ O que NÃO pode fazer:

- Deletar linhas
- Editar linhas existentes
- Acessar relatórios
- Gerenciar usuários
- Criar campanhas
- Acessar conversas

### 💡 Dicas:

- Após escanear QR Code, aguarde a tela atualizar automaticamente
- Verifique se a linha ficou "Ativa" após conexão
- Em caso de linha banida, contacte o administrador

---

## 👑 Administrador

O **Administrador** tem acesso total a todas as funcionalidades.

### ✅ O que pode fazer:

| Funcionalidade | Descrição |
|----------------|-----------|
| **Tudo** | Acesso completo a todas as funcionalidades |
| **Usuários** | Criar, editar e deletar qualquer usuário |
| **Linhas** | Criar, editar e deletar linhas |
| **Evolutions** | Gerenciar servidores Evolution |
| **Segmentos** | Criar e editar segmentos |
| **Tags** | Gerenciar tags de conversas |
| **Templates** | Criar e gerenciar templates |
| **Relatórios ADM** | Acesso a relatórios exclusivos de admin |
| **Painel de Controle** | Configurações gerais do sistema |

### 💡 Dicas:

- Revise regularmente as linhas banidas
- Monitore a produtividade dos ativadores
- Configure corretamente os segmentos
- Mantenha os templates atualizados

---

## 📞 Suporte Rápido

### Problema: Conversa sumiu após atualizar a página
**Solução:** A conversa pode estar em outra aba (Stand By ou Finalizadas). Verifique os filtros.

### Problema: Não consigo enviar mensagem
**Solução:** Verifique se há linha disponível. Se o erro persistir, contacte o ativador ou admin.

### Problema: QR Code não aparece
**Solução:** Clique em "Atualizar QR Code" ou aguarde alguns segundos e tente novamente.

### Problema: Linha foi banida automaticamente
**Solução:** Isso ocorre após falhas de envio repetidas. O ativador deve conectar uma nova linha.

---

## 🔐 Matriz de Permissões

| Funcionalidade | Operador | Supervisor | Digital | Ativador | Admin |
|----------------|:--------:|:----------:|:-------:|:--------:|:-----:|
| Atendimento | ✅ | 👁️ | ✅ | ❌ | ✅ |
| Relatórios | ❌ | ✅ | ✅ | ❌ | ✅ |
| Campanhas | ❌ | ❌ | ✅ | ❌ | ✅ |
| Criar Linhas | ❌ | ❌ | ❌ | ✅ | ✅ |
| Deletar Linhas | ❌ | ❌ | ❌ | ❌ | ✅ |
| QR Code | ❌ | ❌ | ❌ | ✅ | ✅ |
| Criar Usuários | ❌ | ❌ | ⚡* | ❌ | ✅ |
| Tabulações | ✅ | ✅ | ✅ | ❌ | ✅ |
| Blocklist | ❌ | ✅ | ✅ | ❌ | ✅ |
| Evolutions | ❌ | ❌ | ❌ | 👁️ | ✅ |
| Segmentos | ❌ | ❌ | ❌ | ❌ | ✅ |
| Tags | ❌ | ❌ | ❌ | ❌ | ✅ |

**Legenda:**
- ✅ Acesso total
- ⚡* Acesso parcial (apenas para seu segmento)
- 👁️ Apenas visualização
- ❌ Sem acesso

---

*Documento gerado em Janeiro de 2026 - Vend v2.0*
