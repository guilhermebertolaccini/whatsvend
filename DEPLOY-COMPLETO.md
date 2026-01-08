# 🚀 Guia de Deploy Completo - NewVend

## 📋 Índice

1. [Deploy Rápido (Docker)](#deploy-rápido)
2. [Deploy Manual](#deploy-manual)
3. [Deploy Frontend](#deploy-frontend)
4. [Configuração de Produção](#configuração-de-produção)
5. [Checklist de Deploy](#checklist)

---

## 🚀 Deploy Rápido (Docker)

### Passo a Passo:

```bash
# 1. Clone o repositório
git clone <seu-repositorio>
cd newvend

# 2. Configure o .env
cd backend
cp .env.production.example .env
nano .env  # Edite com seus valores

# 3. Execute o script de deploy
./deploy.sh

# Pronto! 🎉
```

### O script faz automaticamente:
- ✅ Backup do banco de dados
- ✅ Aplicação de migrations
- ✅ Build do backend
- ✅ Inicialização dos serviços
- ✅ Verificação de saúde

---

## 📝 Deploy Manual

### 1. Preparar Servidor

```bash
# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Configurar Variáveis de Ambiente

```bash
cd backend
cp .env.production.example .env
nano .env
```

**Valores importantes:**
- `DATABASE_URL`: URL do seu PostgreSQL
- `JWT_SECRET`: Gere uma senha forte: `openssl rand -base64 32`
- `APP_URL`: URL da sua API (ex: `https://api.seudominio.com.br`)
- `CORS_ORIGINS`: URLs do frontend permitidas

### 3. Aplicar Migrations

```bash
# Opção A: Via SQL direto
psql -h localhost -U postgres -d vend -f backend/migrations/complete_migration.sql

# Opção B: Via Docker
docker-compose exec postgres psql -U postgres -d vend -f /path/to/complete_migration.sql
```

### 4. Iniciar Serviços

```bash
cd backend
docker-compose up -d --build
```

### 5. Verificar

```bash
# Ver status
docker-compose ps

# Ver logs
docker-compose logs -f backend

# Testar endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/docs
```

---

## 🎨 Deploy Frontend

### 1. Build

```bash
cd frontend

# Configurar .env de produção
echo "VITE_API_URL=https://api.seudominio.com.br" > .env.production

# Build
npm install
npm run build

# A pasta dist/ contém os arquivos prontos
```

### 2. Deploy

#### Opção A: Vercel (Recomendado - Grátis)

```bash
# Instalar Vercel CLI
npm install -g vercel

# Deploy
cd frontend
vercel --prod
```

#### Opção B: Netlify

```bash
# Instalar Netlify CLI
npm install -g netlify-cli

# Deploy
cd frontend
netlify deploy --prod --dir=dist
```

#### Opção C: Servidor Próprio (Nginx)

```bash
# Copiar arquivos
sudo cp -r frontend/dist/* /var/www/newvend/

# Configurar Nginx (veja exemplo abaixo)
```

---

## ⚙️ Configuração de Produção

### Nginx para Backend (API)

```nginx
server {
    listen 443 ssl http2;
    server_name api.seudominio.com.br;

    ssl_certificate /etc/letsencrypt/live/api.seudominio.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.seudominio.com.br/privkey.pem;

    # Timeout para WebSocket
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;

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
    }
}
```

### Nginx para Frontend

```nginx
server {
    listen 443 ssl http2;
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

### SSL com Let's Encrypt

```bash
# Instalar Certbot
sudo apt-get install certbot python3-certbot-nginx

# Gerar certificado
sudo certbot --nginx -d api.seudominio.com.br
sudo certbot --nginx -d seudominio.com.br

# Renovação automática
sudo certbot renew --dry-run
```

---

## ✅ Checklist de Deploy

### Antes do Deploy:
- [ ] `.env` configurado com valores de produção
- [ ] `JWT_SECRET` alterado para senha forte
- [ ] `DATABASE_URL` apontando para banco de produção
- [ ] `APP_URL` com URL correta da API
- [ ] `CORS_ORIGINS` com URLs do frontend
- [ ] Banco de dados criado
- [ ] Redis configurado

### Durante o Deploy:
- [ ] Backup do banco feito
- [ ] Migrations aplicadas (`complete_migration.sql`)
- [ ] Build do backend executado
- [ ] Build do frontend executado
- [ ] Serviços iniciados
- [ ] Nginx configurado (se aplicável)
- [ ] SSL configurado (HTTPS)

### Após o Deploy:
- [ ] Endpoint `/health` respondendo
- [ ] Swagger acessível (`/api/docs`)
- [ ] Logs do sistema verificados
- [ ] Frontend carregando corretamente
- [ ] Login funcionando
- [ ] WebSocket conectando
- [ ] Logs sem erros críticos

---

## 🔧 Comandos Úteis

### Docker Compose:
```bash
# Ver logs
docker-compose logs -f backend

# Reiniciar
docker-compose restart backend

# Parar tudo
docker-compose down

# Ver status
docker-compose ps

# Rebuild
docker-compose up -d --build
```

### Banco de Dados:
```bash
# Backup
docker-compose exec postgres pg_dump -U postgres vend > backup.sql

# Restore
docker-compose exec -T postgres psql -U postgres vend < backup.sql

# Conectar ao banco
docker-compose exec postgres psql -U postgres -d vend
```

### Monitoramento:
```bash
# Ver logs em tempo real
docker-compose logs -f backend

# Ou com PM2
pm2 logs newvend-backend
```

---

## 🚨 Troubleshooting

### Backend não inicia?
```bash
# Ver logs detalhados
docker-compose logs backend

# Verificar variáveis de ambiente
docker-compose exec backend env | grep -E "DATABASE|REDIS|JWT"

# Verificar se porta está em uso
sudo lsof -i :3000
```

### Erro de conexão com banco?
```bash
# Testar conexão
docker-compose exec postgres psql -U postgres -d vend -c "SELECT 1;"

# Verificar se banco existe
docker-compose exec postgres psql -U postgres -l | grep vend
```

### WebSocket não conecta?
```bash
# Verificar logs do Nginx
sudo tail -f /var/log/nginx/error.log

# Verificar se proxy está configurado corretamente
# Ver seção "Nginx para Backend" acima
```

---

## 📚 Documentação Adicional

- **Guia de Monitoramento:** `backend/GUIA-MONITORAMENTO.md`
- **Migrations SQL:** `backend/migrations/complete_migration.sql`
- **Configuração Docker:** `backend/docker-compose.yml`

---

## 🎯 Deploy em 3 Comandos

```bash
# 1. Configure .env
cd backend && cp .env.production.example .env && nano .env

# 2. Execute deploy
./deploy.sh

# 3. Verifique
curl http://localhost:3000/health
```

Pronto! 🚀

