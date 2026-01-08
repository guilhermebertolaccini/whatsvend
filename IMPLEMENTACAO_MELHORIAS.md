# 🚀 IMPLEMENTAÇÃO DAS MELHORIAS - Sistema Newvend

## 📋 RESUMO DAS MELHORIAS IMPLEMENTADAS

✅ **Sistema de Fila de Espera** - Operadores sem linha entram automaticamente na fila
✅ **Pool de Linhas Reservadas** - 15 linhas aceitam apenas 1 operador (garantia de disponibilidade)
✅ **Rotação Dinâmica de Linhas** - Balanceamento automático de carga
✅ **Monitor de Disponibilidade** - Cron jobs + alertas automáticos para admins
✅ **Dashboard de Monitoramento** - Endpoint `/monitoring/dashboard` (admin only)
✅ **Validação de Arquivos** - Tamanho máximo 16MB e tipos permitidos
✅ **Job de Limpeza** - Arquivos antigos (>30 dias) deletados automaticamente
✅ **Seed Melhorado** - Cria 85 linhas automaticamente no segmento "Padrão"

---

## 📦 PASSO 1: APLICAR MIGRATION SQL

Execute a migration SQL para criar as novas tabelas e campos:

```bash
cd /home/unix/git/newvend/backend

# Aplicar migration via Prisma
npx prisma migrate dev --name add_operator_queue_and_reserve_lines

# OU aplicar manualmente via psql
psql -U seu_usuario -d newvend -f sql/add_operator_queue_and_reserve_lines.sql
```

**O que essa migration faz:**
- ✅ Cria tabela `OperatorQueue` (fila de espera)
- ✅ Cria tabela `LineAvailabilityLog` (histórico de disponibilidade)
- ✅ Adiciona campo `isReserve` em `LinesStock`
- ✅ Marca 15 linhas existentes como reserva automaticamente

---

## 🔄 PASSO 2: ATUALIZAR SCHEMA DO PRISMA

O schema já foi atualizado com os novos modelos. Gere o Prisma Client:

```bash
cd /home/unix/git/newvend/backend
npx prisma generate
```

---

## 🌱 PASSO 3: RODAR SEED (OPCIONAL - AMBIENTE DE DEV)

**⚠️ ATENÇÃO:** O seed agora cria 85 linhas automaticamente!

```bash
cd /home/unix/git/newvend/backend
npm run seed
```

**O que o seed faz:**
- Cria segmento "Padrão"
- Cria 3 usuários (admin, supervisor, operator)
- **NOVO:** Cria 85 linhas WhatsApp (5511900001 ... 5511900085)
- **NOVO:** Marca 15 dessas linhas como reserva
- Cria 32 tabulações
- Cria 2 tags de exemplo

**⚠️ IMPORTANTE:** As linhas criadas são apenas registros no banco de dados. Você ainda precisa criar as instâncias manualmente na Evolution API!

---

## 🔧 PASSO 4: ATUALIZAR MÓDULOS DO NESTJS

Adicione os novos módulos no `app.module.ts`:

```typescript
// backend/src/app.module.ts

import { OperatorQueueModule } from './operator-queue/operator-queue.module';
import { LineSwitchingModule } from './line-switching/line-switching.module';
import { LineAvailabilityMonitorModule } from './line-availability/line-availability-monitor.module';
import { ScheduleModule } from '@nestjs/schedule'; // Para cron jobs

@Module({
  imports: [
    // ... outros imports
    ScheduleModule.forRoot(), // Habilitar cron jobs
    OperatorQueueModule,
    LineSwitchingModule,
    LineAvailabilityMonitorModule,
  ],
})
export class AppModule {}
```

---

## 📦 PASSO 5: INSTALAR DEPENDÊNCIAS NECESSÁRIAS

```bash
cd /home/unix/git/newvend/backend
npm install @nestjs/schedule
```

---

## 🔐 PASSO 6: CONFIGURAR GUARDS (JÁ IMPLEMENTADO)

Os endpoints de monitoramento já estão protegidos com `@Roles('admin')`:

```typescript
// ✅ Apenas admins podem acessar
GET /monitoring/dashboard
GET /monitoring/history?hours=24
GET /monitoring/queue
GET /monitoring/line-loads
GET /monitoring/alerts
```

---

## ⚙️ PASSO 7: INTEGRAR COM WEBSOCKET (JÁ IMPLEMENTADO)

O WebSocket Gateway já foi atualizado para:
- ✅ Adicionar operadores à fila quando não há linha disponível
- ✅ Verificar campo `isReserve` ao atribuir linhas
- ✅ Emitir eventos para admins quando houver alertas

---

## 🎨 PASSO 8: TESTAR AS FUNCIONALIDADES

### 8.1 Testar Fila de Espera

```bash
# 1. Fazer login com 200 operadores simultâneos (simular sobrecarga)
# 2. Verificar que operadores entram na fila automaticamente
# 3. Adicionar nova linha e verificar que operador da fila recebe automaticamente
```

### 8.2 Testar Linhas Reserva

```bash
# 1. Verificar que linhas com isReserve=true aceitam apenas 1 operador
# 2. Tentar vincular 2º operador e verificar erro
# 3. Verificar que há sempre linhas reserva disponíveis
```

### 8.3 Testar Monitoramento (Admin Only)

