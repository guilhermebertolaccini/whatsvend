# Módulo de Mídia

Sistema completo de upload, download e gerenciamento de mídia (imagens, vídeos, áudios e documentos) com limpeza automática.

## 🎯 Funcionalidades

### ✅ Upload de Mídia
- Operadores podem fazer upload de arquivos para enviar via WhatsApp
- Limite de 16MB (padrão WhatsApp)
- Tipos suportados: imagens, vídeos, áudios, documentos

### ✅ Recebimento de Mídia
- Mídia recebida via webhook é automaticamente baixada da Evolution
- Armazenamento local em `/uploads`
- URL salva em `Conversation.mediaUrl`

### ✅ Download/Visualização
- Endpoint público (autenticado) para download: `GET /media/:filename`
- Serve arquivos diretamente do storage

### ✅ Limpeza Automática
- **Job 1 (Diário às 3h)**: Deleta arquivos de conversas finalizadas há mais de 15 dias
- **Job 2 (Semanal aos domingos)**: Deleta arquivos órfãos (não referenciados no banco)

## 📡 Endpoints

### 1. Upload de Mídia
```http
POST /media/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: [arquivo]
```

**Resposta:**
```json
{
  "success": true,
  "mediaUrl": "/media/media-1702345678-123456789.jpg",
  "fileName": "media-1702345678-123456789.jpg",
  "originalName": "foto.jpg",
  "mimeType": "image/jpeg",
  "size": 245678
}
```

### 2. Download/Visualização
```http
GET /media/:filename
Authorization: Bearer {token}
```

Retorna o arquivo diretamente (pode ser usado em `<img src="">`, `<video src="">`, etc.)

## 📋 Tipos de Arquivo Suportados

### Imagens
- `image/jpeg` (.jpg, .jpeg)
- `image/png` (.png)
- `image/gif` (.gif)
- `image/webp` (.webp)

### Vídeos
- `video/mp4` (.mp4)
- `video/mpeg` (.mpeg)

### Áudios
- `audio/mpeg` (.mp3)
- `audio/ogg` (.ogg)
- `audio/mp4` (.m4a)

### Documentos
- `application/pdf` (.pdf)
- `application/msword` (.doc)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)
- `application/vnd.ms-excel` (.xls)
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx)

## 🧹 Limpeza Automática

### Regras de Limpeza

**Critério para deleção:**
1. Conversa **finalizada** (possui `tabulation`)
2. Última atualização há **mais de 15 dias**
3. Possui mídia (`mediaUrl` não nulo)

**Quando:**
- Todos os dias às 3h da manhã (horário do servidor)

**Processo:**
1. Busca conversas finalizadas há 15+ dias com mídia
2. Deleta arquivo físico em `/uploads`
3. Define `mediaUrl = null` no banco
4. Registra logs detalhados

### Limpeza de Órfãos

**Critério:**
- Arquivo existe em `/uploads`
- Não está referenciado em nenhuma conversa

**Quando:**
- Uma vez por semana (domingos às 4h)

**Processo:**
1. Lista todos os arquivos em `/uploads`
2. Verifica se cada arquivo está referenciado no banco
3. Deleta arquivos não referenciados

## 🔄 Fluxo de Mídia

### Envio (Operador → Contato)

1. Operador faz upload via `POST /media/upload`
2. Recebe `mediaUrl` na resposta
3. Envia mensagem via WebSocket com `mediaUrl` e `messageType`
4. Backend envia via Evolution API
5. Mídia salva em `Conversation` com `mediaUrl` preenchido

### Recebimento (Contato → Operador)

1. Webhook recebe mensagem com mídia
2. Backend baixa mídia da Evolution automaticamente
3. Salva em `/uploads` com nome único
4. Salva `mediaUrl` local em `Conversation`
5. Emite via WebSocket para operador
6. Frontend exibe mídia

### Limpeza (Após 15 dias)

