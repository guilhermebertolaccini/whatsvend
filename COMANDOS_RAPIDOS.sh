#!/bin/bash

# ============================================================================
# COMANDOS RÁPIDOS - Implementação das Melhorias do Sistema Newvend
# ============================================================================

echo "🚀 Implementando melhorias do sistema Newvend..."

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ============================================================================
# PASSO 1: Aplicar Migration SQL
# ============================================================================
echo -e "${YELLOW}📦 PASSO 1: Aplicando migration SQL...${NC}"
cd /home/unix/git/newvend/backend

# Método 1: Via Prisma (recomendado)
npx prisma migrate dev --name add_operator_queue_and_reserve_lines

# Se falhar, tentar método 2:
# psql -U seu_usuario -d newvend -f sql/add_operator_queue_and_reserve_lines.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migration aplicada com sucesso!${NC}"
else
    echo -e "${RED}❌ Erro ao aplicar migration. Verifique os logs.${NC}"
    exit 1
fi

# ============================================================================
# PASSO 2: Gerar Prisma Client
# ============================================================================
echo -e "${YELLOW}🔄 PASSO 2: Gerando Prisma Client...${NC}"
npx prisma generate

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Prisma Client gerado!${NC}"
else
    echo -e "${RED}❌ Erro ao gerar Prisma Client.${NC}"
    exit 1
fi

# ============================================================================
# PASSO 3: Instalar Dependências
# ============================================================================
echo -e "${YELLOW}📦 PASSO 3: Instalando dependências...${NC}"
npm install @nestjs/schedule

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependências instaladas!${NC}"
else
    echo -e "${RED}❌ Erro ao instalar dependências.${NC}"
    exit 1
fi

# ============================================================================
# PASSO 4: Rodar Seed (OPCIONAL - apenas em ambiente de dev)
# ============================================================================
read -p "Deseja rodar o seed para criar as 85 linhas? (s/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo -e "${YELLOW}🌱 PASSO 4: Rodando seed...${NC}"
    npm run seed

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Seed executado com sucesso!${NC}"
        echo -e "${YELLOW}⚠️  LEMBRE-SE: As 85 linhas foram criadas apenas no banco de dados.${NC}"
        echo -e "${YELLOW}⚠️  Você ainda precisa criar as instâncias na Evolution API manualmente!${NC}"
    else
        echo -e "${RED}❌ Erro ao executar seed.${NC}"
    fi
else
    echo -e "${YELLOW}⏭️  Seed pulado.${NC}"
fi

# ============================================================================
# PASSO 5: Verificar Estrutura do App Module
# ============================================================================
echo -e "${YELLOW}🔍 PASSO 5: Verificando app.module.ts...${NC}"

APP_MODULE="/home/unix/git/newvend/backend/src/app.module.ts"

# Verificar se os módulos necessários estão importados
if grep -q "OperatorQueueModule" "$APP_MODULE"; then
    echo -e "${GREEN}✅ OperatorQueueModule encontrado${NC}"
else
    echo -e "${RED}❌ OperatorQueueModule NÃO encontrado em app.module.ts${NC}"
    echo -e "${YELLOW}   Adicione: import { OperatorQueueModule } from './operator-queue/operator-queue.module';${NC}"
fi

if grep -q "LineSwitchingModule" "$APP_MODULE"; then
    echo -e "${GREEN}✅ LineSwitchingModule encontrado${NC}"
else
    echo -e "${RED}❌ LineSwitchingModule NÃO encontrado em app.module.ts${NC}"
    echo -e "${YELLOW}   Adicione: import { LineSwitchingModule } from './line-switching/line-switching.module';${NC}"
fi

if grep -q "LineAvailabilityMonitorModule" "$APP_MODULE"; then
    echo -e "${GREEN}✅ LineAvailabilityMonitorModule encontrado${NC}"
else
    echo -e "${RED}❌ LineAvailabilityMonitorModule NÃO encontrado em app.module.ts${NC}"
    echo -e "${YELLOW}   Adicione: import { LineAvailabilityMonitorModule } from './line-availability/line-availability-monitor.module';${NC}"
fi

if grep -q "ScheduleModule" "$APP_MODULE"; then
    echo -e "${GREEN}✅ ScheduleModule encontrado${NC}"
else
    echo -e "${RED}❌ ScheduleModule NÃO encontrado em app.module.ts${NC}"
    echo -e "${YELLOW}   Adicione: import { ScheduleModule } from '@nestjs/schedule';${NC}"
    echo -e "${YELLOW}   E no imports: ScheduleModule.forRoot(),${NC}"
fi

# ============================================================================
# PASSO 6: Verificar diretório de uploads
# ============================================================================
echo -e "${YELLOW}📁 PASSO 6: Verificando diretório de uploads...${NC}"

UPLOADS_DIR="/home/unix/git/newvend/backend/uploads"

if [ -d "$UPLOADS_DIR" ]; then
    echo -e "${GREEN}✅ Diretório de uploads existe${NC}"

    # Verificar permissões
    if [ -w "$UPLOADS_DIR" ]; then
        echo -e "${GREEN}✅ Diretório tem permissões de escrita${NC}"
    else
        echo -e "${RED}❌ Diretório SEM permissões de escrita${NC}"
        echo -e "${YELLOW}   Execute: chmod 755 $UPLOADS_DIR${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Diretório de uploads não existe. Criando...${NC}"
    mkdir -p "$UPLOADS_DIR"
    chmod 755 "$UPLOADS_DIR"
    echo -e "${GREEN}✅ Diretório criado com sucesso!${NC}"
fi

# ============================================================================
# PASSO 7: Executar Build
# ============================================================================
echo -e "${YELLOW}🔨 PASSO 7: Executando build...${NC}"
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build concluído com sucesso!${NC}"
else
    echo -e "${RED}❌ Erro no build. Verifique os erros acima.${NC}"
    exit 1
fi

# ============================================================================
# CONCLUSÃO
# ============================================================================
echo -e "\n${GREEN}============================================================================${NC}"
echo -e "${GREEN}🎉 IMPLEMENTAÇÃO CONCLUÍDA COM SUCESSO!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo -e ""
echo -e "${YELLOW}📋 PRÓXIMOS PASSOS:${NC}"
echo -e "1. Reiniciar o backend: ${GREEN}npm run start:dev${NC}"
echo -e "2. Testar endpoint de monitoramento: ${GREEN}GET http://localhost:3000/monitoring/dashboard${NC}"
echo -e "3. Fazer login com operadores e verificar fila de espera"
echo -e "4. Verificar logs: ${GREEN}tail -f logs/app.log${NC}"
echo -e ""
echo -e "${YELLOW}📖 DOCUMENTAÇÃO COMPLETA:${NC}"
echo -e "   Leia o arquivo: ${GREEN}/home/unix/git/newvend/IMPLEMENTACAO_MELHORIAS.md${NC}"
echo -e ""
echo -e "${GREEN}✅ Sistema pronto para escalar com centenas de operadores!${NC}"
echo -e "${GREEN}============================================================================${NC}"
