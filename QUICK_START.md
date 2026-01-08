# ⚡ QUICK START - VEND

## 🚀 Iniciar Aplicação em 3 Passos

### 1. Backend

```bash
cd backend
npm install
docker-compose up -d
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 3. Acessar

- Frontend: http://localhost:5173
- Login: `operator@vend.com` / `operator123`

## 📋 Comandos Úteis

### Backend

```bash
# Iniciar
npm run start:dev

# Build
npm run build

# Prisma Studio (visualizar BD)
npm run prisma:studio

# Resetar BD
npm run prisma:migrate reset
npm run prisma:seed
```

### Frontend

```bash
# Dev
npm run dev

# Build
npm run build

# Preview
npm run preview
```

### Docker

```bash
# Iniciar serviços
docker-compose up -d

# Parar serviços
docker-compose down

# Ver logs
docker-compose logs -f

# Resetar tudo
docker-compose down -v
docker-compose up -d
```

## 👥 Usuários Padrão

```
Admin:      admin@vend.com      | admin123
Supervisor: supervisor@vend.com | supervisor123
Operador:   operator@vend.com   | operator123
```

## 🎯 Teste Rápido

1. Login → `operator@vend.com` / `operator123`
2. Atendimento → + (nova conversa)
3. Preencher dados → Enviar mensagem
4. ✅ Funcionando!

## 📱 Configurar WhatsApp

### Opção 1: Evolution API Local

```bash
# Clone Evolution
git clone https://github.com/EvolutionAPI/evolution-api.git
cd evolution-api
docker-compose up -d
```

### Opção 2: Evolution API Cloud

Use uma instância cloud da Evolution API

### Configuração no Vend

1. Login Admin → Evolution → Novo
2. Nome: `Minha Evolution`
3. URL: `http://localhost:8080` ou URL cloud
4. API Key: sua chave
5. Salvar

### Criar Linha

1. Linhas → Novo
2. Telefone: `5511999999999`
3. Segmento: Padrão
4. Evolution: Minha Evolution
5. Salvar → Ver QR Code → Escanear

### Vincular ao Operador

1. Usuários → Editar operador
2. Linha: Selecionar linha criada
3. Salvar

## 🎨 Estrutura de Páginas

### Operador
- ✅ Atendimento (chat)

### Supervisor
- ✅ Supervisionar
- ✅ Contatos
- ✅ Campanhas
- ✅ Tabulações
- ✅ Segmentos
- ✅ Blocklist

### Admin
- ✅ Todas as do Supervisor
- ✅ Evolution
- ✅ Linhas
- ✅ Usuários

## 📝 Criar Campanha

1. Login Supervisor → Campanhas
2. Preencher formulário
3. Criar CSV:
   ```csv
   name,phone
   João,5511999999999
   Maria,5511888888888
   ```
4. Upload → Enviar

## 🔍 Verificar Status

### Backend
```bash
curl http://localhost:3000/auth/me
# Deve retornar 401 (não autenticado)
```

### PostgreSQL
```bash
docker exec -it vend-postgres psql -U postgres -d vend
\dt  # Ver tabelas
\q   # Sair
```

### Redis
```bash
docker exec -it vend-redis redis-cli
PING  # Deve retornar PONG
```

## 🐛 Problemas Comuns

### Porta em uso
```bash
# Matar processo na porta 3000
lsof -ti:3000 | xargs kill -9

# Matar processo na porta 5173
lsof -ti:5173 | xargs kill -9
```

### Prisma não gera
```bash
cd backend
rm -rf node_modules
npm install
npm run prisma:generate
```

### WebSocket não conecta
- Verificar se backend está rodando
- Verificar console do navegador (F12)
- Fazer logout e login novamente

## ⚙️ Variáveis de Ambiente

### Backend (.env)
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vend?schema=public"
REDIS_HOST="localhost"
REDIS_PORT=6379
JWT_SECRET="your-secret"
JWT_EXPIRATION="24h"
PORT=3000
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3000
```

## 📦 Produção

### Backend
```bash
npm run build
npm run start:prod
```

### Frontend
```bash
npm run build
# Deploy pasta dist/ para Vercel, Netlify, etc
```

## 🎯 URLs Importantes

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Prisma Studio: http://localhost:5555
- Evolution: http://localhost:8080

## ✨ Pronto!

Sua aplicação está 100% funcional! 🚀
