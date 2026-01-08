# Configuração do Frontend no Coolify

## ⚠️ Problema: Bad Gateway

Se você está recebendo **Bad Gateway**, verifique as seguintes configurações no Coolify:

## 🔧 Configuração de Porta no Coolify

### Passo 1: Configurar Porta Interna

No painel do Coolify, na configuração da aplicação:

1. Vá em **"Settings"** ou **"Configurações"**
2. Procure por **"Port"** ou **"Porta"**
3. Configure:
   - **Porta Interna (Internal Port)**: `80`
   - **Porta Externa (External Port)**: Deixe o Coolify escolher automaticamente ou configure uma porta específica (ex: `3001`, `8080`, etc.)

### Passo 2: Verificar Healthcheck

O Dockerfile já tem healthcheck configurado, mas certifique-se de que:
- O healthcheck está habilitado no Coolify
- O path do healthcheck está correto: `/` (raiz)

### Passo 3: Verificar Logs

Se ainda estiver com Bad Gateway, verifique os logs:

1. No Coolify, vá em **"Logs"** da aplicação
2. Procure por erros do nginx
3. Verifique se o container está rodando: `docker ps`

## 📋 Checklist de Configuração

- [ ] Porta interna configurada como `80` no Coolify
- [ ] Dockerfile está na pasta `frontend/`
- [ ] Build está completando com sucesso
- [ ] Container está rodando (`docker ps`)
- [ ] Logs não mostram erros do nginx
- [ ] Healthcheck está passando

## 🔍 Troubleshooting

### Bad Gateway Persistente

1. **Verificar se o nginx está rodando**:
   ```bash
   # No servidor do Coolify
   docker exec -it <container-id> ps aux | grep nginx
   ```

2. **Verificar se os arquivos foram buildados**:
   ```bash
   docker exec -it <container-id> ls -la /usr/share/nginx/html
   ```
   Deve mostrar `index.html` e pasta `assets/`

3. **Verificar configuração do nginx**:
   ```bash
   docker exec -it <container-id> nginx -t
   ```

4. **Ver logs do nginx**:
   ```bash
   docker exec -it <container-id> cat /var/log/nginx/error.log
   ```

### Porta Já em Uso

Se a porta 80 externa já está em uso:

1. No Coolify, configure uma porta externa diferente (ex: `3001`, `8080`, `9000`)
2. O Coolify vai fazer o mapeamento automaticamente
3. A porta interna do container continua sendo `80`

### Nginx Não Inicia

Se o nginx não está iniciando:

1. Verifique se o arquivo `nginx.conf` está sendo copiado corretamente
2. Verifique os logs: `docker logs <container-id>`
3. Teste a configuração: `docker exec -it <container-id> nginx -t`

## 🚀 Configuração Recomendada no Coolify

```
Application Type: Dockerfile
Dockerfile Path: frontend/Dockerfile
Context Path: frontend/
Internal Port: 80
External Port: (deixe o Coolify escolher ou configure manualmente)
Healthcheck: Enabled
Healthcheck Path: /
```

## 📝 Variáveis de Ambiente (se necessário)

Se o frontend precisar de variáveis de ambiente, configure no Coolify:

- `VITE_API_URL`: URL da API backend
- Outras variáveis que começam com `VITE_`

**Importante**: Variáveis de ambiente do Vite precisam ser definidas no **momento do build**, não em runtime!

## ✅ Verificação Final

Após o deploy, verifique:

1. Container está rodando: `docker ps | grep frontend`
2. Porta está mapeada: `docker port <container-id>`
3. Aplicação responde: `curl http://localhost:<porta-externa>`
4. Healthcheck está OK no painel do Coolify

