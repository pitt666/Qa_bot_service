# 🔍 QA Bot Service V2 - ANÁLISIS AVANZADO

Microservicio profesional de análisis QA con Playwright para auditorías profundas de sitios web.

## 🚀 MEJORAS vs V1

### ✅ Análisis Funcional Profundo
- ✅ **Formularios reales**: Analiza action, method, validación, campos
- ✅ **Botones verificados**: Comprueba que CTAs tengan acción válida
- ✅ **Links validados**: Detecta links rotos con requests reales
- ✅ **Emails validados**: Verifica campos de email con formato correcto

### ✅ UX Avanzado (WCAG)
- ✅ **Contraste WCAG**: Calcula ratios reales de color (4.5:1 para texto normal, 3:1 para grande)
- ✅ **Jerarquía visual**: Verifica estructura correcta H1 > H2 > H3
- ✅ **Legibilidad**: Tamaño promedio de fuente, elementos muy pequeños
- ✅ **Accesibilidad**: Detecta problemas de contraste y legibilidad

### ✅ Performance Real
- ✅ **Load Time**: Tiempo de carga completo en segundos
- ✅ **FCP**: First Contentful Paint medido
- ✅ **Requests**: Total de peticiones y peticiones fallidas
- ✅ **Errores JS**: Captura errores reales de consola con detalles

### ✅ SEO Completo
- ✅ **Meta tags**: Description, viewport, canonical
- ✅ **Títulos**: Longitud y optimización
- ✅ **Imágenes**: ALT tags, tamaño promedio, imágenes pesadas
- ✅ **Lazy loading**: Detecta si está implementado

### ✅ WordPress Profundo
- ✅ **Versión exacta**: Detección de versión instalada
- ✅ **Tema detectado**: Identifica el theme activo
- ✅ **Plugins**: Lista plugins comunes instalados
- ✅ **Vulnerabilidades**: wp-config.php, readme.html, xmlrpc.php expuestos

### ✅ Anti-Detección
- ✅ **Stealth mode**: Oculta webdriver para evitar bloqueos
- ✅ **User agent real**: Chrome 120 legítimo
- ✅ **Locale mexicano**: es-MX para sitios en español
- ✅ **Headers realistas**: Accept-Language, timezone

## 📊 RESPUESTA MEJORADA

```json
{
  "success": true,
  "status": "warning",
  "message": "⚠️ Sitio con advertencias",
  "critical": [
    "El sitio no responde correctamente (HTTP 403)",
    "Falta meta viewport - sitio no optimizado para móvil"
  ],
  "warnings": [
    "2 formulario(s) con problemas detectados",
    "15 elementos con contraste insuficiente (WCAG)",
    "3 imagen(es) sin atributo ALT (accesibilidad)"
  ],
  "recommendations": [
    "Mejorar contraste de colores para accesibilidad",
    "Optimizar imágenes con TinyPNG, usar WebP/AVIF",
    "Implementar lazy loading en imágenes"
  ],
  "details": {
    "performance": {
      "loadTime": "3.45s",
      "fcp": "1.82s",
      "requests": 45,
      "failedRequests": 2
    },
    "functional": {
      "forms": [
        {
          "index": 1,
          "action": "/contact",
          "method": "POST",
          "fields": [
            { "type": "email", "name": "email", "required": true },
            { "type": "text", "name": "message", "required": false }
          ],
          "hasSubmit": true,
          "hasValidation": true,
          "issues": []
        }
      ],
      "buttons": [
        {
          "text": "Contactar",
          "tag": "button",
          "hasAction": true,
          "actionValid": true
        }
      ],
      "links": {
        "total": 45,
        "internal": 30,
        "external": 15,
        "broken": 2
      }
    },
    "ux": {
      "headings": { "h1": 1, "h2": 5, "h3": 8 },
      "contrast": { "issues": 15, "checked": 50 },
      "readability": { "avgFontSize": 16, "smallTextCount": 3 }
    },
    "technical": {
      "performance": {
        "loadTime": "3.45s",
        "fcp": "1.82s",
        "requests": 45,
        "failedRequests": 2
      },
      "seo": {
        "title": "Inicio - Mi Sitio",
        "titleLength": 17,
        "hasMetaDescription": true,
        "hasViewport": false,
        "hasCanonical": true
      },
      "images": {
        "total": 12,
        "withoutAlt": 3,
        "heavy": 2,
        "avgSize": "235KB"
      },
      "errors": [
        "Uncaught TypeError: Cannot read property 'map' of undefined"
      ]
    },
    "wordpress": {
      "isWordPress": true,
      "version": "6.4.2",
      "theme": "twentytwentyfour",
      "plugins": ["Contact Form 7", "Yoast SEO", "Wordfence Security"],
      "vulnerabilities": ["readme.html expuesto", "xmlrpc.php activo"]
    }
  },
  "url": "https://ejemplo.com",
  "modules": ["functional", "ux", "technical", "wordpress"],
  "executedAt": "2026-02-10T05:00:00.000Z"
}
```

## 🔧 DEPLOY EN GITHUB

```bash
cd qa-bot-v2

# Reemplazar archivos en el repo
cp package.json ../Qa_bot_service/
cp server.js ../Qa_bot_service/
cp Dockerfile ../Qa_bot_service/

cd ../Qa_bot_service

git add .
git commit -m "Upgrade to QA Bot V2 - Advanced Analysis"
git push
```

Luego Coolify → Redeploy (tardará 5-7 min por ser build más pesado)

## 📈 TIEMPO DE ANÁLISIS

- Sitio simple: 30-60 segundos
- Sitio complejo: 60-120 segundos
- Sitio con bloqueo anti-bot: Puede fallar o tardar más

## 🎯 PRÓXIMAS MEJORAS POSIBLES

- [ ] Screenshot de la página
- [ ] Análisis de velocidad móvil vs desktop
- [ ] Detección de analytics (GA, GTM, Meta Pixel)
- [ ] Validación de schema.org
- [ ] Análisis de Core Web Vitals completo
- [ ] PDF con reporte visual

## 🐛 TROUBLESHOOTING

**Timeout en sitios lentos:**
- Ya configurado a 90 segundos
- Algunos sitios pueden ser más lentos, considerar aumentar más

**Sitios que bloquean bots (403):**
- El stealth mode ayuda, pero algunos WAF modernos aún detectan
- Considerar proxies rotativos para casos extremos

**Consumo de memoria:**
- Cada análisis usa ~300-500MB RAM
- Servidor con mínimo 2GB RAM recomendado
