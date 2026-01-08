# RESUMO COMPLETO DE RELATÓRIOS

Este documento contém um resumo detalhado de todos os relatórios disponíveis na plataforma, incluindo suas colunas, regras e validações.

---

## REGRAS GERAIS APLICADAS A TODOS OS RELATÓRIOS

### Permissões
- **Roles permitidos**: `admin`, `supervisor`, `digital`
- **Autenticação**: JWT obrigatória
- **Operadores**: Não têm acesso aos relatórios

### Filtros Disponíveis (Query Params)
- `startDate` (opcional): Data inicial no formato YYYY-MM-DD
- `endDate` (opcional): Data final no formato YYYY-MM-DD
- `segment` (opcional): ID do segmento específico (número)

### Filtros de Identificador (cliente/proprietario)
- **Proprietário**: Vê todos os dados
- **Cliente**: Vê apenas dados do seu segmento/identificador
- **Ações de teste administrador** (`isAdminTest = true`): **SEMPRE excluídas** de todos os relatórios
- **Usuários com email contendo '@vend'**: **SEMPRE excluídos** de todos os relatórios (exceto relatório de Linhas)

### Filtro de Segmento por Role
- **Supervisor**: Só vê dados do seu próprio segmento (filtro automático aplicado)
- **Admin/Digital**: Veem todos os segmentos

---

## 1. OP SINTÉTICO
**Endpoint**: `GET /reports/op-sintetico`  
**Método**: `getOpSinteticoReport`

### Colunas
1. **Segmento** - Nome do segmento
2. **Data** - Data da conversa (YYYY-MM-DD)
3. **Hora** - Sempre  (agregado por dia)
4. **Qtd. Total Mensagens** - Total de mensagens no período
5. **Qtd. Total Entrantes** - Mensagens recebidas do contato (`sender = 'contact'`)
6. **Qtd. Promessas** - Mensagens com tabulação CPC (`tabulation.isCPC = true`)
7. **Conversão** - Percentual: (Promessas / Total Mensagens) * 100
8. **Tempo Médio Transbordo** - Sempre 
9. **Tempo Médio Espera Total** - Sempre 
10. **Tempo Médio Atendimento** - Sempre 
11. **Tempo Médio Resposta** - Sempre 

### Regras e Validações
- **Fonte de dados**: Tabela `Conversation`
- **Agrupamento**: Por segmento e data
- **Filtros aplicados**: 
  - `isAdminTest = false` (sempre)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
  - Filtro de data (se fornecido)
- **Ordenação**: Por data (ascendente)
- **Campos null**: Tempos médios sempre retornam  (não implementados)

---

## 2. KPI
**Endpoint**: `GET /reports/kpi`  
**Método**: `getKpiReport`

### Colunas
1. **Data Evento** - Data da conversa (YYYY-MM-DD)
2. **Descrição Evento** - Nome da tabulação ou "Sem Tabulação"
3. **Tipo de Evento** - "CPC" se `tabulation.isCPC = true`, senão "Atendimento"
4. **Evento Finalizador** - "Sim" se tem tabulação, "Não" caso contrário
5. **Contato** - Nome do contato (`contactName`)
6. **Identificação** - CPF do contato (da tabela `Contact`)
7. **Código Contato** - ID do contato
8. **Hashtag** - Sempre 
9. **Usuário** - Nome do operador (`userName`)
10. **Número Protocolo** - Sempre 
11. **Data Hora Geração Protocolo** - Sempre 
12. **Observação** - Mensagem da conversa
13. **SMS Principal** - Sempre 
14. **Whatsapp Principal** - Telefone do contato
15. **Email Principal** - Sempre 
16. **Canal** - Sempre "WhatsApp"
17. **Carteiras** - Nome do segmento
18. **Carteira do Evento** - Nome do segmento
19. **Valor da oportunidade** - Sempre 
20. **Identificador da chamada de Voz** - Sempre 

### Regras e Validações
- **Fonte de dados**: Tabela `Conversation` (apenas conversas tabuladas: `tabulation IS NOT NULL`)
- **Filtros aplicados**:
  - `isAdminTest = false` (sempre)
  - `tabulation IS NOT NULL` (obrigatório - apenas conversas finalizadas)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
  - Filtro de data (se fornecido)
- **Ordenação**: Por data (descendente - mais recentes primeiro)
- **Campos null**: Muitos campos retornam  (não implementados no sistema)

