# 🚀 Guia Completo de Deploy - NewVend

## 📋 Pré-requisitos

- Docker e Docker Compose instalados
- Acesso SSH ao servidor (se deploy remoto)
- PostgreSQL (ou usar Docker)
- Redis (ou usar Docker)
- Node.js 20+ (para build local)

---

## 🎯 Opção 1: Deploy com Docker Compose (Recomendado)

### 1. Preparar o Ambiente

```bash
# 1. Clone o repositório (se ainda não tiver)
git clone <seu-repositorio>
cd newvend

# 2. Configure as variáveis de ambiente
cd backend
cp .env.example .env
# Edite o .env com suas configurações de produção
```

### 2. Configurar .env do Backend

```bash
# Edite backend/.env
nano backend/.env
```

**Configuração para produção:**
```env
# Database - Ajuste para seu banco de produção
DATABASE_URL="postgresql://usuario:senha@postgres:5432/vend?schema=public"

# Redis
REDIS_HOST="redis"
REDIS_PORT=6379
REDIS_PASSWORD="sua-senha-redis"
REDIS_USERNAME=""
REDIS_DB=0

# JWT - IMPORTANTE: Use uma senha forte em produção!
JWT_SECRET="sua-chave-secreta-super-forte-aqui-mude-isso"
JWT_EXPIRES_IN="7d"

# Server
PORT=3000
NODE_ENV=production
APP_URL="https://api.seudominio.com.br"  # URL da sua API

# CORS - URLs permitidas
CORS_ORIGINS="https://seudominio.com.br,https://www.seudominio.com.br"

# Archiving
ARCHIVE_AFTER_DAYS=90
```

### 3. Aplicar Migrations no Banco

```bash
# Opção A: Via Docker (recomendado)
cd backend
docker-compose exec postgres psql -U postgres -d vend -f /path/to/complete_migration.sql

# Opção B: Via psql direto
psql -h localhost -U postgres -d vend -f migrations/complete_migration.sql

# Opção C: Via Prisma (se preferir)
cd backend
npx prisma migrate deploy
```

### 4. Build e Deploy

```bash
# 1. Build do backend
cd backend
docker-compose build

# 2. Iniciar serviços
docker-compose up -d

# 3. Verificar logs
docker-compose logs -f backend
```

### 5. Verificar se está funcionando

```bash
# Testar endpoint de health
curl http://localhost:3000/health

# Testar métricas
curl http://localhost:3000/metrics

# Testar Swagger
# Acesse: http://localhost:3000/api/docs
```

---

## 🎯 Opção 2: Deploy Manual (Sem Docker)

### 1. Preparar Servidor

```bash
# Instalar Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Instalar Redis
sudo apt-get install -y redis-server
```

### 2. Configurar Banco de Dados

```bash
# Criar banco
sudo -u postgres psql
CREATE DATABASE vend;
CREATE USER vend_user WITH PASSWORD 'sua_senha_forte';
GRANT ALL PRIVILEGES ON DATABASE vend TO vend_user;
\q

# Aplicar migrations
psql -h localhost -U vend_user -d vend -f backend/migrations/complete_migration.sql
```

### 3. Build do Backend

```bash
cd backend

# Instalar dependências
npm install

# Gerar Prisma Client
npx prisma generate

# Build
npm run build

# Aplicar migrations
npx prisma migrate deploy
```

### 4. Configurar PM2 (Process Manager)

```bash
# Instalar PM2
sudo npm install -g pm2

# Criar arquivo ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'newvend-backend',
    script: 'dist/main.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G'
  }]
};
EOF

# Iniciar aplicação
pm2 start ecosystem.config.js

# Salvar configuração
pm2 save
pm2 startup  # Seguir instruções para iniciar no boot
```

### 5. Configurar Nginx (Reverse Proxy)

```bash
# Instalar Nginx
sudo apt-get install -y nginx

# Criar configuração
sudo nano /etc/nginx/sites-available/newvend
```

**Conteúdo do arquivo:**
```nginx
server {
    listen 80;
    server_name api.seudominio.com.br;

    # Redirecionar HTTP para HTTPS (opcional)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.seudominio.com.br;

    # Certificado SSL (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/api.seudominio.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.seudominio.com.br/privkey.pem;

    # Configurações SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Timeout para WebSocket
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;

    # Backend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Uploads
    location /media/ {
        alias /caminho/para/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Ativar site
sudo ln -s /etc/nginx/sites-available/newvend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🎯 Opção 3: Deploy Frontend

### 1. Build do Frontend

```bash
cd frontend

# Configurar .env
echo "VITE_API_URL=https://api.seudominio.com.br" > .env.production

# Build
npm install
npm run build

# A pasta dist/ contém os arquivos prontos
```

### 2. Deploy Frontend

#### Opção A: Vercel/Netlify (Recomendado)

```bash
# Vercel
npm install -g vercel
cd frontend
vercel --prod

# Ou Netlify
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

#### Opção B: Nginx

```bash
# Copiar arquivos
sudo cp -r frontend/dist/* /var/www/newvend/

# Configurar Nginx
sudo nano /etc/nginx/sites-available/newvend-frontend
```

