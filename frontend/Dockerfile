FROM node:20-alpine

WORKDIR /app

# Copiar dependências
COPY package*.json ./

# Instalar dependências
RUN npm install --legacy-peer-deps

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build && \
    echo "✅ Build completed" && \
    ls -la dist/

# Instalar serve para servir arquivos estáticos
RUN npm install -g serve

EXPOSE 3010

# Servir aplicação buildada
CMD ["serve", "-s", "dist", "-l", "3010"]