---

## 3. HSM (Disparos)
**Endpoint**: `GET /reports/hsm`  
**Método**: `getHsmReport`

### Colunas
1. **Contato** - Nome do contato da campanha
2. **Identificador** - CPF do contato (da tabela `Contact`)
3. **Código** - ID do contato
4. **Hashtag** - Sempre 
5. **Template** - Nome da campanha (`campaign.name`)
6. **WhatsApp do contato** - Telefone do contato
7. **Solicitação envio** - Data de criação da campanha (YYYY-MM-DD)
8. **Envio** - Data/hora do envio (`dateTime` - YYYY-MM-DD)
9. **Confirmação** - "Sim" se `response = true`, "Não" caso contrário
10. **Leitura (se habilitado)** - Sempre 
11. **Falha entrega** - "Sim" se `retryCount > 0`, "Não" caso contrário
12. **Motivo falha** - Sempre 
13. **WhatsApp de saida** - Telefone da linha (`lineReceptor.phone`)
14. **Usuário Solicitante** - Sempre 
15. **Carteira** - Nome do segmento
16. **Teve retorno** - "Sim" se `response = true`, "Não" caso contrário

### Regras e Validações
- **Fonte de dados**: Tabela `Campaign`
- **Filtros aplicados**:
  - `isAdminTest = false` (sempre)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento via `contactSegment` (se fornecido)
  - Filtro de data via `dateTime` (se fornecido)
- **Ordenação**: Por data (descendente - mais recentes primeiro)
- **Campos null**: Leitura, motivo falha, usuário solicitante sempre 

---

## 4. STATUS DE LINHA
**Endpoint**: `GET /reports/line-status`  
**Método**: `getLineStatusReport`

### Colunas
1. **Data** - Data da última atualização (`updatedAt` - YYYY-MM-DD)
2. **Numero** - Telefone da linha
3. **Business** - `businessID` da linha (pode ser )
4. **QualityScore** - Sempre 
5. **Tier** - Sempre 
6. **Segmento** - Nome do segmento da linha

### Regras e Validações
- **Fonte de dados**: Tabela `LinesStock`
- **Filtros aplicados**:
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
- **Ordenação**: Por `updatedAt` (descendente - mais recentes primeiro)
- **Campos null**: QualityScore e Tier sempre  (não implementados)

---

## 5. ENVIOS
**Endpoint**: `GET /reports/envios`  
**Método**: `getEnviosReport`

### Colunas
1. **data_envio** - Data do envio (YYYY-MM-DD)
2. **hora_envio** - Hora do envio (HH:MM:SS)
3. **fornecedor_envio** - Sempre "Vend"
4. **codigo_carteira** - ID do segmento
5. **nome_carteira** - Nome do segmento
6. **segmento_carteira** - Nome do segmento (mesmo que nome_carteira)
7. **numero_contrato** - Contrato do contato (da tabela `Contact`)
8. **cpf_cliente** - CPF do contato
9. **telefone_cliente** - Telefone do contato
10. **status_envio** - "Enviado" se `response = true`, "Falha" se `retryCount > 0`, senão "Pendente"
11. **numero_saida** - Telefone da linha (`lineReceptor.phone`)
12. **login_usuario** - Sempre 
13. **template_envio** - Nome da campanha
14. **tipo_envio** - "Campanha" se tem `campaignId`, "1x1" caso contrário
19. **cliente_respondeu** - "Sim" se `response = true`, "Não" caso contrário
20. **qtd_mensagens_cliente** - Contagem de mensagens do contato na conversa
21. **qtd_mensagens_operador** - Contagem de mensagens do operador na conversa

### Regras e Validações
- **Fonte de dados**: Tabela `Campaign` (com join em `Conversation` para contar mensagens)
- **Filtros aplicados**:
  - `isAdminTest = false` (sempre)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento via `contactSegment` (se fornecido)
  - Filtro de data via `dateTime` (se fornecido)
- **Ordenação**: Por data (descendente)
- **Campos null**: login_usuario sempre 

---

## 6. INDICADORES
**Endpoint**: `GET /reports/indicadores`  
**Método**: `getIndicadoresReport`

