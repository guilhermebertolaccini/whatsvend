# Guia Docker

Este projeto possui dois ambientes Docker separados:
- **Backend**: NestJS + PostgreSQL + Redis
- **Frontend**: Vue.js + Nginx

## Configuração Inicial

### Backend

1. Entre na pasta backend:
```bash
cd backend
```

2. Copie o arquivo de exemplo e configure suas variáveis:
```bash
cp .env.example .env
```

3. Edite o arquivo `.env` com suas configurações:
```env
# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=vend
POSTGRES_PORT=5432

# Database URL (usado pelo Prisma)
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/vend?schema=public"

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET="seu-secret-super-seguro-aqui"
JWT_EXPIRATION="24h"
JWT_REFRESH_SECRET="seu-refresh-secret-super-seguro-aqui"
JWT_REFRESH_EXPIRATION="7d"

# Application Port
PORT=3000
```

### Frontend

1. Entre na pasta frontend:
```bash
cd frontend
```

2. Copie o arquivo de exemplo e configure suas variáveis:
```bash
cp .env.example .env
```

3. Edite o arquivo `.env` com suas configurações:
```env
# API Backend URL
VITE_API_URL=http://localhost:3000

# Frontend Port
FRONTEND_PORT=80
```

## Executando com Docker

### Backend (PostgreSQL + Redis + API)

```bash
cd backend

# Subir todos os serviços
docker-compose up -d

# Ver os logs
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f backend
docker-compose logs -f postgres
docker-compose logs -f redis

# Parar todos os serviços
docker-compose down

# Parar e remover volumes (CUIDADO: apaga os dados do banco)
docker-compose down -v

# Reconstruir as imagens
docker-compose up -d --build
```

### Frontend (Vue + Nginx)

```bash
cd frontend

# Subir o frontend
docker-compose up -d

# Ver os logs
docker-compose logs -f

# Parar o frontend
docker-compose down

# Reconstruir a imagem
docker-compose up -d --build
```

## Serviços e Portas

### Backend
- **Backend API**: http://localhost:3000
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Frontend
- **Frontend Web**: http://localhost (porta 80)

## Comandos Úteis

### Executar migrations no banco (Prisma)

```bash
# Entrar no container do backend
docker exec -it vend-backend sh

# Dentro do container, executar a migration
npm run prisma:migrate

# Sair do container
exit
```

### Ver status dos containers

```bash
docker ps
```

### Acessar logs em tempo real

```bash
# Backend
docker logs -f vend-backend

# Frontend
docker logs -f vend-frontend

# PostgreSQL
docker logs -f vend-postgres

# Redis
docker logs -f vend-redis
```

### Resetar tudo e começar do zero

```bash
# Parar e remover tudo do backend
cd backend
docker-compose down -v

# Parar e remover tudo do frontend
cd ../frontend
docker-compose down

# Subir novamente
cd ../backend
docker-compose up -d

cd ../frontend
docker-compose up -d --build
```

## Troubleshooting

### Backend não conecta ao banco

1. Verifique se o PostgreSQL está rodando:
```bash
docker-compose logs postgres
```

2. Verifique se a `DATABASE_URL` no `.env` está usando `postgres` como host (não `localhost`)

### Frontend não conecta ao backend

1. Verifique se o backend está rodando:
```bash
cd backend
docker-compose ps
```

2. Verifique se a `VITE_API_URL` está correta no `.env` do frontend

3. Rebuild o frontend (variáveis de ambiente são definidas no build):
```bash
cd frontend
docker-compose up -d --build
```

### Erro de permissão em volumes

No Windows, certifique-se de que o Docker Desktop tem permissão para acessar os drives.

## Desenvolvimento vs Produção

### Para Desenvolvimento
- Use os arquivos `.env` com valores de desenvolvimento
- Mantenha as portas padrão
- Use `docker-compose logs -f` para debugar

### Para Produção
- Altere todos os secrets (JWT_SECRET, senhas, etc.)
- Use variáveis de ambiente do sistema ou secrets manager
- Configure HTTPS no Nginx
- Use volumes nomeados ou externos para persistência de dados
- Configure backups regulares do PostgreSQL