1. Job diário roda às 3h
2. Identifica conversas finalizadas há 15+ dias
3. Deleta arquivo físico
4. Limpa `mediaUrl` no banco
5. Logs completos para auditoria

## 📁 Estrutura de Armazenamento

```
/uploads/
├── media-1702345678-5514999999999-image.jpg
├── media-1702345679-5514888888888-audio.ogg
├── media-1702345680-5514777777777-video.mp4
└── media-1702345681-5514666666666-document.pdf
```

**Formato do nome:**
```
{tipo}-{timestamp}-{telefone}-{tipo}.{extensão}
```

## ⚙️ Configuração

### Variáveis de Ambiente
Não há variáveis específicas. O módulo usa as configurações padrão:
- **Storage:** Local filesystem (`./uploads`)
- **Limite:** 16MB
- **Cron:** Ativado automaticamente

### Dockerfile
Certifique-se de que a pasta `/uploads` tem permissões corretas:

```dockerfile
# Criar diretório para uploads
RUN mkdir -p /app/uploads
RUN chown -R nodejs:nodejs /app
```

## 🔐 Segurança

1. **Autenticação obrigatória**: Todos os endpoints exigem JWT
2. **Validação de tipo**: Apenas tipos permitidos são aceitos
3. **Limite de tamanho**: 16MB (padrão WhatsApp)
4. **Nomes únicos**: Evita conflitos e sobrescrita
5. **Limpeza automática**: Previne acúmulo indefinido

## 📊 Logs

O sistema registra logs detalhados de todas as operações:

```
📎 Mídia salva: foto.jpg (245678 bytes)
📥 Mídia baixada da Evolution: media-123.jpg
🧹 Iniciando limpeza de mídias antigas...
📊 Encontradas 15 conversas com mídia para limpar
✅ Mídia deletada: media-123.jpg (contato: 5514999999999)
🧹 Limpeza concluída: 15 arquivos deletados, 0 erros
```

## 🚀 Uso no Frontend

### Upload de Mídia

```javascript
const uploadMedia = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('https://api.example.com/media/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();
  return data.mediaUrl; // "/media/media-123.jpg"
};
```

### Enviar com Mídia via WebSocket

```javascript
socket.emit('send-message', {
  contactPhone: '5514999999999',
  message: 'Veja esta foto!',
  messageType: 'image',
  mediaUrl: '/media/media-123.jpg',
});
```

### Exibir Mídia

```jsx
// Imagem
<img src={`https://api.example.com${conversation.mediaUrl}`} />

// Vídeo
<video src={`https://api.example.com${conversation.mediaUrl}`} controls />

// Áudio
<audio src={`https://api.example.com${conversation.mediaUrl}`} controls />

// Documento (download)
<a href={`https://api.example.com${conversation.mediaUrl}`} download>
  Download
</a>
```

## 🐛 Troubleshooting

### Upload falha com "File too large"
- Verifique se o arquivo é menor que 16MB
- WhatsApp tem limite de tamanho por tipo de mídia

### Mídia não aparece no frontend
- Verifique se `mediaUrl` está preenchido no banco
- Confira permissões da pasta `/uploads`
- Veja logs do download da Evolution

### Arquivos não são deletados
- Verifique se os cron jobs estão rodando (logs às 3h)
- Confirme que conversas estão sendo tabuladas
- Cheque se `updatedAt` está sendo atualizado

### Erro "File not found"
- Arquivo pode ter sido deletado pela limpeza automática
- Verifique se passou 15 dias da finalização

## 📝 Observações

1. **Backup**: Arquivos são deletados permanentemente. Faça backup externo se necessário.
2. **Storage**: Sistema usa filesystem local. Para produção com múltiplos servidores, considere S3/MinIO.
3. **Performance**: Para alto volume, considere CDN ou storage distribuído.
4. **Privacidade**: Mídia é deletada após 15 dias da finalização (LGPD/GDPR compliant).

