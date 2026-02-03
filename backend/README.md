# VEND 2.0 - Backend

Backend da plataforma VEND 2.0 — atendimento WhatsApp, Evolution e WhatsApp Cloud API com gestão de templates, campanhas e relatórios.

## Tecnologias
- NestJS
- Prisma ORM (PostgreSQL)
- Redis + Bull/BullMQ (filas)
- WebSockets (Socket.IO)
- Argon2 (hash de senhas)
- JWT (autenticação)

## Pré-requisitos
- Node.js 18+
- Docker + Docker Compose
- PostgreSQL e Redis (podem ser os do `docker-compose.yml`)

## Instalação e execução
```bash
# Instalar dependências
npm install

# Subir banco de dados e Redis
docker-compose up -d

# Gerar Prisma Client
npm run prisma:generate

# Executar migrations
npm run prisma:migrate

# Rodar aplicação em desenvolvimento
npm run start:dev
```

## Configuração
Copie `.env.example` para `.env` e ajuste:
- `DATABASE_URL`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- Credenciais Evolution (`EVOLUTION_*`)
- Variáveis de WhatsApp Cloud API (token, business/number id nas linhas oficiais)
- JWT e chaves de fila, se aplicável

## Estrutura (principais módulos)
```
src/
├── auth/             # Autenticação JWT
├── users/            # Usuários e roles
├── segments/         # Segmentos
├── tabulations/      # Tabulações
├── contacts/         # Contatos
├── campaigns/        # Campanhas (CSV, massivo, templates)
├── templates/        # Templates WhatsApp Cloud API + histórico
├── blocklist/        # Lista de bloqueio
├── lines/            # Linhas WhatsApp / Evolution / Cloud
├── evolution/        # Configuração Evolution API
├── conversations/    # Conversas e tabulação
├── media/            # Upload/serve de mídia
├── reports/          # Relatórios
├── api-messages/     # API externa (CPC, templates 1x1)
├── api-logs/         # Logs de chamadas externas
├── webhooks/         # Webhooks Evolution
├── websocket/        # Gateway WebSocket
└── common/           # Guards, decorators, utils
```

## Endpoints principais (resumo)
- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- Users: CRUD + `GET /users/online-operators`
- Segments, Tabulations, Contacts: CRUD
- Lines: CRUD, QR Code, ban, evolutions/instances, available
- Campaigns: criar, upload CSV, stats, suporte a templates
- Templates: CRUD, sync Cloud API, send 1x1, send massivo, history, stats
- API externa: `POST /api/messages/massivocpc`, `POST /api/messages/template`
- Reports: múltiplos relatórios + consolidado
- Media: upload/download
- Webhooks: `POST /webhooks/evolution`
- WebSockets: `send-message`, `new-message`, `active-conversations`, `conversation-tabulated`

## Documentação completa
Consulte `API_DOCUMENTATION.md` (formatado para exportar em PDF).

## Licença
Proprietário.