**Configuração Nginx para Frontend:**
```nginx
server {
    listen 80;
    server_name seudominio.com.br;

    root /var/www/newvend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache de assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 📝 Checklist de Deploy

### Antes do Deploy:
- [ ] Variáveis de ambiente configuradas
- [ ] Banco de dados criado
- [ ] Migrations aplicadas (`complete_migration.sql`)
- [ ] Redis configurado e rodando
- [ ] Certificado SSL configurado (HTTPS)
- [ ] CORS configurado com URLs corretas
- [ ] JWT_SECRET alterado para produção

### Durante o Deploy:
- [ ] Build do backend executado
- [ ] Build do frontend executado
- [ ] Serviços iniciados (Docker ou PM2)
- [ ] Nginx configurado e reiniciado
- [ ] Firewall configurado (portas 80, 443)

### Após o Deploy:
- [ ] Testar endpoint `/health`
- [ ] Testar endpoint `/api/docs` (Swagger)
- [ ] Verificar logs do sistema
- [ ] Testar login no frontend
- [ ] Testar WebSocket (conexão em tempo real)
- [ ] Verificar logs de erro

---

## 🔧 Comandos Úteis

### Docker Compose:
```bash
# Ver logs
docker-compose logs -f backend

# Reiniciar serviço
docker-compose restart backend

# Parar tudo
docker-compose down

# Ver status
docker-compose ps
```

### PM2:
```bash
# Ver logs
pm2 logs newvend-backend

# Reiniciar
pm2 restart newvend-backend

# Ver status
pm2 status

# Monitorar
pm2 monit
```

### Banco de Dados:
```bash
# Backup
pg_dump -U postgres vend > backup_$(date +%Y%m%d).sql

# Restore
psql -U postgres vend < backup_20241217.sql

# Verificar conexões
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname='vend';"
```

---

## 🚨 Troubleshooting

### Backend não inicia?
```bash
# Ver logs
docker-compose logs backend
# ou
pm2 logs newvend-backend

# Verificar variáveis de ambiente
docker-compose exec backend env | grep -E "DATABASE|REDIS|JWT"
```

### Erro de conexão com banco?
```bash
# Testar conexão
psql -h localhost -U postgres -d vend -c "SELECT 1;"

# Verificar se banco existe
psql -U postgres -l | grep vend
```

### WebSocket não conecta?
```bash
# Verificar se porta está aberta
netstat -tulpn | grep 3000

# Verificar logs do Nginx
sudo tail -f /var/log/nginx/error.log
```

### Frontend não carrega?
```bash
# Verificar console do navegador (F12)
# Verificar se API_URL está correto no .env.production
# Verificar CORS no backend
```

---

## 📦 Deploy Completo (Script Automatizado)

Crie um script de deploy:

```bash
cat > deploy.sh << 'EOF'
#!/bin/bash

set -e

echo "🚀 Iniciando deploy do NewVend..."

# 1. Backup do banco
echo "📦 Fazendo backup do banco..."
pg_dump -U postgres vend > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Aplicar migrations
echo "📝 Aplicando migrations..."
psql -U postgres -d vend -f backend/migrations/complete_migration.sql || echo "Migrations já aplicadas"

# 3. Build backend
echo "🔨 Build do backend..."
cd backend
npm install
npx prisma generate
npm run build

# 4. Reiniciar serviços
echo "🔄 Reiniciando serviços..."
pm2 restart newvend-backend || pm2 start ecosystem.config.js

# 5. Build frontend
echo "🎨 Build do frontend..."
cd ../frontend
npm install
npm run build

# 6. Copiar frontend
echo "📤 Copiando frontend..."
sudo cp -r dist/* /var/www/newvend/

echo "✅ Deploy concluído!"
EOF

chmod +x deploy.sh
```

---

## 🔐 Segurança em Produção

### 1. Variáveis Sensíveis:
- ✅ Use secrets management (AWS Secrets Manager, HashiCorp Vault)
- ✅ Nunca commite `.env` no Git
- ✅ Use senhas fortes para JWT_SECRET
- ✅ Use senhas fortes para banco de dados

### 2. Firewall:
```bash
# Permitir apenas portas necessárias
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 3. SSL/TLS:
```bash
# Instalar Certbot (Let's Encrypt)
sudo apt-get install certbot python3-certbot-nginx

# Gerar certificado
sudo certbot --nginx -d api.seudominio.com.br
```

---

## 📊 Monitoramento em Produção

### 1. Prometheus + Grafana:
```bash
# Iniciar monitoramento
cd backend
docker-compose -f docker-compose-monitoring.yml up -d
```

### 2. Logs:
```bash
# Ver logs em tempo real
pm2 logs newvend-backend

# Ou com Docker
docker-compose logs -f backend
```

### 3. Alertas:
- Configure alertas no Grafana
- Configure notificações (email, Slack, etc.)
- Monitore métricas críticas (erros, latência, etc.)

---

## 🎯 Resumo Rápido

```bash
# 1. Configurar .env
cd backend
cp .env.example .env
nano .env  # Editar com valores de produção

# 2. Aplicar migrations
psql -U postgres -d vend -f migrations/complete_migration.sql

# 3. Build e deploy
docker-compose up -d --build

# 4. Verificar
curl http://localhost:3000/health
```

Pronto! Seu sistema está em produção! 🚀