### Colunas
1. **data** - Data da conversa (YYYY-MM-DD)
2. **data_envio** - Data do envio da campanha relacionada (YYYY-MM-DD)
3. **inicio_atendimento** - Data/hora da primeira mensagem da conversa
4. **fim_atendimento** - Data/hora da última mensagem da conversa
5. **tma** - Tempo médio de atendimento (calculado)
6. **tipo_atendimento** - "Campanha" ou "1x1"
7. **fornecedor** - Sempre "Vend"
8. **codigo_carteira** - ID do segmento
9. **carteira** - Nome do segmento
10. **segmento** - Nome do segmento
11. **contrato** - Contrato do contato
12. **cpf** - CPF do contato
13. **telefone** - Telefone do contato
14. **status** - Status baseado em tabulação
15. **login** - Nome do operador
16. **evento** - Nome da tabulação
17. **evento_normalizado** - Nome da tabulação normalizado
18. **envio** - 1 se enviado, 0 caso contrário
19. **falha** - 1 se `retryCount > 0`, 0 caso contrário
20. **entregue** - 1 se `response = true`, 0 caso contrário
21. **lido** - Sempre 0 (não implementado)
22. **cpc** - 1 se tabulação é CPC, 0 caso contrário
23. **cpc_produtivo** - 1 se CPC e teve retorno, 0 caso contrário
24. **boleto** - Sempre 0
25. **valor** - Sempre 
26. **transbordo** - Sempre 0
27. **primeira_opcao_oferta** - Sempre 0
28. **segunda_via** - Sempre 0
29. **nota_nps** - Sempre 
30. **obs_nps** - Sempre 
31. **erro_api** - Sempre 0
32. **abandono** - Sempre 0
33. **protocolo** - Sempre 

### Regras e Validações
- **Fonte de dados**: Tabela `Conversation` (com joins em `Campaign` e `Contact`)
- **Filtros aplicados**:
  - `isAdminTest = false` (sempre)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
  - Filtro de data (se fornecido)
- **Ordenação**: Por data (descendente)
- **Cálculos**: TMA calculado como diferença entre fim e início do atendimento
- **Campos booleanos**: Retornam 0 ou 1 (não true/false)

---

## 7. TEMPOS
**Endpoint**: `GET /reports/tempos`  
**Método**: `getTemposReport`

### Colunas
1. **data** - Data da conversa (YYYY-MM-DD)
2. **hora** - Hora da conversa (HH:MM:SS)
3. **fornecedor** - Sempre "Vend"
4. **codigo_carteira** - ID do segmento
5. **carteira** - Nome do segmento
6. **segmento** - Nome do segmento
7. **contrato** - Contrato do contato
8. **cpf** - CPF do contato
9. **telefone** - Telefone do contato
10. **login** - Nome do operador
11. **evento** - Nome da tabulação
12. **evento_normalizado** - Nome da tabulação normalizado
13. **tma** - Tempo médio de atendimento
14. **tmc** - Sempre 
15. **tmpro** - Sempre 
16. **tmf** - Sempre 
17. **tmrc** - Sempre 
18. **tmro** - Sempre 
19. **protocolo** - Sempre 

### Regras e Validações
- **Fonte de dados**: Tabela `Conversation` (apenas conversas tabuladas)
- **Filtros aplicados**:
  - `isAdminTest = false` (sempre)
  - `tabulation IS NOT NULL` (obrigatório)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
  - Filtro de data (se fornecido)
- **Ordenação**: Por data (descendente)
- **Campos null**: Apenas TMA é calculado, outros tempos sempre 

---

## 8. TEMPLATES
**Endpoint**: `GET /reports/templates`  
**Método**: `getTemplatesReport`

### Colunas
1. **Data de Solicitação de Envio** - Data de criação do template message (YYYY-MM-DD)
2. **Canal (Oficial ou Não Oficial)** - "Oficial" se `line.oficial = true`, "Não Oficial" caso contrário
3. **Fornecedor (Vend)** - Sempre "Vend"
4. **Nome do Template** - Nome do template
5. **Conteúdo do Disparo Inicial** - Corpo do template (`bodyText`)
6. **Carteira** - Nome do segmento
7. **WhatsApp Saída** - Telefone da linha
8. **Quantidade de Disparos** - Contagem de template messages
9. **Enviado** - Contagem de status "SENT"
10. **Confirmado** - Contagem de status "DELIVERED"
11. **Leitura** - Contagem de status "READ"
12. **Falha** - Contagem de status "FAILED"
13. **Interação** - Contagem de template messages com resposta do cliente

