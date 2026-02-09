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
  res.json({ status: 'ok', service: 'qa-bot', timestamp: new Date().toISOString() });
});

// QA Bot endpoint
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
    url: url,
    modules: modules,
    executedAt: new Date().toISOString()
  };
  
  let browser;
  
  try {
    // Lanzar navegador
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // Capturar errores de consola
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Navegar al sitio
    console.log(`[QA] Analizando: ${url}`);
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    if (!response || response.status() !== 200) {
      results.critical.push(`El sitio no responde correctamente (HTTP ${response?.status() || 'timeout'})`);
    }
    
    // ===================================
    // MÓDULO: QA FUNCIONAL
    // ===================================
    
    if (modules.includes('functional')) {
      console.log('[QA] Ejecutando módulo funcional...');
      
      // Detectar formularios
      const forms = await page.locator('form').count();
      
      if (forms > 0) {
        const requiredFields = await page.locator('input[required], textarea[required], select[required]').count();
        
        if (requiredFields === 0) {
          results.warnings.push(`${forms} formulario(s) sin validación de campos requeridos`);
        }
        
        const submitButtons = await page.locator('button[type="submit"], input[type="submit"]').count();
        
        if (submitButtons === 0) {
          results.critical.push('Formularios sin botón de envío');
        }
      }
      
      // Links rotos (muestra de 20)
      const links = await page.locator('a[href]').all();
      let brokenLinks = 0;
      
      for (let i = 0; i < Math.min(links.length, 20); i++) {
        const href = await links[i].getAttribute('href');
        if (href && href.startsWith('/') && !href.startsWith('//')) {
          try {
            const linkResponse = await page.request.get(new URL(href, url).toString());
            if (linkResponse.status() >= 400) {
              brokenLinks++;
            }
          } catch (e) {
            brokenLinks++;
          }
        }
      }
      
      if (brokenLinks > 0) {
        results.critical.push(`${brokenLinks} links internos rotos detectados`);
      }
    }
    
    // ===================================
    // MÓDULO: UX MÍNIMA
    // ===================================
    
    if (modules.includes('ux')) {
      console.log('[QA] Ejecutando módulo UX...');
      
      const h1Count = await page.locator('h1').count();
      
      if (h1Count === 0) {
        results.critical.push('No se encontró ningún H1 en la página');
      } else if (h1Count > 1) {
        results.warnings.push(`Se encontraron ${h1Count} H1 (recomendado: solo 1)`);
      }
      
      const buttons = await page.locator('button, a.btn, a.button, input[type="submit"]').count();
      
      if (buttons === 0) {
        results.warnings.push('No se detectaron botones o CTAs');
      }
      
      // Revisar tamaño de texto
      const textElements = await page.locator('p, span, div').all();
      let smallTextCount = 0;
      
      for (let i = 0; i < Math.min(textElements.length, 50); i++) {
        const fontSize = await textElements[i].evaluate(el => {
          return window.getComputedStyle(el).fontSize;
        });
        
        if (parseInt(fontSize) < 14) {
          smallTextCount++;
        }
      }
      
      if (smallTextCount > 10) {
        results.warnings.push(`${smallTextCount} elementos con texto muy pequeño (<14px)`);
      }
    }
    
    // ===================================
    // MÓDULO: TÉCNICO
    // ===================================
    
    if (modules.includes('technical')) {
      console.log('[QA] Ejecutando módulo técnico...');
      
      // Errores de consola
      if (consoleErrors.length > 0) {
        results.critical.push(`${consoleErrors.length} error(es) de JavaScript en consola`);
        results.recommendations.push('Revisar errores de JavaScript en DevTools');
      }
      
      // Análisis de imágenes
      const images = await page.locator('img[src]').all();
      let heavyImages = 0;
      const imageSizes = [];
      
      for (let i = 0; i < Math.min(images.length, 20); i++) {
        const src = await images[i].getAttribute('src');
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
      
      if (heavyImages > 0) {
        results.warnings.push(`${heavyImages} imagen(es) muy pesada(s) detectada(s) (>500kb)`);
        results.recommendations.push('Optimizar imágenes con TinyPNG o ImageOptim');
      }
      
      const avgImageSize = imageSizes.length > 0 ? 
        (imageSizes.reduce((a, b) => a + b, 0) / imageSizes.length).toFixed(0) : 0;
      
      if (avgImageSize > 300) {
        results.recommendations.push(`Tamaño promedio de imágenes: ${avgImageSize}KB - considera WebP/AVIF`);
      }
      
      // Lazy loading
      const imagesWithLazy = await page.locator('img[loading="lazy"]').count();
      const totalImages = await page.locator('img').count();
      
      if (totalImages > 5 && imagesWithLazy === 0) {
        results.recommendations.push('Agregar lazy loading a las imágenes');
      }
      
      // Meta tags
      const metaDescription = await page.locator('meta[name="description"]').count();
      if (metaDescription === 0) {
        results.warnings.push('Falta meta description para SEO');
      }
      
      const metaViewport = await page.locator('meta[name="viewport"]').count();
      if (metaViewport === 0) {
        results.critical.push('Falta meta viewport - no optimizado para móvil');
      }
    }
    
    // ===================================
    // MÓDULO: WORDPRESS
    // ===================================
    
    if (modules.includes('wordpress')) {
      console.log('[QA] Ejecutando módulo WordPress...');
      
      const pageContent = await page.content();
      const isWordPress = pageContent.includes('wp-content') || pageContent.includes('wp-includes');
      
      if (isWordPress) {
        // Detectar versión
        const wpVersion = await page.evaluate(() => {
          const generator = document.querySelector('meta[name="generator"]');
          if (generator && generator.content.includes('WordPress')) {
            return generator.content.replace('WordPress ', '');
          }
          return null;
        });
        
        if (wpVersion) {
          const versionNum = parseFloat(wpVersion);
          if (versionNum < 6.7) {
            results.warnings.push(`WordPress ${wpVersion} - versión desactualizada`);
            results.recommendations.push('Actualizar WordPress a la última versión');
          }
        }
        
        // Detectar plugins comunes
        const plugins = [];
        if (pageContent.includes('contact-form-7')) plugins.push('Contact Form 7');
        if (pageContent.includes('woocommerce')) plugins.push('WooCommerce');
        if (pageContent.includes('elementor')) plugins.push('Elementor');
        if (pageContent.includes('yoast')) plugins.push('Yoast SEO');
        
        if (plugins.length > 0) {
          results.recommendations.push(`Plugins detectados: ${plugins.join(', ')} - verificar actualizaciones`);
        }
        
        // Seguridad
        try {
          const wpConfigCheck = await page.request.get(new URL('/wp-config.php', url).toString());
          if (wpConfigCheck.status() === 200) {
            results.critical.push('CRÍTICO: wp-config.php accesible públicamente');
          }
        } catch (e) {
          // Bien
        }
        
        try {
          const readmeCheck = await page.request.get(new URL('/readme.html', url).toString());
          if (readmeCheck.status() === 200) {
            results.warnings.push('readme.html de WordPress accesible - riesgo menor');
          }
        } catch (e) {
          // OK
        }
      } else {
        results.warnings.push('No se detectó WordPress');
      }
    }
    
    await browser.close();
    
    // Determinar estado
    if (results.critical.length === 0 && results.warnings.length === 0) {
      results.status = 'ok';
      results.message = 'Sitio aprobado sin errores';
    } else if (results.critical.length > 0) {
      results.status = 'critical';
      results.message = 'Sitio NO APTO';
    } else {
      results.status = 'warning';
      results.message = 'Sitio con riesgos';
    }
    
    console.log(`[QA] Análisis completado: ${results.status}`);
    res.json(results);
    
  } catch (error) {
    console.error('[QA] Error:', error);
    
    if (browser) {
      await browser.close();
    }
    
    res.status(500).json({
      success: false,
      critical: [`Error al ejecutar QA: ${error.message}`],
      warnings: [],
      recommendations: [],
      status: 'error',
      url: url,
      executedAt: new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ QA Bot Service running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`🔍 QA endpoint: POST http://localhost:${PORT}/qa/execute`);
});
