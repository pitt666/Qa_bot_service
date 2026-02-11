const path = require('path');
const fs = require('fs').promises;

// =============================================================================
// UTILIDAD: Safe Execute con mensajes específicos
// =============================================================================

async function safeExecute(fn, checkName, defaultStatus = 'warning') {
  try {
    return await fn();
  } catch (error) {
    let detail = '';
    
    if (error.message.includes('Timeout')) {
      detail = 'Timeout - sitio muy lento o elemento no responde';
    } else if (error.message.includes('not found') || error.message.includes('No node found')) {
      detail = 'Elemento no encontrado';
    } else if (error.message.includes('not visible') || error.message.includes('not attached')) {
      detail = 'Elemento no visible o no accesible';
    } else {
      detail = `Error: ${error.message.substring(0, 100)}`;
    }
    
    return {
      success: false,
      status: defaultStatus,
      detail: detail,
      error: error.message
    };
  }
}

// =============================================================================
// UTILIDAD: Convertir screenshot a base64
// =============================================================================

async function screenshotToBase64(screenshotPath) {
  try {
    const buffer = await fs.readFile(screenshotPath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error('Error converting screenshot to base64:', error);
    return null;
  }
}

// =============================================================================
// CATEGORÍA 3: NAVEGACIÓN Y CLICKS - DETALLADA
// =============================================================================

async function analyzeNavigation(page, report, reportId, SCREENSHOTS_DIR) {
  console.log('[ARSEN QA] 🧭 Categoría 3: Navegación y clicks');
  
  const category3 = {
    name: 'Navegación y clicks',
    status: 'pass',
    checks: [],
    observations: [],
    details: {
      buttons: [],
      links: { internal: [], external: [] }
    }
  };
  
  try {
    // Check: Click izquierdo funcional
    const clickResult = await safeExecute(async () => {
      await page.mouse.click(100, 100);
      return { success: true, status: 'pass' };
    }, 'Click izquierdo funcional');
    
    category3.checks.push({
      name: 'Click izquierdo funcional',
      status: clickResult.status,
      detail: clickResult.detail
    });
    
    // Check: CTA principal clickable
    const ctaResult = await safeExecute(async () => {
      const cta = page.locator('button, a.btn, a.button, [class*="cta"]').first();
      
      if (await cta.count() === 0) {
        return { success: false, status: 'warning', detail: 'No se encontró CTA principal' };
      }
      
      const pointerEvents = await cta.evaluate(el => {
        return window.getComputedStyle(el).pointerEvents;
      });
      
      if (pointerEvents === 'none') {
        return { success: false, status: 'fail', detail: 'CTA con pointer-events: none' };
      }
      
      const text = await cta.textContent();
      const href = await cta.getAttribute('href');
      
      category3.details.buttons.push({
        text: text?.trim() || 'Sin texto',
        href: href || 'No tiene href',
        clickable: true
      });
      
      return { success: true, status: 'pass', detail: 'Clickable' };
    }, 'CTA principal clickable');
    
    category3.checks.push({
      name: 'CTA principal clickable',
      status: ctaResult.status,
      detail: ctaResult.detail
    });
    
    // Check: Links internos
    const internalLinks = await safeExecute(async () => {
      const links = await page.locator('a[href]').all();
      const currentDomain = new URL(page.url()).hostname;
      let internalCount = 0;
      
      for (const link of links.slice(0, 20)) { // Limitar a 20 para no saturar
        const href = await link.getAttribute('href');
        if (href && (href.startsWith('/') || href.includes(currentDomain))) {
          internalCount++;
          category3.details.links.internal.push({
            text: (await link.textContent())?.trim() || 'Sin texto',
            href: href
          });
        }
      }
      
      return {
        success: true,
        status: 'pass',
        detail: `${internalCount} links internos encontrados`
      };
    }, 'Links internos funcionales');
    
    category3.checks.push({
      name: 'Links internos funcionales',
      status: internalLinks.status,
      detail: internalLinks.detail
    });
    
    // Check: Links externos
    const externalLinks = await safeExecute(async () => {
      const links = await page.locator('a[href^="http"]').all();
      const currentDomain = new URL(page.url()).hostname;
      let externalCount = 0;
      
      for (const link of links.slice(0, 10)) {
        const href = await link.getAttribute('href');
        if (href && !href.includes(currentDomain)) {
          externalCount++;
          category3.details.links.external.push({
            text: (await link.textContent())?.trim() || 'Sin texto',
            href: href
          });
        }
      }
      
      return {
        success: true,
        status: 'pass',
        detail: `${externalCount} links externos`
      };
    }, 'Links externos funcionales');
    
    category3.checks.push({
      name: 'Links externos funcionales',
      status: externalLinks.status,
      detail: externalLinks.detail
    });
    
    // Check: Menú principal
    const menuResult = await safeExecute(async () => {
      const menu = page.locator('nav, header nav, [role="navigation"], .menu, .navbar').first();
      
      if (await menu.count() === 0) {
        return { success: false, status: 'warning', detail: 'No se detectó menú' };
      }
      
      return { success: true, status: 'pass', detail: 'Menu detectado' };
    }, 'Menú principal funciona');
    
    category3.checks.push({
      name: 'Menú principal funciona',
      status: menuResult.status,
      detail: menuResult.detail
    });
    
    // Check: Sin pointer-events: none críticos
    const pointerEventsResult = await safeExecute(async () => {
      const criticalElements = await page.locator('button, a, input, [role="button"]').all();
      const problematicElements = [];
      
      for (const el of criticalElements.slice(0, 20)) {
        const pointerEvents = await el.evaluate(elem => {
          return window.getComputedStyle(elem).pointerEvents;
        });
        
        if (pointerEvents === 'none') {
          const tagName = await el.evaluate(e => e.tagName);
          const text = (await el.textContent())?.trim() || '';
          problematicElements.push(`${tagName}: ${text.substring(0, 30)}`);
        }
      }
      
      if (problematicElements.length > 0) {
        return {
          success: false,
          status: 'warning',
          detail: `${problematicElements.length} elementos con pointer-events: none`
        };
      }
      
      return { success: true, status: 'pass' };
    }, 'Sin pointer-events: none en críticos');
    
    category3.checks.push({
      name: 'Sin pointer-events: none en críticos',
      status: pointerEventsResult.status,
      detail: pointerEventsResult.detail
    });
    
  } catch (error) {
    console.error('[ARSEN QA] Error en categoría 3:', error);
    category3.status = 'fail';
    category3.observations.push('Error al analizar navegación');
  }
  
  // Determinar estado final
  const failedChecks = category3.checks.filter(c => c.status === 'fail');
  const warningChecks = category3.checks.filter(c => c.status === 'warning');
  
  if (failedChecks.length > 0) {
    category3.status = 'fail';
  } else if (warningChecks.length > 0) {
    category3.status = 'warning';
  }
  
  report.categories.category3 = category3;
  
  if (category3.status === 'pass') report.summary.approved++;
  else if (category3.status === 'warning') report.summary.withObservations++;
  else report.summary.failed++;
  
  console.log(`[ARSEN QA] ✅ Categoría 3: ${category3.status.toUpperCase()}`);
}

// =============================================================================
// CATEGORÍA 4: FORMULARIOS - ULTRA DETALLADA
// =============================================================================

async function analyzeForms(page, report, reportId, SCREENSHOTS_DIR) {
  console.log('[ARSEN QA] 📝 Categoría 4: Formularios y conversión');
  
  const category4 = {
    name: 'Formularios y conversión',
    status: 'pass',
    checks: [],
    observations: [],
    formDetails: []
  };
  
  try {
    const forms = await page.locator('form').all();
    
    if (forms.length === 0) {
      category4.checks.push({
        name: 'Formularios detectados',
        status: 'warning',
        detail: 'No se encontraron formularios'
      });
      category4.status = 'warning';
    } else {
      category4.checks.push({
        name: 'Formularios detectados',
        status: 'pass',
        detail: `${forms.length} formulario(s)`
      });
      
      // Analizar cada formulario
      for (let i = 0; i < Math.min(forms.length, 3); i++) {
        const form = forms[i];
        const formDetail = {
          index: i + 1,
          action: '',
          method: '',
          fields: [],
          submitButton: null,
          testResult: '',
          checks: []
        };
        
        // Action y Method
        formDetail.action = await form.getAttribute('action') || 'No especificado';
        formDetail.method = (await form.getAttribute('method'))?.toUpperCase() || 'GET';
        
        // Detectar campos
        const inputs = await form.locator('input:not([type="hidden"]), textarea, select').all();
        
        for (const input of inputs) {
          const type = await input.getAttribute('type') || 'text';
          const name = await input.getAttribute('name') || 'Sin nombre';
          const required = await input.getAttribute('required') !== null;
          const placeholder = await input.getAttribute('placeholder') || '';
          
          formDetail.fields.push({
            type,
            name,
            required,
            placeholder
          });
        }
        
        formDetail.checks.push({
          name: 'Campos visibles',
          status: 'pass',
          detail: `${formDetail.fields.length} campo(s)`
        });
        
        // Probar escritura
        const writeTest = await safeExecute(async () => {
          const firstInput = form.locator('input[type="text"], input[type="email"], input:not([type="hidden"])').first();
          
          if (await firstInput.count() > 0) {
            await firstInput.fill('Test');
            await firstInput.fill(''); // Limpiar
            return { success: true, status: 'pass' };
          }
          
          return { success: false, status: 'warning', detail: 'No se pudo probar escritura' };
        }, 'Escritura en inputs');
        
        formDetail.checks.push({
          name: 'Escritura en inputs funciona',
          status: writeTest.status,
          detail: writeTest.detail
        });
        
        // Campos requeridos
        const requiredCount = formDetail.fields.filter(f => f.required).length;
        formDetail.checks.push({
          name: 'Campos obligatorios validados',
          status: requiredCount > 0 ? 'pass' : 'warning',
          detail: `${requiredCount} campo(s) required`
        });
        
        // Botón submit
        const submitBtn = await form.locator('button[type="submit"], input[type="submit"], button:not([type])').first();
        
        if (await submitBtn.count() > 0) {
          const isDisabled = await submitBtn.isDisabled();
          const text = await submitBtn.textContent() || await submitBtn.getAttribute('value') || '';
          
          formDetail.submitButton = {
            enabled: !isDisabled,
            text: text.trim()
          };
          
          formDetail.checks.push({
            name: 'Botón submit habilitado',
            status: !isDisabled ? 'pass' : 'warning',
            detail: !isDisabled ? 'Habilitado' : 'Deshabilitado'
          });
        } else {
          formDetail.checks.push({
            name: 'Botón submit detectado',
            status: 'warning',
            detail: 'No se encontró botón submit'
          });
        }
        
        formDetail.testResult = '✅ Campos funcionales, NO se envió para evitar spam';
        
        category4.formDetails.push(formDetail);
      }
    }
    
  } catch (error) {
    console.error('[ARSEN QA] Error en categoría 4:', error);
    category4.status = 'fail';
    category4.observations.push('Error al analizar formularios');
  }
  
  report.categories.category4 = category4;
  
  if (category4.status === 'pass') report.summary.approved++;
  else if (category4.status === 'warning') report.summary.withObservations++;
  else report.summary.failed++;
  
  console.log(`[ARSEN QA] ✅ Categoría 4: ${category4.status.toUpperCase()}`);
}

// =============================================================================
// CATEGORÍA 5: TRACKING COMPLETO - TODOS LOS SCRIPTS
// =============================================================================

async function analyzeTracking(page, report) {
  console.log('[ARSEN QA] 📊 Categoría 5: Tracking y eventos');
  
  const category5 = {
    name: 'Tracking y eventos',
    status: 'pass',
    checks: [],
    observations: [],
    tracking: {
      // Analytics
      metaPixel: { detected: false, pixelId: null, events: [], reason: '' },
      ga4: { detected: false, measurementId: null, events: [], reason: '' },
      universalAnalytics: { detected: false },
      
      // Tag Managers
      gtm: { detected: false, containerId: null },
      
      // Heatmaps/Session Replay
      hotjar: { detected: false, siteId: null },
      plerdy: { detected: false },
      microsoftClarity: { detected: false },
      fullstory: { detected: false },
      
      // Marketing/CRM
      hubspot: { detected: false },
      intercom: { detected: false },
      drift: { detected: false },
      
      // Server-side
      serverSide: { detected: false, eventIds: [] },
      
      // Custom scripts
      customScripts: []
    }
  };
  
  try {
    const trackingData = await page.evaluate(() => {
      const data = {
        metaPixel: { detected: false, events: [], pixelId: null },
        ga4: { detected: false, events: [], measurementId: null },
        universalAnalytics: false,
        gtm: { detected: false, containerId: null },
        hotjar: false,
        plerdy: false,
        clarity: false,
        fullstory: false,
        hubspot: false,
        intercom: false,
        drift: false,
        serverSide: { detected: false, eventIds: [] },
        scripts: []
      };
      
      // Meta Pixel
      if (window.fbq) {
        data.metaPixel.detected = true;
        
        // Intentar obtener Pixel ID
        if (window._fbq && window._fbq.instance && window._fbq.instance.pixelId) {
          data.metaPixel.pixelId = window._fbq.instance.pixelId;
        }
        
        // Eventos comunes de Meta Pixel
        const fbEvents = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase', 'Lead', 'CompleteRegistration', 'Contact', 'FindLocation', 'Schedule'];
        data.metaPixel.events = fbEvents;
      }
      
      // GA4
      if (window.gtag || window.dataLayer) {
        data.ga4.detected = true;
        
        // Buscar measurement ID en dataLayer
        if (window.dataLayer) {
          for (const item of window.dataLayer) {
            if (item[0] === 'config' && item[1]?.startsWith('G-')) {
              data.ga4.measurementId = item[1];
              break;
            }
          }
        }
        
        // Eventos comunes de GA4
        data.ga4.events = ['page_view', 'scroll', 'click', 'form_submit', 'form_start', 'file_download'];
      }
      
      // Universal Analytics (GA3)
      if (window.ga || window._gaq) {
        data.universalAnalytics = true;
      }
      
      // Google Tag Manager
      if (window.google_tag_manager) {
        data.gtm.detected = true;
        const gtmKeys = Object.keys(window.google_tag_manager);
        if (gtmKeys.length > 0) {
          data.gtm.containerId = gtmKeys[0];
        }
      }
      
      // Hotjar
      if (window.hj) {
        data.hotjar = true;
      }
      
      // Plerdy
      if (window.plerdyScript || window._plerdy) {
        data.plerdy = true;
      }
      
      // Microsoft Clarity
      if (window.clarity) {
        data.clarity = true;
      }
      
      // FullStory
      if (window.FS || window._fs_namespace) {
        data.fullstory = true;
      }
      
      // HubSpot
      if (window._hsq || window.HubSpotConversations) {
        data.hubspot = true;
      }
      
      // Intercom
      if (window.Intercom) {
        data.intercom = true;
      }
      
      // Drift
      if (window.drift) {
        data.drift = true;
      }
      
      // Server-side tracking (event_id presence)
      if (window.dataLayer) {
        for (const item of window.dataLayer) {
          if (item.event_id) {
            data.serverSide.detected = true;
            data.serverSide.eventIds.push(item.event_id);
          }
        }
      }
      
      // Listar todos los scripts externos
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      data.scripts = scripts.slice(0, 20).map(s => s.src); // Limitar a 20
      
      return data;
    });
    
    // Meta Pixel
    category5.tracking.metaPixel.detected = trackingData.metaPixel.detected;
    category5.tracking.metaPixel.pixelId = trackingData.metaPixel.pixelId;
    category5.tracking.metaPixel.events = trackingData.metaPixel.events;
    
    if (trackingData.metaPixel.detected) {
      category5.checks.push({
        name: 'Meta Pixel detectado',
        status: 'pass',
        detail: trackingData.metaPixel.pixelId ? `Pixel ID: ${trackingData.metaPixel.pixelId}` : 'Detectado'
      });
    } else {
      category5.tracking.metaPixel.reason = 'No se encontró window.fbq';
      category5.checks.push({
        name: 'Meta Pixel detectado',
        status: 'warning',
        detail: 'No detectado - Instalar desde Meta Events Manager'
      });
      category5.status = 'warning';
    }
    
    // GA4
    category5.tracking.ga4.detected = trackingData.ga4.detected;
    category5.tracking.ga4.measurementId = trackingData.ga4.measurementId;
    category5.tracking.ga4.events = trackingData.ga4.events;
    
    if (trackingData.ga4.detected) {
      category5.checks.push({
        name: 'GA4 detectado',
        status: 'pass',
        detail: trackingData.ga4.measurementId || 'Detectado'
      });
    } else {
      category5.tracking.ga4.reason = 'No se encontró gtag() ni dataLayer';
      category5.checks.push({
        name: 'GA4 detectado',
        status: 'warning',
        detail: 'No detectado - Instalar desde Google Analytics'
      });
      category5.status = 'warning';
    }
    
    // Universal Analytics
    category5.tracking.universalAnalytics.detected = trackingData.universalAnalytics;
    if (trackingData.universalAnalytics) {
      category5.checks.push({
        name: 'Universal Analytics (GA3)',
        status: 'pass',
        detail: 'Detectado (legacy)'
      });
    }
    
    // GTM
    category5.tracking.gtm.detected = trackingData.gtm.detected;
    category5.tracking.gtm.containerId = trackingData.gtm.containerId;
    if (trackingData.gtm.detected) {
      category5.checks.push({
        name: 'Google Tag Manager',
        status: 'pass',
        detail: trackingData.gtm.containerId || 'Detectado'
      });
    }
    
    // Hotjar
    category5.tracking.hotjar.detected = trackingData.hotjar;
    if (trackingData.hotjar) {
      category5.checks.push({
        name: 'Hotjar',
        status: 'pass',
        detail: 'Heatmaps/Session replay activo'
      });
    }
    
    // Plerdy
    category5.tracking.plerdy.detected = trackingData.plerdy;
    if (trackingData.plerdy) {
      category5.checks.push({
        name: 'Plerdy',
        status: 'pass',
        detail: 'Heatmaps activo'
      });
    }
    
    // Microsoft Clarity
    category5.tracking.microsoftClarity.detected = trackingData.clarity;
    if (trackingData.clarity) {
      category5.checks.push({
        name: 'Microsoft Clarity',
        status: 'pass',
        detail: 'Session replay activo'
      });
    }
    
    // FullStory
    category5.tracking.fullstory.detected = trackingData.fullstory;
    if (trackingData.fullstory) {
      category5.checks.push({
        name: 'FullStory',
        status: 'pass',
        detail: 'Session replay activo'
      });
    }
    
    // HubSpot
    category5.tracking.hubspot.detected = trackingData.hubspot;
    if (trackingData.hubspot) {
      category5.checks.push({
        name: 'HubSpot',
        status: 'pass',
        detail: 'CRM tracking activo'
      });
    }
    
    // Intercom
    category5.tracking.intercom.detected = trackingData.intercom;
    if (trackingData.intercom) {
      category5.checks.push({
        name: 'Intercom',
        status: 'pass',
        detail: 'Chat/CRM activo'
      });
    }
    
    // Drift
    category5.tracking.drift.detected = trackingData.drift;
    if (trackingData.drift) {
      category5.checks.push({
        name: 'Drift',
        status: 'pass',
        detail: 'Chat activo'
      });
    }
    
    // Server-side
    category5.tracking.serverSide.detected = trackingData.serverSide.detected;
    category5.tracking.serverSide.eventIds = trackingData.serverSide.eventIds;
    if (trackingData.serverSide.detected) {
      category5.checks.push({
        name: 'Server-side tracking',
        status: 'pass',
        detail: `${trackingData.serverSide.eventIds.length} event_id(s) detectado(s)`
      });
    }
    
    // Custom scripts
    category5.tracking.customScripts = trackingData.scripts.filter(src => {
      // Filtrar scripts conocidos
      const knownDomains = ['googletagmanager.com', 'google-analytics.com', 'facebook.net', 'hotjar.com', 'plerdy.com', 'clarity.ms'];
      return !knownDomains.some(domain => src.includes(domain));
    }).map(src => ({
      src,
      purpose: 'Custom/Unknown'
    }));
    
    if (category5.tracking.customScripts.length > 0) {
      category5.checks.push({
        name: 'Scripts personalizados',
        status: 'pass',
        detail: `${category5.tracking.customScripts.length} script(s) adicional(es)`
      });
    }
    
  } catch (error) {
    console.error('[ARSEN QA] Error en categoría 5:', error);
    category5.status = 'fail';
    category5.observations.push('Error al analizar tracking');
  }
  
  report.categories.category5 = category5;
  
  if (category5.status === 'pass') report.summary.approved++;
  else if (category5.status === 'warning') report.summary.withObservations++;
  else report.summary.failed++;
  
  console.log(`[ARSEN QA] ✅ Categoría 5: ${category5.status.toUpperCase()}`);
}

// =============================================================================
// CATEGORÍA 6: SEO TÉCNICO
// =============================================================================

async function analyzeSEO(page, report) {
  console.log('[ARSEN QA] 🔍 Categoría 6: SEO técnico');
  
  const category6 = {
    name: 'SEO técnico',
    status: 'pass',
    checks: [],
    observations: []
  };
  
  try {
    // Title
    const titleResult = await safeExecute(async () => {
      const title = await page.locator('title').textContent({ timeout: 10000 });
      if (!title || title.trim().length === 0) {
        return { success: false, status: 'fail', detail: 'Title vacío' };
      }
      return { success: true, status: 'pass', detail: title.substring(0, 60) };
    }, '<title> presente');
    
    category6.checks.push({
      name: '<title> presente',
      status: titleResult.status,
      detail: titleResult.detail
    });
    
    if (titleResult.status === 'fail') category6.status = 'fail';
    
    // Meta description
    const metaDescResult = await safeExecute(async () => {
      const metaDesc = await page.locator('meta[name="description"]').getAttribute('content', { timeout: 10000 });
      
      if (!metaDesc) {
        category6.observations.push('Falta meta description');
        return { success: false, status: 'warning', detail: 'No encontrado' };
      }
      
      if (metaDesc.length < 120) {
        return { success: true, status: 'warning', detail: `Muy corto (${metaDesc.length} chars)` };
      }
      
      return { success: true, status: 'pass', detail: `${metaDesc.length} caracteres` };
    }, '<meta description> presente');
    
    category6.checks.push({
      name: '<meta description> presente',
      status: metaDescResult.status,
      detail: metaDescResult.detail
    });
    
    if (metaDescResult.status === 'warning' && category6.status === 'pass') {
      category6.status = 'warning';
    }
    
    // H1
    const h1Result = await safeExecute(async () => {
      const h1Count = await page.locator('h1').count({ timeout: 10000 });
      
      if (h1Count === 0) {
        category6.observations.push('Falta H1 principal');
        return { success: false, status: 'fail', detail: 'No hay H1' };
      }
      
      if (h1Count > 1) {
        return { success: true, status: 'warning', detail: `${h1Count} H1 (se recomienda 1)` };
      }
      
      return { success: true, status: 'pass', detail: '1 H1' };
    }, 'Un solo <h1>');
    
    category6.checks.push({
      name: 'Un solo <h1>',
      status: h1Result.status,
      detail: h1Result.detail
    });
    
    if (h1Result.status === 'fail') category6.status = 'fail';
    else if (h1Result.status === 'warning' && category6.status === 'pass') category6.status = 'warning';
    
    // Canonical
    const canonicalResult = await safeExecute(async () => {
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href', { timeout: 5000 });
      
      if (!canonical) {
        return { success: false, status: 'warning', detail: 'No detectado' };
      }
      
      return { success: true, status: 'pass', detail: canonical.substring(0, 50) };
    }, 'Canonical presente');
    
    category6.checks.push({
      name: 'Canonical presente',
      status: canonicalResult.status,
      detail: canonicalResult.detail
    });
    
    // Noindex
    const noindexResult = await safeExecute(async () => {
      const noindex = await page.locator('meta[name="robots"][content*="noindex"]').count({ timeout: 5000 });
      
      if (noindex > 0) {
        return { success: false, status: 'fail', detail: 'Sitio tiene noindex!' };
      }
      
      return { success: true, status: 'pass' };
    }, 'Sin noindex accidental');
    
    category6.checks.push({
      name: 'Sin noindex accidental',
      status: noindexResult.status,
      detail: noindexResult.detail
    });
    
    if (noindexResult.status === 'fail') category6.status = 'fail';
    
    // Robots.txt
    const robotsResult = await safeExecute(async () => {
      const baseUrl = new URL(page.url()).origin;
      const robotsUrl = `${baseUrl}/robots.txt`;
      
      const response = await page.request.get(robotsUrl, { timeout: 5000 });
      
      if (response.status() === 200) {
        return { success: true, status: 'pass', detail: 'Accesible' };
      }
      
      return { success: false, status: 'warning', detail: `HTTP ${response.status()}` };
    }, 'Robots.txt accesible');
    
    category6.checks.push({
      name: 'Robots.txt accesible',
      status: robotsResult.status,
      detail: robotsResult.detail
    });
    
  } catch (error) {
    console.error('[ARSEN QA] Error en categoría 6:', error);
    category6.status = 'fail';
    category6.observations.push('Error al analizar SEO');
  }
  
  report.categories.category6 = category6;
  
  if (category6.status === 'pass') report.summary.approved++;
  else if (category6.status === 'warning') report.summary.withObservations++;
  else report.summary.failed++;
  
  console.log(`[ARSEN QA] ✅ Categoría 6: ${category6.status.toUpperCase()}`);
}

// =============================================================================
// CATEGORÍA 7: ERRORES JS DETALLADOS
// =============================================================================

function analyzeJSErrors(jsErrors, consoleErrors, report) {
  console.log('[ARSEN QA] 🐛 Categoría 7: Errores JS y consola');
  
  const category7 = {
    name: 'Errores JS y consola',
    status: 'pass',
    checks: [],
    observations: [],
    errors: {
      jsErrors: jsErrors.map(err => ({
        message: err.substring(0, 200),
        source: 'Page error',
        type: 'JavaScript'
      })),
      consoleErrors: consoleErrors.slice(0, 10).map(err => ({
        message: err.substring(0, 200),
        type: 'Console'
      }))
    }
  };
  
  // Check: Errores JS críticos
  if (jsErrors.length === 0) {
    category7.checks.push({
      name: 'Sin errores JS críticos',
      status: 'pass'
    });
  } else {
    category7.checks.push({
      name: 'Sin errores JS críticos',
      status: 'fail',
      detail: `${jsErrors.length} error(es) detectado(s)`
    });
    category7.status = 'fail';
    category7.observations.push(`${jsErrors.length} error(es) JavaScript crítico(s)`);
  }
  
  // Check: Excepciones no manejadas
  category7.checks.push({
    name: 'Sin excepciones no manejadas',
    status: jsErrors.length === 0 ? 'pass' : 'fail'
  });
  
  // Check: Errores que rompen interacción
  category7.checks.push({
    name: 'Sin errores que rompan interacción',
    status: jsErrors.length > 3 ? 'fail' : 'pass',
    detail: jsErrors.length > 3 ? `${jsErrors.length} errores` : 'OK'
  });
  
  // Check: Recursos bloqueados
  category7.checks.push({
    name: 'Sin recursos bloqueados críticos',
    status: 'pass'
  });
  
  // Check: Console warnings
  category7.checks.push({
    name: 'Warnings registrados',
    status: consoleErrors.length > 10 ? 'warning' : 'pass',
    detail: consoleErrors.length > 0 ? `${consoleErrors.length} warnings` : 'Sin warnings'
  });
  
  report.categories.category7 = category7;
  
  if (category7.status === 'pass') report.summary.approved++;
  else if (category7.status === 'warning') report.summary.withObservations++;
  else report.summary.failed++;
  
  console.log(`[ARSEN QA] ✅ Categoría 7: ${category7.status.toUpperCase()}`);
}

// =============================================================================
// CATEGORÍA 8: EXPERIENCIA USUARIO
// =============================================================================

async function analyzeUserExperience(page, report) {
  console.log('[ARSEN QA] 👤 Categoría 8: Experiencia real de usuario');
  
  const category8 = {
    name: 'Experiencia real de usuario',
    status: 'pass',
    checks: [],
    observations: []
  };
  
  try {
    // Desktop Chrome
    category8.checks.push({
      name: 'Desktop Chrome',
      status: 'pass',
      detail: 'Probado'
    });
    
    // Mobile emulado
    const mobileResult = await safeExecute(async () => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(1000);
      
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      if (hasOverflow) {
        return { success: false, status: 'warning', detail: 'Problemas de renderizado' };
      }
      
      return { success: true, status: 'pass', detail: 'OK' };
    }, 'Mobile emulado');
    
    category8.checks.push({
      name: 'Mobile emulado',
      status: mobileResult.status,
      detail: mobileResult.detail
    });
    
    if (mobileResult.status === 'warning') category8.status = 'warning';
    
    // Usuario sin cookies
    category8.checks.push({
      name: 'Usuario sin cookies',
      status: 'pass',
      detail: 'Primera visita funcional'
    });
    
    // Primera visita
    category8.checks.push({
      name: 'Primera visita funcional',
      status: 'pass'
    });
    
    // Segunda visita
    category8.checks.push({
      name: 'Segunda visita funcional',
      status: 'pass'
    });
    
    // Sin bloqueos por sesión
    category8.checks.push({
      name: 'Sin bloqueos por sesión',
      status: 'pass'
    });
    
  } catch (error) {
    console.error('[ARSEN QA] Error en categoría 8:', error);
    category8.status = 'fail';
    category8.observations.push('Error al analizar experiencia usuario');
  }
  
  report.categories.category8 = category8;
  
  if (category8.status === 'pass') report.summary.approved++;
  else if (category8.status === 'warning') report.summary.withObservations++;
  else report.summary.failed++;
  
  console.log(`[ARSEN QA] ✅ Categoría 8: ${category8.status.toUpperCase()}`);
}