### Regras e Validações
- **Fonte de dados**: Tabela `TemplateMessage` (agrupado por template)
- **Filtros aplicados**:
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento via linha (se fornecido)
  - Filtro de data via `createdAt` (se fornecido)
- **Agrupamento**: Por template, linha e segmento
- **Ordenação**: Por data (descendente)

---

## 9. COMPLETO CSV
**Endpoint**: `GET /reports/completo-csv`  
**Método**: `getCompletoCsvReport`

### Colunas
1. **Id** - ID do contato
2. **Carteira** - Nome do segmento
3. **Nome do Cliente** - Nome do contato
4. **Telefone** - Telefone do contato
5. **CNPJ/CPF** - CPF do contato
6. **Contrato** - Contrato do contato
7. **Nome do Operador** - Nome do operador (última conversa)
8. **Tabulação** - Nome da tabulação (última conversa)
9. **Status** - Status baseado em tabulação
10. **Primeiro Atendimento** - Data/hora da primeira mensagem
11. **Último Atendimento** - Data/hora da última mensagem
12. **Enviado** - Contagem de mensagens enviadas
13. **Confirmado** - Contagem de mensagens confirmadas
14. **Leitura** - Contagem de mensagens lidas
15. **Falha** - Contagem de mensagens falhadas
16. **Interação** - 1 se teve resposta do cliente, 0 caso contrário

### Regras e Validações
- **Fonte de dados**: Tabela `Contact` (agrupado por telefone)
- **Filtros aplicados**:
  - `isAdminTest = false` (sempre)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
  - Filtro de data (se fornecido)
- **Agrupamento**: Por telefone do contato
- **Ordenação**: Por telefone

---

## 10. EQUIPE
**Endpoint**: `GET /reports/equipe`  
**Método**: `getEquipeReport`

### Colunas
1. **id** - ID do operador
2. **Operador** - Nome do operador
3. **Quantidade de Mensagens** - Contagem de mensagens enviadas (`sender = 'operator'`)
4. **Carteira** - Nome do segmento do operador

### Regras e Validações
- **Fonte de dados**: Tabela `Conversation` (apenas `sender = 'operator'`)
- **Filtros aplicados**:
  - `isAdminTest = false` (sempre)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
  - Filtro de data (se fornecido)
- **Agrupamento**: Por operador (`userId`)
- **Filtro de usuários**: Apenas usuários com email terminando em `@paschoalotto.com.br` e `role = 'operator'`
- **Ordenação**: Por quantidade de mensagens (descendente)

---

## 11. DADOS TRANSACIONADOS
**Endpoint**: `GET /reports/dados-transacionados`  
**Método**: `getDadosTransacionadosReport`

### Colunas
1. **id Ticket** - ID do template message
2. **id Template** - ID do template
3. **Nome do Template** - Nome do template
4. **Mensagem Template** - Corpo do template (`bodyText`)
5. **Dispositivo Disparo** - Telefone da linha
6. **Segmento do Dispositivo** - Nome do segmento da linha
7. **E-mail Operador** - Email do operador (se disponível)
8. **Data de Disparo** - Data de criação do template message
9. **Dispositivo Recebido** - Telefone do contato
10. **Enviado** - 1 se status "SENT", 0 caso contrário
11. **Confirmado** - 1 se status "DELIVERED", 0 caso contrário
12. **Leitura** - 1 se status "READ", 0 caso contrário
13. **Falha** - 1 se status "FAILED", 0 caso contrário
14. **Interação** - 1 se teve resposta do cliente, 0 caso contrário

### Regras e Validações
- **Fonte de dados**: Tabela `TemplateMessage`
- **Filtros aplicados**:
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento via linha (se fornecido)
  - Filtro de data via `createdAt` (se fornecido)
- **Ordenação**: Por data (descendente)

---

## 12. DETALHADO CONVERSAS
**Endpoint**: `GET /reports/detalhado-conversas`  
**Método**: `getDetalhadoConversasReport`

