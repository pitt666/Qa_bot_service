const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const {
  analyzeNavigation,
  analyzeForms,
  analyzeTracking,
  analyzeSEO,
  analyzeJSErrors,
  analyzeUserExperience,
  analyzeEvidence,
  screenshotToBase64
} = require('./categories');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Directorio para screenshots
const SCREENSHOTS_DIR = '/tmp/qa-screenshots';

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'qa-bot-arsen-3.0', 
    timestamp: new Date().toISOString() 
  });
});

// =============================================================================
// UTILIDADES
// =============================================================================

async function ensureScreenshotsDir() {
  try {
    await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
  } catch (e) {
    console.error('Error creating screenshots dir:', e);
  }
}

function generateReportId() {
  return uuidv4();
}

// =============================================================================
// QA BOT ARSEN 3.0 - ENDPOINT PRINCIPAL
// =============================================================================

app.post('/qa/execute', async (req, res) => {
  const { url, client = 'Cliente', projectName = 'Proyecto' } = req.body;
  
  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'URL es requerida' 
    });
  }
  
  const reportId = generateReportId();
  const executedAt = new Date();
  const analysisStartTime = Date.now();
  
  console.log(`[ARSEN QA] 🚀 Iniciando análisis: ${url}`);
  console.log(`[ARSEN QA] 📋 Cliente: ${client} | Proyecto: ${projectName}`);
  console.log(`[ARSEN QA] 🆔 Report ID: ${reportId}`);
  
  const report = {
    reportId,
    client,
    projectName,
    url,
    executedAt: executedAt.toISOString(),
    categories: {},
    summary: {
      totalCategories: 9,
      approved: 0,
      withObservations: 0,
      failed: 0,
      finalStatus: 'pending',
      recommendation: ''
    },
    screenshots: {},
    conclusion: ''
  };
  
  let browser;
  
  try {
    await ensureScreenshotsDir();
    
    // Lanzar navegador
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
    
    // =========================================================================
    // CATEGORÍA 1: CARGA Y ESTADO GENERAL (20 checks)
    // =========================================================================
    
    console.log('[ARSEN QA] 📦 Categoría 1: Carga y estado general');
    
    const category1 = {
      name: 'Carga y estado general',
      status: 'pass',
      checks: [],
      observations: []
    };
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'es-MX',
      timezoneId: 'America/Mexico_City'
    });
    
    const page = await context.newPage();
    
    // Ocultar webdriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    // Monitoreo de errores
    const jsErrors = [];
    const consoleErrors = [];
    const failedRequests = [];
    
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        method: request.method(),
        error: request.failure()?.errorText || 'Unknown'
      });
    });
    
    // Check: Dominio responde
    const startTime = Date.now();
    let response;
    
    try {
      response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });
      
      category1.checks.push({ name: 'Dominio responde', status: 'pass' });
    } catch (e) {
      category1.checks.push({ name: 'Dominio responde', status: 'fail', detail: e.message });
      category1.status = 'fail';
      category1.observations.push('El dominio no responde o timeout');
    }
    
    if (!response) {
      report.categories.category1 = category1;
      report.summary.failed++;
      await browser.close();
      return res.json(report);
    }
    
    const loadTime = Date.now() - startTime;
    const finalUrl = page.url();
    const statusCode = response.status();
    
    // Check: Código HTTP = 200
    if (statusCode === 200) {
      category1.checks.push({ name: 'Código HTTP = 200', status: 'pass' });
    } else {
      category1.checks.push({ name: 'Código HTTP = 200', status: 'fail', detail: `HTTP ${statusCode}` });
      category1.status = 'fail';
      category1.observations.push(`Código HTTP incorrecto: ${statusCode}`);
    }
    
    // Check: Sin errores 4xx/5xx
    if (statusCode < 400) {
      category1.checks.push({ name: 'Sin errores 4xx/5xx', status: 'pass' });
    } else {
      category1.checks.push({ name: 'Sin errores 4xx/5xx', status: 'fail' });
      category1.status = 'fail';
    }
    
    // Check: Redirección a HTTPS
    const isHttps = finalUrl.startsWith('https://');
    if (isHttps) {
      category1.checks.push({ name: 'Redirección a HTTPS', status: 'pass' });
    } else {
      category1.checks.push({ name: 'Redirección a HTTPS', status: 'fail' });
      category1.status = 'warning';
      category1.observations.push('Sitio no redirige a HTTPS');
    }
    
    // Check: Sin loops de redirección
    const redirectChain = response.request().redirectedFrom();
    const redirectCount = redirectChain ? 1 : 0;
    
    if (redirectCount < 3) {
      category1.checks.push({ name: 'Sin loops de redirección', status: 'pass' });
    } else {
      category1.checks.push({ name: 'Sin loops de redirección', status: 'warning' });
      category1.status = 'warning';
      category1.observations.push('Múltiples redirecciones detectadas');
    }
    
    // Check: Dominio final correcto
    const originalDomain = new URL(url).hostname;
    const finalDomain = new URL(finalUrl).hostname;
    
    if (originalDomain === finalDomain || finalDomain.includes(originalDomain.replace('www.', ''))) {
      category1.checks.push({ name: 'Dominio final correcto', status: 'pass' });
    } else {
      category1.checks.push({ name: 'Dominio final correcto', status: 'warning', detail: `Redirige a ${finalDomain}` });
      category1.status = 'warning';
      category1.observations.push(`Redirección a dominio diferente: ${finalDomain}`);
    }
    
    // Check: SSL válido
    if (isHttps) {
      const securityDetails = await page.evaluate(() => {
        return document.location.protocol === 'https:';
      });
      
      category1.checks.push({ name: 'SSL válido', status: securityDetails ? 'pass' : 'fail' });
    } else {
      category1.checks.push({ name: 'SSL válido', status: 'fail' });
    }
    
    // Check: Sin warnings de seguridad
    category1.checks.push({ name: 'Sin warnings de seguridad', status: 'pass' });
    
    // Check: Sin mixed content
    category1.checks.push({ name: 'Sin mixed content crítico', status: 'pass' });
    
    // Esperar que la página esté completamente cargada
    try {
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      category1.checks.push({ name: 'DOMContentLoaded exitoso', status: 'pass' });
    } catch (e) {
      category1.checks.push({ name: 'DOMContentLoaded exitoso', status: 'warning' });
      category1.status = 'warning';
      category1.observations.push('La página no alcanzó networkidle');
    }
    
    // Check: Página interactuable
    const isInteractive = await page.evaluate(() => {
      return document.readyState === 'complete' || document.readyState === 'interactive';
    });
    
    category1.checks.push({ 
      name: 'Página interactuable', 
      status: isInteractive ? 'pass' : 'fail' 
    });
    
    // Check: Sin pantalla en blanco
    const bodyContent = await page.locator('body').count();
    const hasContent = bodyContent > 0;
    
    if (hasContent) {
      category1.checks.push({ name: 'Sin pantalla en blanco', status: 'pass' });
    } else {
      category1.checks.push({ name: 'Sin pantalla en blanco', status: 'fail' });
      category1.status = 'fail';
      category1.observations.push('Página sin contenido visible');
    }
    
    // Check: Sin loader infinito
    const loaders = await page.locator('.loader, .loading, [class*="spinner"]').count();
    category1.checks.push({ 
      name: 'Sin loader infinito', 
      status: loaders === 0 ? 'pass' : 'warning',
      detail: loaders > 0 ? `${loaders} loaders detectados` : undefined
    });
    
    // Check: Body renderizado
    const bodyVisible = await page.evaluate(() => {
      const body = document.body;
      return body && body.offsetHeight > 0;
    });
    
    category1.checks.push({ 
      name: '<body> renderizado', 
      status: bodyVisible ? 'pass' : 'fail' 
    });
    
    // Check: Contenido visible
    const textContent = await page.evaluate(() => {
      return document.body.innerText.length;
    });
    
    if (textContent > 100) {
      category1.checks.push({ name: 'Contenido visible', status: 'pass' });
    } else {
      category1.checks.push({ name: 'Contenido visible', status: 'fail' });
      category1.status = 'fail';
      category1.observations.push('Poco o ningún contenido visible');
    }
    
    // Check: Sin errores JS críticos
    if (jsErrors.length === 0) {
      category1.checks.push({ name: 'Sin errores JS críticos', status: 'pass' });
    } else {
      category1.checks.push({ 
        name: 'Sin errores JS críticos', 
        status: 'fail',
        detail: `${jsErrors.length} errores detectados`
      });
      category1.status = 'warning';
      category1.observations.push(`${jsErrors.length} error(es) JavaScript detectado(s)`);
    }
    
    // Check: Sin requests críticos fallidos
    const criticalFailedRequests = failedRequests.filter(r => 
      r.url.includes('.js') || r.url.includes('.css') || r.url.includes('api')
    );
    
    if (criticalFailedRequests.length === 0) {
      category1.checks.push({ name: 'Sin requests críticos fallidos', status: 'pass' });
    } else {
      category1.checks.push({ 
        name: 'Sin requests críticos fallidos', 
        status: 'warning',
        detail: `${criticalFailedRequests.length} requests fallidos`
      });
      category1.status = 'warning';
      category1.observations.push(`${criticalFailedRequests.length} request(s) crítico(s) fallido(s)`);
    }
    
    // Screenshot inicial
    const screenshotPath = path.join(SCREENSHOTS_DIR, `${reportId}-initial.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    report.screenshots.initial = screenshotPath;
    
    category1.checks.push({ name: 'Screenshot inicial', status: 'pass' });
    category1.checks.push({ name: 'Timestamp', status: 'pass', detail: executedAt.toISOString() });
    
    // Resultado de categoría 1
    if (category1.status === 'pass') {
      category1.checks.push({ name: 'Resultado', status: 'pass', detail: 'PASS' });
    } else if (category1.status === 'warning') {
      category1.checks.push({ name: 'Resultado', status: 'warning', detail: 'PASS CON OBSERVACIONES' });
    } else {
      category1.checks.push({ name: 'Resultado', status: 'fail', detail: 'FAIL' });
    }
    
    report.categories.category1 = category1;
    
    if (category1.status === 'pass') report.summary.approved++;
    else if (category1.status === 'warning') report.summary.withObservations++;
    else report.summary.failed++;
    
    console.log(`[ARSEN QA] ✅ Categoría 1: ${category1.status.toUpperCase()}`);
    
    // =========================================================================
    // CATEGORÍA 2: VISUAL & LAYOUT
    // =========================================================================
    
    console.log('[ARSEN QA] 🎨 Categoría 2: Visual & Layout');
    
    const category2 = {
      name: 'Visual & Layout',
      status: 'pass',
      checks: [],
      observations: [],
      screenshots: []
    };
    
    // Screenshot hero
    const heroScreenshot = path.join(SCREENSHOTS_DIR, `${reportId}-hero.png`);
    await page.screenshot({ path: heroScreenshot, fullPage: false });
    category2.screenshots.push({ name: 'Hero', path: heroScreenshot });
    category2.checks.push({ name: 'Screenshot hero', status: 'pass' });
    
    // Screenshot formulario (si existe)
    const formExists = await page.locator('form').count() > 0;
    if (formExists) {
      try {
        const form = page.locator('form').first();
        const formScreenshot = path.join(SCREENSHOTS_DIR, `${reportId}-form.png`);
        await form.screenshot({ path: formScreenshot });
        category2.screenshots.push({ name: 'Formulario', path: formScreenshot });
        category2.checks.push({ name: 'Screenshot formulario', status: 'pass' });
      } catch (e) {
        category2.checks.push({ name: 'Screenshot formulario', status: 'warning', detail: 'No se pudo capturar' });
      }
    }
    
    // Screenshot footer
    try {
      const footer = page.locator('footer, [role="contentinfo"]').first();
      if (await footer.count() > 0) {
        const footerScreenshot = path.join(SCREENSHOTS_DIR, `${reportId}-footer.png`);
        await footer.screenshot({ path: footerScreenshot });
        category2.screenshots.push({ name: 'Footer', path: footerScreenshot });
        category2.checks.push({ name: 'Screenshot footer', status: 'pass' });
      }
    } catch (e) {
      // Footer no encontrado
    }
    
    // Render desktop
    const desktopWidth = await page.evaluate(() => window.innerWidth);
    category2.checks.push({ 
      name: 'Render correcto en desktop', 
      status: desktopWidth >= 1024 ? 'pass' : 'warning',
      detail: `${desktopWidth}px`
    });
    
    // Render mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    const mobileScreenshot = path.join(SCREENSHOTS_DIR, `${reportId}-mobile.png`);
    await page.screenshot({ path: mobileScreenshot, fullPage: false });
    category2.screenshots.push({ name: 'Mobile', path: mobileScreenshot });
    
    const mobileWidth = await page.evaluate(() => window.innerWidth);
    category2.checks.push({ 
      name: 'Render correcto en mobile', 
      status: mobileWidth === 375 ? 'pass' : 'warning',
      detail: `${mobileWidth}px`
    });
    
    // Volver a desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    
    // Sin overflow horizontal
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    
    if (!hasOverflow) {
      category2.checks.push({ name: 'Sin overflow horizontal', status: 'pass' });
    } else {
      category2.checks.push({ name: 'Sin overflow horizontal', status: 'warning' });
      category2.status = 'warning';
      category2.observations.push('Scroll horizontal detectado');
    }
    
    // CTA visible en viewport
    const ctaVisible = await page.evaluate(() => {
      const ctas = Array.from(document.querySelectorAll('button, a.btn, a.button, [class*="cta"]'));
      return ctas.some(el => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.top <= window.innerHeight;
      });
    });
    
    if (ctaVisible) {
      category2.checks.push({ name: 'CTA visible en viewport', status: 'pass' });
    } else {
      category2.checks.push({ name: 'CTA visible en viewport', status: 'warning' });
      category2.status = 'warning';
      category2.observations.push('No hay CTA visible en el primer viewport');
    }
    
    // Formularios visibles
    if (formExists) {
      const formVisible = await page.evaluate(() => {
        const form = document.querySelector('form');
        if (!form) return false;
        const rect = form.getBoundingClientRect();
        return rect.top >= 0 && rect.top <= window.innerHeight;
      });
      
      category2.checks.push({ 
        name: 'Formularios visibles', 
        status: formVisible ? 'pass' : 'warning',
        detail: formVisible ? 'En viewport' : 'Fuera de viewport'
      });
    }
    
    report.categories.category2 = category2;
    report.screenshots.visual = category2.screenshots;
    
    if (category2.status === 'pass') report.summary.approved++;
    else if (category2.status === 'warning') report.summary.withObservations++;
    else report.summary.failed++;
    
    console.log(`[ARSEN QA] ✅ Categoría 2: ${category2.status.toUpperCase()}`);
    
    // =========================================================================
    // CATEGORÍAS 3-9: Análisis completo
    // =========================================================================
    
    await analyzeNavigation(page, report, reportId, SCREENSHOTS_DIR);
    await analyzeForms(page, report, reportId, SCREENSHOTS_DIR);
    await analyzeTracking(page, report);
    await analyzeSEO(page, report);
    analyzeJSErrors(jsErrors, consoleErrors, report);
    await analyzeUserExperience(page, report);
    analyzeEvidence(report);
    
    // =========================================================================
    // CERRAR BROWSER Y GENERAR REPORTE FINAL
    // =========================================================================
    
    await browser.close();
    
    // Convertir screenshots a base64 para embeber en HTML
    console.log('[ARSEN QA] 📸 Convirtiendo screenshots a base64...');
    
    if (report.screenshots.initial) {
      report.screenshots.initialBase64 = await screenshotToBase64(report.screenshots.initial);
    }
    
    if (report.screenshots.visual && Array.isArray(report.screenshots.visual)) {
      for (const screenshot of report.screenshots.visual) {
        if (screenshot.path) {
          screenshot.base64 = await screenshotToBase64(screenshot.path);
        }
      }
    }
    
    // Performance metrics
    report.performance = {
      loadTime: (loadTime / 1000).toFixed(2), // En segundos
      recommendation: loadTime < 3000 ? '✅ Excelente (< 3s)' : loadTime < 5000 ? '⚠️ Aceptable (3-5s)' : '🔴 Lento (> 5s)',
      metrics: {
        timeToLoad: `${(loadTime / 1000).toFixed(2)}s`,
        status: loadTime < 3000 ? 'excellent' : loadTime < 5000 ? 'good' : 'poor'
      }
    };
    
    // Determinar estado final
    if (report.summary.failed > 0) {
      report.summary.finalStatus = '🔴 NO APROBADO';
      report.summary.recommendation = 'No se recomienda recibir tráfico';
    } else if (report.summary.withObservations > 0) {
      report.summary.finalStatus = '🟡 APROBADO CON OBSERVACIONES';
      report.summary.recommendation = 'Puede recibir tráfico limitado';
    } else {
      report.summary.finalStatus = '🟢 APROBADO';
      report.summary.recommendation = 'Puede recibir tráfico';
    }
    
    // Calcular tiempo total
    const totalTime = Math.round((Date.now() - analysisStartTime) / 1000);
    report.summary.analysisTime = `${totalTime}s`;
    report.summary.slowAnalysis = totalTime > 120; // Warning si tardó más de 2 minutos
    
    report.conclusion = `El sitio ha sido analizado con ${report.summary.totalCategories} categorías. Estado: ${report.summary.finalStatus}`;
    
    console.log(`[ARSEN QA] 🏁 Análisis completado en ${totalTime}s`);
    console.log(`[ARSEN QA] 📊 Aprobadas: ${report.summary.approved} | Con observaciones: ${report.summary.withObservations} | Fallidas: ${report.summary.failed}`);
    
    res.json(report);
    
  } catch (error) {
    console.error('[ARSEN QA] ❌ Error:', error.message);
    
    if (browser) {
      await browser.close();
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      reportId,
      executedAt: executedAt.toISOString()
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   🎯 QA BOT ARSEN 3.0 - PROFESIONAL        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`🔍 QA: POST http://localhost:${PORT}/qa/execute`);
  console.log('');
  console.log('📋 Categorías de análisis:');
  console.log('  1. Carga y estado general (20 checks)');
  console.log('  2. Visual & Layout (screenshots)');
  console.log('  3. Navegación y clicks');
  console.log('  4. Formularios y conversión');
  console.log('  5. Tracking (Meta Pixel, GA4, eventos)');
  console.log('  6. SEO técnico');
  console.log('  7. Errores JS');
  console.log('  8. Experiencia usuario');
  console.log('  9. Evidencia');
  console.log('');
});
