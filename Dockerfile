# QA Bot Service V2 - Advanced Playwright Analysis
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar código
COPY server.js ./

# Exponer puerto
EXPOSE 3000

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start
CMD ["node", "server.js"]