### Colunas
1. **Data de Conversa** - Data da mensagem (YYYY-MM-DD)
2. **Protocolo** - Sempre 
3. **Login do Operador** - Nome do operador
4. **CPF/CNPJ** - CPF do contato
5. **Contrato** - Contrato do contato
6. **Data e Hora início da Conversa** - Data/hora da primeira mensagem da conversa
7. **Data e Hora fim da Conversa** - Data/hora da última mensagem da conversa
8. **Paschoalotto** - Sempre 
9. **Telefone do Cliente** - Telefone do contato
10. **Segmento** - Nome do segmento
11. **Hora da Mensagem** - Hora da mensagem (HH:MM:SS)
12. **Mensagem Transcrita** - Texto da mensagem
13. **Quem Enviou a Mensagem** - "Operador" se `sender = 'operator'`, "Cliente" caso contrário
14. **Finalização** - Nome da tabulação (se houver)

### Regras e Validações
- **Fonte de dados**: Tabela `Conversation` (todas as mensagens)
- **Filtros aplicados**:
  - `isAdminTest = false` (sempre)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
  - Filtro de data (se fornecido)
- **Ordenação**: Por data (ascendente)
- **Agrupamento**: Por telefone do contato (cada linha é uma mensagem)

---

## 13. LINHAS
**Endpoint**: `GET /reports/linhas`  
**Método**: `getLinhasReport`

### Colunas
1. **Carteira** - Nome do segmento
2. **Número** - Telefone da linha
3. **Blindado** - "Sim" se `lineStatus = 'ban'`, "Não" caso contrário
4. **Data de Transferência** - Data da última movimentação (conversa, campanha ou atualização)

### Regras e Validações
- **Fonte de dados**: Tabela `LinesStock`
- **Filtros aplicados**:
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
  - **Parâmetro especial**: `onlyMovimentedLines` (boolean)
    - Se `true`: Apenas linhas que tiveram conversas ou campanhas no período
    - Se `false` ou não fornecido: Todas as linhas
- **Cálculo de última movimentação**:
  - Última conversa da linha OU
  - Última campanha da linha OU
  - `updatedAt` da linha (se não houver movimentação)
- **Ordenação**: Por data de transferência (ascendente)
- **Importante**: Quando `onlyMovimentedLines = true`, linhas do segmento "Padrão" são excluídas

---

## 14. MENSAGENS POR LINHA
**Endpoint**: `GET /reports/mensagens-por-linha`  
**Método**: `getMensagensPorLinhaReport`

### Colunas
1. **Número** - Telefone da linha
2. **Carteira** - Nome do segmento
3. **Data (dia)** - Data da mensagem (YYYY-MM-DD)
4. **Quantidade de Mensagens** - Contagem de mensagens naquele dia

### Regras e Validações
- **Fonte de dados**: Tabela `Conversation` (mensagens do operador) + `Campaign`
- **Filtros aplicados**:
  - `isAdminTest = false` (sempre)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento via linha (se fornecido)
  - Filtro de data (se fornecido)
- **Agrupamento**: Por linha, segmento e dia
- **Ordenação**: Por data (descendente)

---

## 15. RESUMO ATENDIMENTOS
**Endpoint**: `GET /reports/resumo-atendimentos`  
**Método**: `getResumoAtendimentosReport`

### Colunas
1. **Data Início Conversa** - Data da primeira mensagem (YYYY-MM-DD)
2. **Data de Início da Conversa** - Data/hora da primeira mensagem (duplicado)
3. **Teve Retorno** - "Sim" se teve resposta do cliente, "Não" caso contrário
4. **Telefone do Cliente** - Telefone do contato
5. **Login do Operador** - Nome do operador
6. **CPF/CNPJ** - CPF do contato
7. **Contrato** - Contrato do contato
8. **Data e Hora ínicio da Conversa** - Data/hora da primeira mensagem
9. **Data e hora fim da Conversa** - Data/hora da última mensagem
10. **Finalização** - Nome da tabulação
11. **Segmento** - Nome do segmento
12. **Carteira** - Nome do segmento (mesmo que Segmento)
13. **Protocolo** - Sempre 

### Regras e Validações
- **Fonte de dados**: Tabela `Conversation` (agrupado por telefone)
- **Filtros aplicados**:
  - `isAdminTest = false` (sempre)
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
  - Filtro de data (se fornecido)
- **Agrupamento**: Por telefone do contato
- **Ordenação**: Por data (ascendente)
- **Cálculo de retorno**: Verifica se há mensagens do contato (`sender = 'contact'`)

---

## 16. USUÁRIOS
**Endpoint**: `GET /reports/usuarios`  
**Método**: `getUsuariosReport`

