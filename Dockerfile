# Frontend Marketing Tools - Con nginx.conf personalizado
FROM nginx:alpine

# Copiar archivos del sitio
COPY public/ /usr/share/nginx/html/

# Copiar configuración nginx personalizada
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer puerto
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Nginx se inicia automáticamente
