# Deploy do Frontend na Coolify

Este guia explica como fazer o deploy do frontend React na Coolify.

## 📋 Pré-requisitos

- Repositório Git configurado (GitHub, GitLab, etc.)
- Coolify instalado e configurado no servidor
- Acesso ao painel da Coolify

## 🚀 Passos para Deploy

### 1. Preparação do Código

O projeto já está preparado com:
- ✅ `Dockerfile` otimizado para produção
- ✅ `.dockerignore` configurado
- ✅ `nginx.conf` para servir a SPA
- ✅ React atualizado para 19.2.3 (corrige CVE-2025-55182)

### 2. Configuração na Coolify

1. **Acesse o painel da Coolify** (`http://seu-servidor:8000`)

2. **Criar Nova Aplicação**:
   - Clique em "Nova Aplicação"
   - Conecte ao seu repositório Git
   - Selecione o branch (geralmente `main` ou `master`)

3. **Configurar Build**:
   - **Tipo de Build**: Selecione "Dockerfile"
   - **Dockerfile Path**: `frontend/Dockerfile` (ou apenas `Dockerfile` se estiver na raiz do frontend)
   - **Context Path**: `frontend/` (se o Dockerfile estiver dentro da pasta frontend)

4. **Variáveis de Ambiente** (se necessário):
   - `VITE_API_URL`: URL da API backend (ex: `https://api.newvend.taticamarketing.com.br`)
   - Outras variáveis que o frontend precise

5. **Configurar Porta**:
   - Porta interna: `80` (nginx escuta na porta 80)
   - Coolify vai mapear para uma porta externa automaticamente

6. **Deploy**:
   - Clique em "Deploy"
   - Acompanhe os logs do build

## 🔧 Configurações do Dockerfile

O Dockerfile usa multi-stage build:
- **Stage 1 (builder)**: Instala dependências e faz build com Vite
- **Stage 2 (production)**: Usa nginx:alpine para servir arquivos estáticos

### Características:
- ✅ Build otimizado com cache de layers
- ✅ Nginx configurado para SPA (redireciona rotas para index.html)
- ✅ Gzip compression habilitado
- ✅ Cache de arquivos estáticos (1 ano)
- ✅ Healthcheck configurado
- ✅ Security headers

## 📝 Notas Importantes

1. **Variáveis de Ambiente**: Se o frontend precisa de variáveis de ambiente, configure-as no painel da Coolify. Variáveis que começam com `VITE_` são expostas no build.

2. **API URL**: Certifique-se de que a URL da API está configurada corretamente. O frontend precisa conseguir acessar o backend.

3. **Domínio**: Configure um domínio personalizado no Coolify se necessário. O SSL será gerenciado automaticamente pelo Let's Encrypt.

4. **Build Time**: O primeiro build pode demorar alguns minutos. Builds subsequentes são mais rápidos devido ao cache.

## 🐛 Troubleshooting

### Build falha
- Verifique os logs no painel da Coolify
- Certifique-se de que todas as dependências estão no `package.json`
- Verifique se o Node.js 20 está disponível

### Aplicação não carrega
- Verifique se o nginx está rodando: `docker logs <container-id>`
- Verifique se os arquivos foram buildados corretamente
- Verifique a configuração do nginx

### Rotas não funcionam (404)
- Certifique-se de que o `nginx.conf` está configurado com `try_files $uri $uri/ /index.html;`
- Verifique se o arquivo foi copiado corretamente no Dockerfile

## 📦 Estrutura do Build

Após o build, a estrutura no container será:
```
/usr/share/nginx/html/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── ...
└── ...
```

## 🔄 Atualizações

Para atualizar a aplicação:
1. Faça push das alterações para o Git
2. No Coolify, clique em "Redeploy" ou configure auto-deploy
3. Acompanhe os logs

## 🔒 Segurança

- React atualizado para 19.2.3 (corrige CVE-2025-55182)
- Nginx com security headers configurados
- Container rodando como usuário não-root (nginx já faz isso)
- Healthcheck para monitoramento