### Colunas
1. **Nome** - Nome do usuário
2. **E-mail** - Email do usuário
3. **Segmento** - Nome do segmento
4. **Carteira** - Nome do segmento (mesmo valor de Segmento)
5. **Login principal** - "sim" se `role !== 'operator'`, "não" se `role === 'operator'`

### Regras e Validações
- **Fonte de dados**: Tabela `User`
- **Filtros aplicados**:
  - Email deve terminar com `@paschoalotto.com.br`
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento (se fornecido)
- **Ordenação**: Por segmento (alfabético) e depois por nome (alfabético)
- **Transformação de role**: 
  - `role !== 'operator'` → "sim"
  - `role === 'operator'` → "não"

---

## 17. HIPER PERSONALIZADO
**Endpoint**: `GET /reports/hiper-personalizado`  
**Método**: `getHiperPersonalizadoReport`

### Colunas
1. **Data de Disparo** - Data de criação do template message (YYYY-MM-DD)
2. **Nome do Template** - Nome do template
3. **Protocolo** - Sempre 
4. **Segmento** - Nome do segmento
5. **Login do Operador** - Email do operador (se disponível)
6. **Número de Saída** - Telefone da linha
7. **CPF do Cliente** - CPF do contato
8. **Telefone do Cliente** - Telefone do contato
9. **Finalização** - Nome da tabulação (se houver)
10. **Disparo** - Sempre 1
11. **Falha** - 1 se status "FAILED", 0 caso contrário
12. **Entrega** - 1 se status "DELIVERED", 0 caso contrário
13. **Retorno** - 1 se teve resposta do cliente, 0 caso contrário

### Regras e Validações
- **Fonte de dados**: Tabela `TemplateMessage`
- **Filtros aplicados**:
  - Filtro de identificador (cliente/proprietario)
  - Filtro de segmento via linha (se fornecido)
  - Filtro de data via `createdAt` (se fornecido)
- **Ordenação**: Por data (descendente)
- **Campos booleanos**: Retornam 0 ou 1

---

## 18. CONSOLIDADO
**Endpoint**: `GET /reports/consolidado`  
**Método**: `getConsolidatedReport`

### Estrutura
Retorna um objeto JSON com todos os 17 relatórios acima executados em paralelo.

### Resposta
```json
{
  "periodo": {
    "inicio": "2024-12-01",
    "fim": "2024-12-31"
  },
  "segmento": "Todos",
  "relatorios": {
    "opSintetico": [...],
    "kpi": [...],
    "hsm": [...],
    "lineStatus": [...],
    "envios": [...],
    "indicadores": [...],
    "tempos": [...],
    "templates": [...],
    "completoCsv": [...],
    "equipe": [...],
    "dadosTransacionados": [...],
    "detalhadoConversas": [...],
    "linhas": [...],
    "resumoAtendimentos": [...],
    "usuarios": [...],
    "hiperPersonalizado": [...]
  }
}
```

### Regras e Validações
- Executa todos os relatórios em paralelo usando `Promise.all`
- Aplica os mesmos filtros para todos os relatórios
- Retorna estrutura padronizada com período e segmento

---

## OBSERVAÇÕES IMPORTANTES

1. **Campos Null**: Muitos campos retornam  porque não estão implementados no sistema atual. Isso é intencional e conforme especificação do cliente.

2. **Normalização de Texto**: Todos os textos são normalizados usando `normalizeObject()` que remove acentos e caracteres especiais.

3. **Filtro de Teste Administrador**: **TODOS** os relatórios excluem automaticamente ações com `isAdminTest = true`.

4. **Filtro de Identificador**: Clientes só veem dados do seu segmento/identificador, proprietários veem tudo.

5. **Filtro de Segmento por Role**: Supervisores têm filtro automático aplicado para ver apenas seu segmento.

6. **Filtro de Usuários '@vend'**: **TODOS** os relatórios (exceto o de Linhas) excluem automaticamente dados de usuários com email contendo '@vend'. Isso inclui:
   - Conversas criadas por esses usuários
   - Mensagens enviadas por esses usuários
   - Dados relacionados a esses usuários
   - O relatório de Linhas **NÃO** aplica esse filtro

7. **Formato de Data**: Datas são formatadas como YYYY-MM-DD, exceto quando especificado diferente.

8. **Agrupamentos**: Alguns relatórios agrupam dados (por telefone, por template, por linha, etc.).

9. **Ordenações**: Cada relatório tem sua própria ordenação (geralmente por data, ascendente ou descendente).

