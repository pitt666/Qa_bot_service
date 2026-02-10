const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'qa-bot-v2', timestamp: new Date().toISOString() });
});

// =============================================================================
// UTILIDADES DE ANÁLISIS
// =============================================================================

/**
 * Calcula el contraste entre dos colores (ratio WCAG)
 */
function getContrastRatio(rgb1, rgb2) {
  const getLuminance = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };
  
  const l1 = getLuminance(rgb1);
  const l2 = getLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Valida si un email es válido
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =============================================================================
// ENDPOINT PRINCIPAL DE QA
// =============================================================================

app.post('/qa/execute', async (req, res) => {
  const { url, modules = [] } = req.body;
  
  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'URL es requerida' 
    });
  }
  
  const results = {
    success: true,
    critical: [],
    warnings: [],
    recommendations: [],
    details: {},
    url: url,
    modules: modules,
    executedAt: new Date().toISOString()
  };
  
  let browser;
  
  try {
    console.log(`[QA] 🔍 Iniciando análisis de: ${url}`);
    
    // Lanzar navegador con configuración anti-detección
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu'
      ]
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'es-MX',
      timezoneId: 'America/Mexico_City',
      permissions: ['geolocation'],
      extraHTTPHeaders: {
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8'
      }
    });
    
    const page = await context.newPage();
    
    // Ocultar webdriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    // Capturar datos de performance
    const performanceMetrics = {
      loadTime: 0,
      fcp: 0,
      lcp: 0,
      requests: 0,
      failedRequests: 0,
      jsErrors: [],
      consoleErrors: []
    };
    
    // Monitorear requests
    page.on('request', request => {
      performanceMetrics.requests++;
    });
    
    page.on('requestfailed', request => {
      performanceMetrics.failedRequests++;
    });
    
    // Capturar errores de consola
    page.on('console', msg => {
      if (msg.type() === 'error') {
        performanceMetrics.consoleErrors.push(msg.text());
      }
    });
    
    page.on('pageerror', error => {
      performanceMetrics.jsErrors.push(error.message);
    });
    
    // Navegar con timeout extendido
    const startTime = Date.now();
    console.log(`[QA] 📡 Navegando a ${url}...`);
    
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 90000
    });
    
    performanceMetrics.loadTime = Date.now() - startTime;
    
    if (!response) {
      results.critical.push('El sitio no responde');
      throw new Error('No response from site');
    }
    
    const status = response.status();
    console.log(`[QA] ✅ Respuesta HTTP: ${status}`);
    
    if (status === 403) {
      results.critical.push('El sitio bloqueó el acceso (HTTP 403) - posible protección anti-bot');
    } else if (status >= 400) {
      results.critical.push(`El sitio responde con error HTTP ${status}`);
    }
    
    // Obtener métricas de performance reales
    const metrics = await page.evaluate(() => {
      const perfEntries = performance.getEntriesByType('navigation')[0];
      const paintEntries = performance.getEntriesByType('paint');
      
      return {
        fcp: paintEntries.find(e => e.name === 'first-contentful-paint')?.startTime || 0,
        domContentLoaded: perfEntries?.domContentLoadedEventEnd - perfEntries?.domContentLoadedEventStart || 0,
        loadComplete: perfEntries?.loadEventEnd - perfEntries?.loadEventStart || 0
      };
    });
    
    performanceMetrics.fcp = metrics.fcp;
    results.details.performance = performanceMetrics;
    
    // =========================================================================
    // MÓDULO: QA FUNCIONAL PROFUNDO
    // =========================================================================
    
    if (modules.includes('functional')) {
      console.log('[QA] 🔧 Ejecutando módulo FUNCIONAL...');
      const functionalResults = {
        forms: [],
        buttons: [],
        links: []
      };
      
      // ANÁLISIS DE FORMULARIOS
      const forms = await page.locator('form').all();
      console.log(`[QA] 📝 Encontrados ${forms.length} formularios`);
      
      for (let i = 0; i < forms.length; i++) {
        const form = forms[i];
        const formData = {
          index: i + 1,
          action: await form.getAttribute('action') || 'Sin action',
          method: await form.getAttribute('method') || 'GET',
          fields: [],
          hasSubmit: false,
          hasValidation: false,
          issues: []
        };
        
        // Analizar campos
        const inputs = await form.locator('input, textarea, select').all();
        for (const input of inputs) {
          const type = await input.getAttribute('type') || 'text';
          const name = await input.getAttribute('name') || '';
          const required = await input.getAttribute('required') !== null;
          const placeholder = await input.getAttribute('placeholder') || '';
          
          formData.fields.push({ type, name, required, placeholder });
          
          if (required) formData.hasValidation = true;
        }
        
        // Verificar botón submit
        const submitBtn = await form.locator('button[type="submit"], input[type="submit"]').count();
        formData.hasSubmit = submitBtn > 0;
        
        // Identificar problemas
        if (!formData.hasSubmit) {
          formData.issues.push('Sin botón de envío');
        }
        
        if (formData.fields.length > 0 && !formData.hasValidation) {
          formData.issues.push('Sin validación (campos sin required)');
        }
        
        // Buscar campos de email sin validación
        const emailFields = formData.fields.filter(f => 
          f.type === 'email' || f.name.toLowerCase().includes('email') || f.name.toLowerCase().includes('correo')
        );
        
        if (emailFields.length > 0 && emailFields.some(f => !f.required)) {
          formData.issues.push('Campo de email sin validación requerida');
        }
        
        functionalResults.forms.push(formData);
      }
      
      // Reportar problemas de formularios
      if (forms.length > 0) {
        const formsWithIssues = functionalResults.forms.filter(f => f.issues.length > 0);
        if (formsWithIssues.length > 0) {
          results.warnings.push(`${formsWithIssues.length} formulario(s) con problemas detectados`);
        }
      }
      
      // ANÁLISIS DE BOTONES Y CTAs
      const buttons = await page.locator('button, a.btn, a.button, [role="button"], input[type="submit"]').all();
      console.log(`[QA] 🔘 Encontrados ${buttons.length} botones/CTAs`);
      
      for (let i = 0; i < Math.min(buttons.length, 20); i++) {
        const btn = buttons[i];
        const tagName = await btn.evaluate(el => el.tagName.toLowerCase());
        const text = (await btn.innerText()).trim().substring(0, 50);
        const href = await btn.getAttribute('href');
        
        const btnData = {
          text: text || 'Sin texto',
          tag: tagName,
          hasAction: false,
          actionValid: true
        };
        
        // Verificar si el botón tiene acción válida
        if (tagName === 'a' && href) {
          btnData.hasAction = true;
          
          // Verificar si el link es válido (solo internos)
          if (href.startsWith('/') && !href.startsWith('//')) {
            try {
              const linkUrl = new URL(href, url).toString();
              const linkResponse = await page.request.get(linkUrl);
              btnData.actionValid = linkResponse.status() < 400;
              
              if (!btnData.actionValid) {
                results.warnings.push(`Botón "${text}" apunta a link roto: ${href}`);
              }
            } catch (e) {
              btnData.actionValid = false;
              results.warnings.push(`Botón "${text}" tiene link inválido: ${href}`);
            }
          }
        } else if (tagName === 'button' || tagName === 'input') {
          const onClick = await btn.getAttribute('onclick');
          const type = await btn.getAttribute('type');
          btnData.hasAction = !!onClick || type === 'submit';
        }
        
        if (!btnData.hasAction && tagName === 'button') {
          results.warnings.push(`Botón "${text}" sin acción definida`);
        }
        
        functionalResults.buttons.push(btnData);
      }
      
      if (buttons.length === 0) {
        results.warnings.push('No se detectaron botones o CTAs en la página');
      }
      
      // ANÁLISIS DE LINKS (muestra de 30)
      const links = await page.locator('a[href]').all();
      let brokenLinks = 0;
      let externalLinks = 0;
      let internalLinks = 0;
      
      console.log(`[QA] 🔗 Analizando ${Math.min(links.length, 30)} links...`);
      
      for (let i = 0; i < Math.min(links.length, 30); i++) {
        const href = await links[i].getAttribute('href');
        
        if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          continue;
        }
        
        if (href.startsWith('http')) {
          externalLinks++;
        } else if (href.startsWith('/')) {
          internalLinks++;
          
          try {
            const linkUrl = new URL(href, url).toString();
            const linkResponse = await page.request.get(linkUrl);
            if (linkResponse.status() >= 400) {
              brokenLinks++;
            }
          } catch (e) {
            brokenLinks++;
          }
        }
      }
      
      functionalResults.links = { total: links.length, internal: internalLinks, external: externalLinks, broken: brokenLinks };
      
      if (brokenLinks > 0) {
        results.critical.push(`${brokenLinks} link(s) interno(s) roto(s) detectado(s)`);
      }
      
      results.details.functional = functionalResults;
    }
    
    // =========================================================================
    // MÓDULO: UX PROFUNDO
    // =========================================================================
    
    if (modules.includes('ux')) {
      console.log('[QA] 🎨 Ejecutando módulo UX...');
      const uxResults = {
        headings: {},
        contrast: { issues: 0, checked: 0 },
        readability: {},
        spacing: {}
      };
      
      // ANÁLISIS DE JERARQUÍA DE HEADINGS
      const h1Count = await page.locator('h1').count();
      const h2Count = await page.locator('h2').count();
      const h3Count = await page.locator('h3').count();
      
      uxResults.headings = { h1: h1Count, h2: h2Count, h3: h3Count };
      
      if (h1Count === 0) {
        results.critical.push('No se encontró ningún H1 en la página');
      } else if (h1Count > 1) {
        results.warnings.push(`Se encontraron ${h1Count} H1 (recomendado: solo 1 para SEO)`);
      }
      
      if (h2Count === 0 && h3Count > 0) {
        results.warnings.push('Jerarquía incorrecta: hay H3 pero no H2');
      }
      
      // ANÁLISIS DE CONTRASTE (WCAG)
      const textElements = await page.locator('p, span, a, button, h1, h2, h3, h4, h5, h6').all();
      let lowContrastCount = 0;
      
      console.log(`[QA] 🎨 Analizando contraste de ${Math.min(textElements.length, 50)} elementos...`);
      
      for (let i = 0; i < Math.min(textElements.length, 50); i++) {
        try {
          const styles = await textElements[i].evaluate(el => {
            const computed = window.getComputedStyle(el);
            return {
              color: computed.color,
              backgroundColor: computed.backgroundColor,
              fontSize: computed.fontSize
            };
          });
          
          if (styles.color && styles.backgroundColor && styles.color !== styles.backgroundColor) {
            const ratio = getContrastRatio(styles.color, styles.backgroundColor);
            const fontSize = parseFloat(styles.fontSize);
            
            // WCAG AA requiere 4.5:1 para texto normal, 3:1 para texto grande (>18px o bold >14px)
            const requiredRatio = fontSize >= 18 ? 3 : 4.5;
            
            if (ratio < requiredRatio) {
              lowContrastCount++;
            }
            
            uxResults.contrast.checked++;
          }
        } catch (e) {
          // Elemento no accesible, continuar
        }
      }
      
      uxResults.contrast.issues = lowContrastCount;
      
      if (lowContrastCount > 5) {
        results.warnings.push(`${lowContrastCount} elementos con contraste insuficiente (WCAG)`);
        results.recommendations.push('Mejorar contraste de colores para accesibilidad');
      }
      
      // ANÁLISIS DE LEGIBILIDAD
      const bodyText = await page.locator('p, li, span').all();
      let smallTextCount = 0;
      let avgFontSize = 0;
      let totalFontSize = 0;
      let fontSizeCount = 0;
      
      for (let i = 0; i < Math.min(bodyText.length, 100); i++) {
        try {
          const fontSize = await bodyText[i].evaluate(el => {
            return parseFloat(window.getComputedStyle(el).fontSize);
          });
          
          totalFontSize += fontSize;
          fontSizeCount++;
          
          if (fontSize < 14) {
            smallTextCount++;
          }
        } catch (e) {
          // Continuar
        }
      }
      
      avgFontSize = fontSizeCount > 0 ? Math.round(totalFontSize / fontSizeCount) : 16;
      uxResults.readability = { avgFontSize, smallTextCount };
      
      if (smallTextCount > 10) {
        results.warnings.push(`${smallTextCount} elementos con texto muy pequeño (<14px)`);
      }
      
      if (avgFontSize < 15) {
        results.recommendations.push(`Tamaño promedio de fuente: ${avgFontSize}px - considerar aumentar a 16px`);
      }
      
      results.details.ux = uxResults;
    }
    
    // =========================================================================
    // MÓDULO: TÉCNICO PROFUNDO
    // =========================================================================
    
    if (modules.includes('technical')) {
      console.log('[QA] ⚙️ Ejecutando módulo TÉCNICO...');
      const technicalResults = {
        performance: {},
        seo: {},
        images: {},
        errors: []
      };
      
      // PERFORMANCE
      technicalResults.performance = {
        loadTime: `${(performanceMetrics.loadTime / 1000).toFixed(2)}s`,
        fcp: `${(performanceMetrics.fcp / 1000).toFixed(2)}s`,
        requests: performanceMetrics.requests,
        failedRequests: performanceMetrics.failedRequests
      };
      
      if (performanceMetrics.loadTime > 5000) {
        results.warnings.push(`Tiempo de carga lento: ${(performanceMetrics.loadTime / 1000).toFixed(2)}s`);
        results.recommendations.push('Optimizar performance: minificar CSS/JS, comprimir imágenes');
      }
      
      if (performanceMetrics.fcp > 2500) {
        results.warnings.push(`First Contentful Paint lento: ${(performanceMetrics.fcp / 1000).toFixed(2)}s`);
      }
      
      // ERRORES DE JAVASCRIPT
      if (performanceMetrics.consoleErrors.length > 0 || performanceMetrics.jsErrors.length > 0) {
        const totalErrors = performanceMetrics.consoleErrors.length + performanceMetrics.jsErrors.length;
        results.critical.push(`${totalErrors} error(es) de JavaScript detectado(s)`);
        results.recommendations.push('Revisar errores de JavaScript en DevTools');
        
        technicalResults.errors = [
          ...performanceMetrics.jsErrors.slice(0, 3),
          ...performanceMetrics.consoleErrors.slice(0, 3)
        ];
      }
      
      // SEO BÁSICO
      const metaDescription = await page.locator('meta[name="description"]').count();
      const metaViewport = await page.locator('meta[name="viewport"]').count();
      const title = await page.title();
      const canonical = await page.locator('link[rel="canonical"]').count();
      
      technicalResults.seo = {
        title: title || 'Sin título',
        titleLength: title?.length || 0,
        hasMetaDescription: metaDescription > 0,
        hasViewport: metaViewport > 0,
        hasCanonical: canonical > 0
      };
      
      if (!metaDescription) {
        results.warnings.push('Falta meta description para SEO');
      }
      
      if (!metaViewport) {
        results.critical.push('Falta meta viewport - sitio no optimizado para móvil');
      }
      
      if (title.length > 60) {
        results.recommendations.push(`Título muy largo (${title.length} caracteres) - recomendado <60`);
      }
      
      // ANÁLISIS DE IMÁGENES
      const images = await page.locator('img').all();
      let imagesWithoutAlt = 0;
      let heavyImages = 0;
      const imageSizes = [];
      
      console.log(`[QA] 🖼️ Analizando ${Math.min(images.length, 30)} imágenes...`);
      
      for (let i = 0; i < Math.min(images.length, 30); i++) {
        const img = images[i];
        const alt = await img.getAttribute('alt');
        const src = await img.getAttribute('src');
        
        if (!alt || alt.trim() === '') {
          imagesWithoutAlt++;
        }
        
        if (src) {
          try {
            const fullUrl = new URL(src, url).toString();
            const imgResponse = await page.request.get(fullUrl);
            const body = await imgResponse.body();
            const sizeKB = body.length / 1024;
            
            imageSizes.push(sizeKB);
            
            if (sizeKB > 500) {
              heavyImages++;
            }
          } catch (e) {
            // Imagen no accesible
          }
        }
      }
      
      const avgImageSize = imageSizes.length > 0 ? 
        Math.round(imageSizes.reduce((a, b) => a + b, 0) / imageSizes.length) : 0;
      
      technicalResults.images = {
        total: images.length,
        withoutAlt: imagesWithoutAlt,
        heavy: heavyImages,
        avgSize: `${avgImageSize}KB`
      };
      
      if (imagesWithoutAlt > 0) {
        results.warnings.push(`${imagesWithoutAlt} imagen(es) sin atributo ALT (accesibilidad)`);
      }
      
      if (heavyImages > 0) {
        results.warnings.push(`${heavyImages} imagen(es) pesada(s) (>500KB)`);
        results.recommendations.push('Optimizar imágenes con TinyPNG, usar WebP/AVIF');
      }
      
      // LAZY LOADING
      const imagesWithLazy = await page.locator('img[loading="lazy"]').count();
      if (images.length > 5 && imagesWithLazy === 0) {
        results.recommendations.push('Implementar lazy loading en imágenes para mejor performance');
      }
      
      results.details.technical = technicalResults;
    }
    
    // =========================================================================
    // MÓDULO: WORDPRESS
    // =========================================================================
    
    if (modules.includes('wordpress')) {
      console.log('[QA] 🔌 Ejecutando módulo WORDPRESS...');
      const wpResults = {
        isWordPress: false,
        version: null,
        theme: null,
        plugins: [],
        vulnerabilities: []
      };
      
      const pageContent = await page.content();
      const isWordPress = pageContent.includes('wp-content') || pageContent.includes('wp-includes');
      wpResults.isWordPress = isWordPress;
      
      if (isWordPress) {
        // Detectar versión
        const wpVersion = await page.evaluate(() => {
          const generator = document.querySelector('meta[name="generator"]');
          if (generator && generator.content.includes('WordPress')) {
            return generator.content.replace('WordPress ', '');
          }
          return null;
        });
        
        wpResults.version = wpVersion;
        
        if (wpVersion) {
          const versionNum = parseFloat(wpVersion);
          if (versionNum < 6.7) {
            results.warnings.push(`WordPress ${wpVersion} - versión desactualizada`);
            results.recommendations.push('Actualizar WordPress a la última versión (6.7+)');
            wpResults.vulnerabilities.push('Versión desactualizada');
          }
        }
        
        // Detectar tema
        const themeMatch = pageContent.match(/wp-content\/themes\/([^\/\?"]+)/);
        if (themeMatch) {
          wpResults.theme = themeMatch[1];
        }
        
        // Detectar plugins comunes
        const commonPlugins = {
          'contact-form-7': 'Contact Form 7',
          'woocommerce': 'WooCommerce',
          'elementor': 'Elementor',
          'yoast': 'Yoast SEO',
          'wp-rocket': 'WP Rocket',
          'wordfence': 'Wordfence Security',
          'jetpack': 'Jetpack',
          'akismet': 'Akismet'
        };
        
        for (const [slug, name] of Object.entries(commonPlugins)) {
          if (pageContent.includes(slug)) {
            wpResults.plugins.push(name);
          }
        }
        
        if (wpResults.plugins.length > 0) {
          results.recommendations.push(`Plugins detectados: ${wpResults.plugins.join(', ')} - verificar actualizaciones`);
        }
        
        // SEGURIDAD
        try {
          const wpConfigCheck = await page.request.get(new URL('/wp-config.php', url).toString());
          if (wpConfigCheck.status() === 200) {
            results.critical.push('🚨 CRÍTICO: wp-config.php accesible públicamente');
            wpResults.vulnerabilities.push('wp-config.php expuesto');
          }
        } catch (e) {
          // OK
        }
        
        try {
          const readmeCheck = await page.request.get(new URL('/readme.html', url).toString());
          if (readmeCheck.status() === 200) {
            results.warnings.push('readme.html accesible - riesgo de seguridad menor');
            wpResults.vulnerabilities.push('readme.html expuesto');
          }
        } catch (e) {
          // OK
        }
        
        try {
          const xmlrpcCheck = await page.request.get(new URL('/xmlrpc.php', url).toString());
          if (xmlrpcCheck.status() === 200) {
            results.warnings.push('xmlrpc.php activo - posible vector de ataque DDoS');
            wpResults.vulnerabilities.push('xmlrpc.php activo');
          }
        } catch (e) {
          // OK
        }
        
      } else {
        results.warnings.push('No se detectó WordPress');
      }
      
      results.details.wordpress = wpResults;
    }
    
    // =========================================================================
    // CERRAR NAVEGADOR Y DETERMINAR ESTADO
    // =========================================================================
    
    await browser.close();
    console.log('[QA] ✅ Navegador cerrado');
    
    // Determinar estado general
    if (results.critical.length === 0 && results.warnings.length === 0) {
      results.status = 'ok';
      results.message = '✅ Sitio aprobado sin errores';
    } else if (results.critical.length > 0) {
      results.status = 'critical';
      results.message = '❌ Sitio NO APTO - errores críticos';
    } else {
      results.status = 'warning';
      results.message = '⚠️ Sitio con advertencias';
    }
    
    console.log(`[QA] 🏁 Análisis completado: ${results.status}`);
    console.log(`[QA] 📊 Críticos: ${results.critical.length} | Advertencias: ${results.warnings.length} | Recomendaciones: ${results.recommendations.length}`);
    
    res.json(results);
    
  } catch (error) {
    console.error('[QA] ❌ Error:', error.message);
    
    if (browser) {
      await browser.close();
    }
    
    res.status(500).json({
      success: false,
      critical: [`Error al ejecutar QA: ${error.message}`],
      warnings: [],
      recommendations: [],
      details: {},
      status: 'error',
      url: url,
      executedAt: new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🔍 QA Bot Service V2 - AVANZADO      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`🔍 QA: POST http://localhost:${PORT}/qa/execute`);
  console.log('');
  console.log('Módulos disponibles:');
  console.log('  • Funcional: Formularios, botones, links');
  console.log('  • UX: Contraste WCAG, legibilidad, jerarquía');
  console.log('  • Técnico: Performance, SEO, imágenes');
  console.log('  • WordPress: Versión, plugins, seguridad');
  console.log('');
});
