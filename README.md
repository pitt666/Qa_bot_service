# 🔍 QA Bot Service

Microservicio de análisis QA con Playwright para Marketing Tools.

## 🚀 Deploy en Coolify

### 1. Subir a GitHub

```bash
cd qa-bot-service
git init
git add .
git commit -m "QA Bot microservice with Playwright"
git branch -M main
git remote add origin https://github.com/pitt666/qa-bot-service.git
git push -u origin main
```

### 2. Crear app en Coolify

- **Repository:** `https://github.com/pitt666/qa-bot-service`
- **Branch:** `main`
- **Build Pack:** Dockerfile
- **Port:** 3000
- **Domain:** `qa.pedroarandamarketing.com` (o el que quieras)

### 3. Deploy

Click "Deploy" y espera 3-5 minutos.

---

## 📡 API Endpoints

### Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "qa-bot",
  "timestamp": "2026-02-09T02:00:00.000Z"
}
```

### Execute QA
```
POST /qa/execute
Content-Type: application/json
```

**Request:**
```json
{
  "url": "https://ejemplo.com",
  "modules": ["functional", "ux", "technical", "wordpress"]
}
```

**Response:**
```json
{
  "success": true,
  "status": "warning",
  "message": "Sitio con riesgos",
  "critical": [],
  "warnings": [
    "Imágenes muy pesadas detectadas (>500kb)"
  ],
  "recommendations": [
    "Optimizar imágenes con TinyPNG"
  ],
  "url": "https://ejemplo.com",
  "modules": ["functional", "ux", "technical", "wordpress"],
  "executedAt": "2026-02-09T02:00:00.000Z"
}
```

---

## 🔧 Configurar n8n

En el workflow "QA Bot" de n8n:

1. Eliminar nodo "Execute QA with Playwright"
2. Agregar nodo **"HTTP Request"**
3. Configurar:
   - Method: POST
   - URL: `https://qa.tudominio.com/qa/execute`
   - Body: `{{ $json.body }}`
4. Conectar: Webhook → HTTP Request → Response

---

## 🧪 Probar localmente

```bash
npm install
npm start
```

Probar con curl:
```bash
curl -X POST http://localhost:3000/qa/execute \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://google.com",
    "modules": ["functional", "technical"]
  }'
```

---

## 📊 Lo que analiza

### Funcional
- Formularios y validaciones
- Links rotos
- Botones de submit

### UX
- Headlines H1
- CTAs y botones
- Tamaño de texto

### Técnico
- Errores de JavaScript
- Imágenes pesadas
- Lazy loading
- Meta tags SEO

### WordPress
- Versión de WordPress
- Plugins detectados
- Archivos expuestos
- Seguridad básica

---

## ⚙️ Variables de entorno (opcional)

```env
PORT=3000
NODE_ENV=production
```

---

## 🐛 Troubleshooting

**Error: "Cannot find module 'playwright'"**
- Ejecutar: `npm install`

**Timeout al analizar sitio:**
- Aumentar timeout en server.js (línea del goto)

**Navegador no inicia:**
- Verificar que la imagen Docker incluye Playwright

---

## 📝 Notas

- Cada análisis tarda 30-90 segundos
- Consume ~200-300MB RAM por análisis
- Chromium se cierra automáticamente después de cada análisis