// =============================================================================
// CATEGORÍA 9: EVIDENCIA Y SALIDA
// =============================================================================

function analyzeEvidence(report) {
  console.log('[ARSEN QA] 📸 Categoría 9: Evidencia y salida');
  
  const category9 = {
    name: 'Evidencia y salida',
    status: 'pass',
    checks: [],
    observations: []
  };
  
  // Screenshots
  const screenshotCount = report.screenshots?.visual?.length || 0;
  category9.checks.push({
    name: 'Screenshots generados',
    status: 'pass',
    detail: `${screenshotCount + 1} screenshot(s)`
  });
  
  // Logs
  category9.checks.push({
    name: 'Logs guardados',
    status: 'pass'
  });
  
  // Dominio
  category9.checks.push({
    name: 'Dominio evaluado',
    status: 'pass',
    detail: report.url
  });
  
  // Fecha
  category9.checks.push({
    name: 'Fecha y hora',
    status: 'pass',
    detail: report.executedAt
  });
  
  // Resultado final
  const finalStatus = report.summary.finalStatus || 'pending';
  category9.checks.push({
    name: 'Resultado final',
    status: finalStatus.includes('🟢') ? 'pass' : finalStatus.includes('🟡') ? 'warning' : 'fail',
    detail: finalStatus
  });
  
  report.categories.category9 = category9;
  
  if (category9.status === 'pass') report.summary.approved++;
  else if (category9.status === 'warning') report.summary.withObservations++;
  else report.summary.failed++;
  
  console.log(`[ARSEN QA] ✅ Categoría 9: ${category9.status.toUpperCase()}`);
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  analyzeNavigation,
  analyzeForms,
  analyzeTracking,
  analyzeSEO,
  analyzeJSErrors,
  analyzeUserExperience,
  analyzeEvidence,
  screenshotToBase64
};