```bash
# 1. Fazer login como admin
# 2. Acessar: GET http://localhost:3000/monitoring/dashboard
# 3. Verificar dados retornados: disponibilidade, fila, carga das linhas, etc
# 4. Verificar que não-admins recebem 403 Forbidden
```

### 8.4 Testar Upload de Arquivos

```bash
# 1. Tentar enviar arquivo > 16MB - deve retornar erro
# 2. Tentar enviar arquivo .exe - deve retornar erro
# 3. Enviar PDF válido < 16MB - deve funcionar
```

### 8.5 Testar Limpeza de Arquivos

```bash
# Aguardar cron job rodar às 3h da manhã
# OU executar manualmente:
cd /home/unix/git/newvend/backend
# (criar endpoint temporário para testar o serviço)
```

---

## 📊 PASSO 9: MONITORAR LOGS

Os novos serviços geram logs detalhados:

```bash
# Ver logs do backend
tail -f /home/unix/git/newvend/backend/logs/app.log

# Buscar logs específicos
grep "OperatorQueue" logs/app.log
grep "LineAvailability" logs/app.log
grep "LineSwitching" logs/app.log
grep "MediaCleanup" logs/app.log
```

---

## 🔔 PASSO 10: CONFIGURAR ALERTAS (ADMIN)

Os alertas são enviados automaticamente via WebSocket para admins online:

```typescript
// Frontend: Escutar eventos de alerta
realtimeSocket.on('monitoring-alert', (alert) => {
  console.log('Alerta recebido:', alert);

  if (alert.severity === 'CRITICAL') {
    // Mostrar notificação urgente
    toast.error(`CRÍTICO: ${alert.message}`);
  } else if (alert.severity === 'WARNING') {
    // Mostrar aviso
    toast.warning(alert.message);
  }
});
```

---

## 📈 CRON JOBS ATIVOS

Os seguintes cron jobs rodam automaticamente:

| Job | Frequência | Descrição |
|-----|------------|-----------|
| `checkAvailability()` | A cada 1 minuto | Verifica disponibilidade e salva log |
| `processOperatorQueue()` | A cada 30 segundos | Processa fila de operadores |
| `balanceLineLoad()` | A cada 5 minutos | Balanceia carga das linhas |
| `cleanupOldFiles()` | Diariamente às 3h | Deleta arquivos > 30 dias |

---

## 🆘 TROUBLESHOOTING

### Problema: Operadores não entram na fila
**Solução:** Verificar se `OperatorQueueModule` está importado no `app.module.ts`

### Problema: Linhas reserva aceitam 2 operadores
**Solução:** Verificar se migration foi aplicada corretamente (`isReserve` deve existir)

### Problema: Alertas não chegam para admin
**Solução:** Verificar se admin está online (status='Online') e conectado via WebSocket

### Problema: Upload de arquivo falha
**Solução:** Verificar se diretório `./uploads` existe e tem permissões de escrita

### Problema: Cron jobs não rodam
**Solução:** Verificar se `ScheduleModule.forRoot()` está importado no `app.module.ts`

---

## 📝 VERIFICAÇÃO FINAL

Execute esse checklist para garantir que tudo está funcionando:

- [ ] Migration aplicada com sucesso
- [ ] Prisma Client gerado (`npx prisma generate`)
- [ ] Seed rodado (ambiente dev)
- [ ] `@nestjs/schedule` instalado
- [ ] Módulos adicionados ao `app.module.ts`
- [ ] Backend reiniciado (`npm run start:dev`)
- [ ] Endpoint `/monitoring/dashboard` acessível (admin only)
- [ ] Operadores sem linha entram na fila
- [ ] Linhas reserva aceitam apenas 1 operador
- [ ] Upload de arquivos valida tamanho e tipo
- [ ] Logs sendo gerados corretamente

---

## 🎯 PRÓXIMOS PASSOS (OPCIONAL)

### Criar Dashboard Visual no Frontend

Crie uma página React em `/frontend/src/pages/Monitoring.tsx` para exibir:
- Gráfico de disponibilidade de linhas (últimas 24h)
- Lista de operadores na fila
- Top 10 linhas mais carregadas
- Alertas ativos
- Estatísticas de storage (arquivos)

### Configurar Notificações por Email/SMS

Integre com serviço de notificação (Twilio, SendGrid) para alertar admins sobre:
- Disponibilidade < 5% (CRÍTICO)
- Operadores na fila > 10
- Linhas banidas

### Implementar Modo Emergência

Quando disponibilidade < 5%, ativar temporariamente:
- Linhas reserva aceitam 2 operadores
- Prioridade aumentada na fila
- Notificação para todos os admins

---

## 📞 SUPORTE

Se encontrar problemas, verifique:
1. Logs do backend (`tail -f logs/app.log`)
2. Console do navegador (F12)
3. Status dos cron jobs (`ps aux | grep node`)
4. Conexão com Evolution API
5. Permissões do diretório `./uploads`

---

## 🎉 CONCLUSÃO

Todas as melhorias foram implementadas com sucesso! O sistema agora possui:

✅ Fila de espera automática
✅ Linhas reserva garantidas
✅ Balanceamento de carga
✅ Monitoramento em tempo real
✅ Alertas para admins
✅ Validação robusta de arquivos
✅ Limpeza automática de storage

**Sistema pronto para escalar com centenas de operadores e milhares de conversas!** 🚀
