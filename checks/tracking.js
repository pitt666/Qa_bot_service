/**
 * SECCION 9 — TRACKING
 * Meta Pixel + eventos + CAPI signal
 * GA4 + eventos, Google Ads, GTM
 * TikTok Pixel, LinkedIn Insight Tag
 * Microsoft Clarity / Hotjar, scripts desconocidos
 */

async function checkTracking({ page }) {
  const checks = [];

  const trackingData = await page.evaluate(() => {
    const resultado = {};

    // ─── META PIXEL ───
    const metaPixel = {
      detectado: false,
      pixelId: null,
      eventos: [],
      capiSignal: false
    };

    if (window.fbq || window._fbq) {
      metaPixel.detectado = true;

      // Intentar extraer Pixel ID
      try {
        if (window.fbq?.getState?.()) {
          const state = window.fbq.getState();
          const pixels = state?.pixels || [];
          if (pixels.length > 0) metaPixel.pixelId = pixels[0].id;
        }
      } catch { }

      // Buscar en scripts
      if (!metaPixel.pixelId) {
        const scripts = Array.from(document.querySelectorAll('script:not([src])'));
        for (const s of scripts) {
          const match = s.textContent.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{10,16})['"]?\s*\)/);
          if (match) { metaPixel.pixelId = match[1]; break; }
        }
      }

      // Detectar eventos llamados
      try {
        const scriptTexts = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent).join(' ');
        const eventosMatch = scriptTexts.matchAll(/fbq\s*\(\s*['"]track['"]\s*,\s*['"](\w+)['"]/g);
        for (const m of eventosMatch) {
          if (!metaPixel.eventos.includes(m[1])) metaPixel.eventos.push(m[1]);
        }
      } catch { }

      // CAPI signal: event_id en dataLayer o en fbq calls
      try {
        const scriptTexts = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent).join(' ');
        metaPixel.capiSignal = scriptTexts.includes('event_id') || scriptTexts.includes('eventID');
      } catch { }
    }
    resultado.metaPixel = metaPixel;

    // ─── GA4 ───
    const ga4 = { detectado: false, measurementId: null, eventos: [] };
    if (window.gtag || window.dataLayer) {
      // Buscar G- ID
      const scripts = Array.from(document.querySelectorAll('script[src*="googletagmanager"], script[src*="google-analytics"]'));
      for (const s of scripts) {
        const match = (s.src || '').match(/[?&]id=(G-[A-Z0-9]+)/);
        if (match) { ga4.detectado = true; ga4.measurementId = match[1]; break; }
      }

      if (!ga4.measurementId) {
        const scriptTexts = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent).join(' ');
        const match = scriptTexts.match(/['"]?(G-[A-Z0-9]{6,})/);
        if (match) { ga4.detectado = true; ga4.measurementId = match[1]; }
      }

      // Eventos del dataLayer
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        for (const entry of window.dataLayer) {
          if (entry.event && !['gtm.js', 'gtm.dom', 'gtm.load', 'gtm.click', 'gtm.scroll'].includes(entry.event)) {
            if (!ga4.eventos.includes(entry.event)) ga4.eventos.push(entry.event);
          }
        }
      }
      if (ga4.measurementId) ga4.detectado = true;
    }
    resultado.ga4 = ga4;

    // ─── GTM ───
    const gtm = { detectado: false, containerId: null, tagsEstimados: 0 };
    const gtmScript = document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
    if (gtmScript) {
      const match = (gtmScript.src || '').match(/[?&]id=(GTM-[A-Z0-9]+)/);
      gtm.detectado = true;
      gtm.containerId = match ? match[1] : 'ID no extraible';
      // Estimar tags por scripts cargados desde GTM
      gtm.tagsEstimados = document.querySelectorAll('script[src*="googletagmanager"]').length;
    }

    // Tambien buscar en noscript/iframe
    if (!gtm.detectado) {
      const iframes = Array.from(document.querySelectorAll('iframe[src*="googletagmanager.com/ns.html"]'));
      if (iframes.length > 0) {
        const match = iframes[0].src.match(/[?&]id=(GTM-[A-Z0-9]+)/);
        gtm.detectado = true;
        gtm.containerId = match ? match[1] : 'ID no extraible';
      }
    }
    resultado.gtm = gtm;

    // ─── GOOGLE ADS ───
    const googleAds = { detectado: false, conversionId: null };
    const scriptTextos = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent).join(' ');
    const adsMatch = scriptTextos.match(/['"]?(AW-\d{7,11})/);
    if (adsMatch) {
      googleAds.detectado = true;
      googleAds.conversionId = adsMatch[1];
    }
    if (!googleAds.detectado) {
      const gtagScript = document.querySelector('script[src*="googletagmanager.com/gtag"]');
      if (gtagScript) {
        const match = (gtagScript.src || '').match(/AW-\d+/);
        if (match) { googleAds.detectado = true; googleAds.conversionId = match[0]; }
      }
    }
    resultado.googleAds = googleAds;

    // ─── TIKTOK PIXEL ───
    const tiktok = { detectado: false, pixelId: null };
    if (window.ttq || window.TiktokAnalyticsObject) {
      tiktok.detectado = true;
      const match = scriptTextos.match(/ttq\.load\s*\(\s*['"]([A-Z0-9]{15,})['"]/);
      if (match) tiktok.pixelId = match[1];
    }
    resultado.tiktok = tiktok;

    // ─── LINKEDIN INSIGHT TAG ───
    const linkedin = { detectado: false, partnerId: null };
    if (window._linkedin_data_partner_ids || document.querySelector('script[src*="snap.licdn.com"]')) {
      linkedin.detectado = true;
      if (window._linkedin_data_partner_ids && window._linkedin_data_partner_ids.length > 0) {
        linkedin.partnerId = window._linkedin_data_partner_ids[0];
      }
    }
    resultado.linkedin = linkedin;

    // ─── MICROSOFT CLARITY ───
    const clarity = { detectado: false, projectId: null };
    if (window.clarity || document.querySelector('script[src*="clarity.ms"]')) {
      clarity.detectado = true;
      const match = scriptTextos.match(/clarity\s*\(\s*['"]set['"]\s*|clarity\.ms\/tag\/([a-zA-Z0-9]+)/);
      if (match) clarity.projectId = match[1];
    }
    resultado.clarity = clarity;

    // ─── HOTJAR ───
    const hotjar = { detectado: false, siteId: null };
    if (window.hj || window._hjSettings || document.querySelector('script[src*="hotjar.com"]')) {
      hotjar.detectado = true;
      if (window._hjSettings) hotjar.siteId = window._hjSettings.hjid;
    }
    resultado.hotjar = hotjar;

    // ─── SCRIPTS DE TERCEROS DESCONOCIDOS ───
    const dominiosConocidos = [
      'google', 'facebook', 'fb.com', 'instagram', 'tiktok', 'linkedin', 'hotjar',
      'clarity.ms', 'hubspot', 'intercom', 'drift', 'zendesk', 'crisp', 'tawk',
      'tidio', 'youtube', 'vimeo', 'cloudflare', 'jquery', 'bootstrap', 'wordpress',
      'shopify', 'woocommerce', 'stripe', 'paypal', 'maps.googleapis', 'googleapis',
      'recaptcha', 'sentry', 'newrelic', 'segment', 'mixpanel', 'amplitude',
      'cdn.jsdelivr', 'cdnjs', 'unpkg', 'twilio', 'sendgrid', 'mailchimp'
    ];

    const scriptsTerceros = Array.from(document.querySelectorAll('script[src]'));
    const dominioActual = window.location.hostname.replace('www.', '');
    const scriptosDesconocidos = [];

    for (const s of scriptsTerceros) {
      try {
        const dominio = new URL(s.src).hostname.replace('www.', '');
        if (dominio === dominioActual) continue;
        const esConocido = dominiosConocidos.some(c => dominio.includes(c));
        if (!esConocido) {
          scriptosDesconocidos.push(dominio);
        }
      } catch { }
    }

    resultado.scriptsDesconocidos = [...new Set(scriptosDesconocidos)];

    return resultado;
  });

  // Formatear checks
  const { metaPixel, ga4, gtm, googleAds, tiktok, linkedin, clarity, hotjar, scriptsDesconocidos } = trackingData;

  // Meta Pixel
  if (metaPixel.detectado) {
    checks.push({
      nombre: 'Meta Pixel',
      estado: 'OK',
      detalle: `Activo${metaPixel.pixelId ? ` — ID: ${metaPixel.pixelId}` : ' — ID no detectado'}`,
      items: [
        metaPixel.eventos.length > 0 ? `Eventos: ${metaPixel.eventos.join(', ')}` : 'No se detectaron eventos fbq(track)',
        metaPixel.capiSignal
          ? 'CAPI: event_id detectado — deduplicacion configurada'
          : 'CAPI: sin event_id — posible falta de deduplicacion con Conversions API'
      ]
    });
  } else {
    checks.push({ nombre: 'Meta Pixel', estado: 'ADVERTENCIA', detalle: 'No detectado en esta pagina' });
  }

  // GA4
  if (ga4.detectado) {
    checks.push({
      nombre: 'Google Analytics 4',
      estado: 'OK',
      detalle: `Activo${ga4.measurementId ? ` — ID: ${ga4.measurementId}` : ' — ID no detectado'}`,
      items: ga4.eventos.length > 0 ? [`Eventos dataLayer: ${ga4.eventos.slice(0, 8).join(', ')}`] : ['No se detectaron eventos personalizados en dataLayer']
    });
  } else {
    checks.push({ nombre: 'Google Analytics 4', estado: 'ADVERTENCIA', detalle: 'No detectado en esta pagina' });
  }

  // GTM
  if (gtm.detectado) {
    checks.push({
      nombre: 'Google Tag Manager',
      estado: 'OK',
      detalle: `Activo — Contenedor: ${gtm.containerId}`
    });
  } else {
    checks.push({ nombre: 'Google Tag Manager', estado: 'ADVERTENCIA', detalle: 'No detectado — si usas GTM para manejar todos los tags, verifica que este instalado' });
  }

  // Google Ads
  if (googleAds.detectado) {
    checks.push({
      nombre: 'Google Ads',
      estado: 'OK',
      detalle: `Tag de conversion activo — ID: ${googleAds.conversionId}`
    });
  } else {
    checks.push({ nombre: 'Google Ads', estado: 'ADVERTENCIA', detalle: 'Tag de conversion de Google Ads no detectado' });
  }

  // TikTok
  checks.push({
    nombre: 'TikTok Pixel',
    estado: tiktok.detectado ? 'OK' : 'ADVERTENCIA',
    detalle: tiktok.detectado
      ? `Activo${tiktok.pixelId ? ` — ID: ${tiktok.pixelId}` : ''}`
      : 'No detectado'
  });

  // LinkedIn
  checks.push({
    nombre: 'LinkedIn Insight Tag',
    estado: linkedin.detectado ? 'OK' : 'ADVERTENCIA',
    detalle: linkedin.detectado
      ? `Activo${linkedin.partnerId ? ` — Partner ID: ${linkedin.partnerId}` : ''}`
      : 'No detectado'
  });

  // Clarity / Hotjar (grabacion de sesiones)
  const grabacionSesiones = [];
  if (clarity.detectado) grabacionSesiones.push(`Microsoft Clarity${clarity.projectId ? ` (${clarity.projectId})` : ''}`);
  if (hotjar.detectado) grabacionSesiones.push(`Hotjar${hotjar.siteId ? ` (Site ID: ${hotjar.siteId})` : ''}`);

  checks.push({
    nombre: 'Grabacion de sesiones',
    estado: grabacionSesiones.length > 0 ? 'OK' : 'ADVERTENCIA',
    detalle: grabacionSesiones.length > 0
      ? `Activo: ${grabacionSesiones.join(', ')} — graba sesiones de usuarios`
      : 'Sin herramienta de grabacion de sesiones — Clarity o Hotjar ayudan a ver como navegan los usuarios'
  });

  // Scripts desconocidos
  checks.push({
    nombre: 'Scripts de terceros desconocidos',
    estado: scriptsDesconocidos.length === 0 ? 'OK' : scriptsDesconocidos.length <= 2 ? 'ADVERTENCIA' : 'ERROR',
    detalle: scriptsDesconocidos.length === 0
      ? 'Todos los scripts de terceros son de herramientas conocidas'
      : `${scriptsDesconocidos.length} script(s) de origen desconocido — verificar con el equipo que son y si son necesarios`,
    items: scriptsDesconocidos
  });

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'Tracking',
    estado: estadoGeneral,
    checks
  };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkTracking };
