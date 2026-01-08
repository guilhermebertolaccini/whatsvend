# Debug Bad Gateway no Coolify

## 🔍 Diagnóstico

Se você está vendo **Bad Gateway** mas os logs mostram que o nginx está respondendo aos healthchecks, siga estes passos:

## ✅ Verificações no Coolify

### 1. Verificar Porta Interna
- No painel do Coolify, vá em **Settings** da aplicação
- **Porta Interna (Internal Port)**: Deve ser `80`
- **Porta Externa**: Pode ser qualquer porta disponível

### 2. Verificar se os Arquivos Foram Buildados

Execute no terminal do Coolify ou via SSH:

```bash
# Listar containers
docker ps

# Entrar no container
docker exec -it <container-id> sh

# Verificar se os arquivos existem
ls -la /usr/share/nginx/html/

# Deve mostrar:
# - index.html
# - assets/ (pasta com JS e CSS)
```

### 3. Verificar Logs do Nginx

```bash
# Ver logs de erro
docker exec -it <container-id> cat /var/log/nginx/error.log

# Ver logs de acesso
docker exec -it <container-id> tail -f /var/log/nginx/access.log
```

### 4. Testar Nginx Manualmente

```bash
# Testar configuração
docker exec -it <container-id> nginx -t

# Deve retornar: "syntax is ok" e "test is successful"

# Testar se nginx está servindo arquivos
docker exec -it <container-id> wget -O- http://localhost/
```

## 🐛 Problemas Comuns

### Problema 1: Arquivos não foram buildados
**Sintoma**: Pasta `/usr/share/nginx/html` está vazia ou sem `index.html`

**Solução**: 
- Verifique os logs de build no Coolify
- Certifique-se de que o build completou com sucesso
- Verifique se há erros no `npm run build`

### Problema 2: Porta incorreta
**Sintoma**: Bad Gateway mesmo com nginx rodando

**Solução**:
- No Coolify, configure **Porta Interna = 80**
- Verifique se não há conflito de porta externa

### Problema 3: Nginx não está iniciando
**Sintoma**: Container para de funcionar

**Solução**:
```bash
# Verificar se nginx está rodando
docker exec -it <container-id> ps aux | grep nginx

# Reiniciar nginx
docker exec -it <container-id> nginx -s reload
```

### Problema 4: Coolify fazendo proxy reverso incorretamente
**Sintoma**: Healthcheck funciona mas Bad Gateway no navegador

**Solução**:
- Verifique se o Coolify está configurado como **"Standalone"** e não como **"Behind Proxy"**
- Se estiver atrás de proxy, pode precisar configurar headers

## 🔧 Comandos Úteis

```bash
# Ver status do container
docker ps | grep frontend

# Ver logs em tempo real
docker logs -f <container-id>

# Testar conexão HTTP
curl -I http://localhost:<porta-externa>

# Verificar se index.html existe e tem conteúdo
docker exec -it <container-id> cat /usr/share/nginx/html/index.html | head -20
```

## 📋 Checklist de Debug

- [ ] Container está rodando (`docker ps`)
- [ ] Arquivos existem em `/usr/share/nginx/html/`
- [ ] `index.html` existe e tem conteúdo
- [ ] Nginx está rodando (`ps aux | grep nginx`)
- [ ] Configuração do nginx está OK (`nginx -t`)
- [ ] Porta interna configurada como `80` no Coolify
- [ ] Healthcheck está passando
- [ ] Logs não mostram erros críticos

## 🚀 Solução Rápida

Se nada funcionar, tente:

1. **Redeploy completo**:
   - No Coolify, pare a aplicação
   - Delete o container (se necessário)
   - Faça um novo deploy

2. **Verificar build**:
   - Veja os logs de build completos
   - Certifique-se de que não há erros no `npm run build`

3. **Testar localmente**:
   ```bash
   cd frontend
   docker build -t frontend-test .
   docker run -p 8080:80 frontend-test
   # Acesse http://localhost:8080
   ```

Se funcionar localmente mas não no Coolify, o problema é na configuração do Coolify, não no Dockerfile.

