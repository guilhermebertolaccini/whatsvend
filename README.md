# Vend - Sistema de Atendimento WhatsApp

Sistema completo de atendimento via WhatsApp com múltiplos operadores, filas de campanhas, e supervisão em tempo real.

## Tecnologias

### Backend
- NestJS
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ (filas)
- WebSockets (Socket.IO)
- Evolution API (WhatsApp)
- Docker

### Frontend
- Vue 3
- Vite
- Pinia (estado)
- Vue Router
- Tailwind CSS
- Socket.IO Client

## Estrutura do Projeto

```
vend/
├── backend/           # API NestJS
│   ├── src/
│   │   ├── auth/      # Autenticação JWT + Argon2
│   │   ├── users/     # Usuários (Admin, Supervisor, Operator)
│   │   ├── segments/  # Segmentos
│   │   ├── tabulations/ # Tabulações
│   │   ├── contacts/  # Contatos
│   │   ├── campaigns/ # Campanhas (BullMQ)
│   │   ├── blocklist/ # Lista de bloqueio
│   │   ├── lines/     # Linhas WhatsApp
│   │   ├── evolution/ # Configuração Evolution API
│   │   ├── conversations/ # Conversas
│   │   ├── websocket/ # Gateway WebSocket
│   │   └── webhooks/  # Webhooks Evolution
│   ├── prisma/        # Schema Prisma
│   ├── docker-compose.yml
│   └── Dockerfile
│
└── frontend/          # App Vue 3
    ├── src/
    │   ├── views/     # Páginas
    │   ├── components/ # Componentes
    │   ├── stores/    # Pinia stores
    │   ├── services/  # API + Socket
    │   └── router/    # Vue Router
    └── tailwind.config.js

```

## Instalação e Configuração

### 1. Backend

```bash
cd backend

# Instalar dependências
npm install

# Subir banco de dados e Redis via Docker
docker-compose up -d

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações

# Gerar Prisma Client
npm run prisma:generate

# Executar migrations
npm run prisma:migrate

# Rodar em desenvolvimento
npm run start:dev
```

O backend estará rodando em `http://localhost:3000`

### 2. Frontend

```bash
cd frontend

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env se necessário (padrão: http://localhost:3000)

# Rodar em desenvolvimento
npm run dev
```

O frontend estará rodando em `http://localhost:5173`

## Funcionalidades

### Roles de Usuários

#### Operator (Operador)
- Atender conversas via WhatsApp
- Enviar mensagens, imagens, documentos, áudios
- Iniciar conversas 1x1
- Tabular conversas

#### Supervisor
- Supervisionar conversas do segmento
- Visualizar todas as conversas (somente leitura)
- Criar campanhas
- Gerenciar contatos, segmentos, tabulações, blocklist

#### Admin (Administrador)
- Todas as permissões de supervisor
- Gerenciar usuários
- Configurar Evolution API
- Gerenciar linhas WhatsApp
- Visualizar estatísticas completas

### Funcionalidades Principais

1. **Atendimento em Tempo Real**
   - Chat via WhatsApp usando Evolution API
   - WebSockets para mensagens instantâneas
   - Suporte a texto, imagens, áudios e documentos

2. **Campanhas Massivas**
   - Upload de CSV com contatos
   - Distribuição automática entre operadores online
   - Controle de velocidade (fast, medium, slow)
   - Retry automático (até 3 tentativas)
   - Verificação de blocklist

3. **Gestão de Linhas**
   - Integração com Evolution API
   - Suporte para WhatsApp Cloud API (oficial)
   - Troca automática de linhas banidas
   - QR Code para conexão

4. **Supervisão**
   - Visualização de todas as conversas do segmento
   - Filtro por operador
   - Acesso somente leitura

5. **Segurança**
   - Autenticação JWT
   - Senhas hasheadas com Argon2
   - Guards e middlewares
   - Validação de roles

## Endpoints Principais

### Auth
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `GET /auth/me` - Usuário atual

### Conversations
- `GET /conversations/active` - Conversas ativas
- `POST /conversations/tabulate/:phone` - Tabular conversa

### Campaigns
- `POST /campaigns` - Criar campanha
- `POST /campaigns/:id/upload` - Upload CSV
- `GET /campaigns/stats/:name` - Estatísticas

### Lines
- `POST /lines` - Criar linha
- `GET /lines/:id/qrcode` - Obter QR Code
- `POST /lines/:id/ban` - Marcar como banida

## WebSocket Events

### Emitir (Client -> Server)
- `send-message` - Enviar mensagem

### Receber (Server -> Client)
- `new-message` - Nova mensagem recebida
- `active-conversations` - Conversas ativas
- `message-sent` - Mensagem enviada com sucesso
- `conversation-tabulated` - Conversa tabulada

## Webhooks

### Evolution API
- `POST /webhooks/evolution` - Webhook para receber mensagens

## Configuração da Evolution API

1. Instale e configure a Evolution API
2. No painel admin do Vend, vá em "Evolution"
3. Cadastre uma nova configuração:
   - Nome
   - URL da API
   - API Key

4. Em "Linhas", crie uma nova linha:
   - Telefone
   - Segmento
   - Selecione a Evolution configurada
   - Marque se é oficial (WhatsApp Cloud API)

5. Acesse o QR Code e faça a conexão

## Estrutura do Banco de Dados

### Tabelas Principais

- **users** - Usuários do sistema
- **segments** - Segmentos de negócio
- **tabulations** - Tabulações de conversas
- **contacts** - Contatos
- **campaigns** - Campanhas
- **blockList** - Lista de bloqueio
- **linesStock** - Linhas WhatsApp
- **evolution** - Configurações Evolution API
- **conversations** - Histórico de conversas

### Enums

- **Role**: admin, operator, supervisor
- **Status**: Online, Offline
- **LineStatus**: active, ban
- **Sender**: operator, contact
- **Speed**: fast, medium, slow

## Desenvolvimento

### Scripts Backend

```bash
npm run start:dev      # Desenvolvimento
npm run build          # Build produção
npm run start:prod     # Rodar produção
npm run prisma:studio  # Abrir Prisma Studio
npm run prisma:migrate # Rodar migrations
```

### Scripts Frontend

```bash
npm run dev     # Desenvolvimento
npm run build   # Build produção
npm run preview # Preview produção
```

## Produção

### Backend

```bash
# Build da aplicação
npm run build

# Ou usar Docker
docker build -t vend-backend .
docker run -p 3000:3000 vend-backend
```

### Frontend

```bash
# Build
npm run build

# Os arquivos estarão em dist/
# Deploy no Vercel, Netlify, ou servidor próprio
```

## Licença

Proprietário - Vend © 2024

## Suporte

Para suporte, entre em contato com a equipe de desenvolvimento.
