# API de Disparo CPC (Contato por Cliente)

## Visão Geral

Esta API permite o envio de disparos de mensagens de forma centralizada, garantindo o controle de CPC (Contato por Cliente). O operador não pode iniciar manualmente uma conversa, apenas via API. As mensagens são distribuídas automaticamente entre os números disponíveis da carteira.

## Autenticação

A API utiliza autenticação via Bearer Token (API Key fixo).

**Configuração:**
- Configure a variável de ambiente `API_KEY` no arquivo `.env`
- Exemplo: `API_KEY=seu-token-secreto-aqui`

**Headers obrigatórios:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

## Endpoint

### POST /api/messages/massivocpc

Endpoint para disparo de mensagens CPC.

#### Request Body

```json
{
  "campaign": "Nome da Campanha",
  "idAccount": "Id da conta",
  "tag": "Identificador da carteira",
  "messages": [{
    "phone": "5514999999999",
    "idMessage": 1234,
    "clientId": "Identificador único do cliente",
    "contract": "Contrato",
    "closeTicket": true,
    "specialistCode": "jaozinho",
    "mainTemplate": "Mensagem que será enviada",
    "retryTemplate": "Template de repescagem 1",
    "lastTemplate": "Template de repescagem 2"
  }]
}
```

#### Parâmetros

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| campaign | String | Sim | Nome da campanha vinculada ao disparo |
| idAccount | String | Não | Identificador da conta BV |
| tag | String | Sim | Tag/nome da carteira de disparo (deve existir no sistema) |
| messages | Array | Sim | Lista de mensagens a serem enviadas |
| phone | String | Sim | Número do cliente (formato internacional, ex: 5514999999999) |
| idMessage | Number | Não | ID interno da mensagem |
| clientId | String | Não | Identificador único do cliente |
| contract | String | Não | Número do contrato vinculado |
| closeTicket | Boolean | Sim | Sempre true. Indica fechamento de ticket inicial |
| specialistCode | String | Sim | Identificador único do operador (email antes do @, ex: jaozinho@vend.com -> jaozinho) |
| mainTemplate | String | Sim | Template principal |
| retryTemplate | String | Não | Template de repescagem 1 |
| lastTemplate | String | Não | Template de repescagem 2 |

#### Exemplo de Requisição

```bash
curl -X POST https://apipaschoalotto.vend.app.br/api/messages/massivocpc \
  -H "Authorization: Bearer seu-token-aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign": "Campanha teste",
    "idAccount": "1234",
    "tag": "emp1",
    "messages": [{
      "phone": "5511988876204",
      "idMessage": 1234,
      "clientId": "",
      "contract": "1091757",
      "closeTicket": true,
      "specialistCode": "admin",
      "mainTemplate": "Olá, seu contrato BV está disponível para negociação. Inicie seu atendimento"
    }]
  }'
```

#### Exemplo de Resposta Sucesso

```json
{
  "status": "success",
  "message": "Mensagens enviadas com sucesso",
  "processed": 1,
  "errors": []
}
```

#### Exemplo de Resposta Parcial

```json
{
  "status": "partial",
  "message": "1 mensagens processadas, 1 com erro",
  "processed": 1,
  "errors": [
    {
      "phone": "5514998830081",
      "reason": "Número ou CPF na lista de bloqueio"
    }
  ]
}
```

#### Exemplo de Resposta Erro

```json
{
  "status": "error",
  "message": "Falha ao processar requisição",
  "processed": 0,
  "errors": [
    {
      "phone": "5514998830081",
      "reason": "Número inválido"
    }
  ]
}
```

## Regras de CPC

O cliente só pode receber um novo contato se:

- **Responder à mensagem enviada** - Se o cliente respondeu à última mensagem enviada pelo operador, pode receber novo contato
- **Ou após o período de 24h** - Se passaram 24 horas desde a última mensagem enviada pelo operador, pode receber novo contato

Até que isso ocorra, o chat permanece bloqueado para novos disparos.

## Validações

1. **Tag**: A tag informada deve existir no sistema (criada via CRUD de Tags)
2. **SpecialistCode**: Deve corresponder a um operador existente (email antes do @)
3. **Linha do Operador**: O operador deve ter uma linha ativa atribuída
4. **Blocklist**: Números e CPFs na lista de bloqueio são rejeitados
5. **CPC**: Verifica se pode enviar conforme regras de CPC

## Logs

Todas as requisições são registradas na tabela `ApiLog` com:
- Endpoint e método
- Payload da requisição
- Payload da resposta
- Status code
- IP e User-Agent

Os logs podem ser consultados via endpoints de API Logs (apenas admin/supervisor).

## Tags

As tags são identificadores de carteira que devem ser criadas previamente via CRUD de Tags (apenas admin).

Endpoint: `/tags` (requer autenticação JWT e role admin)

