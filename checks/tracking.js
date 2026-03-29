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
    const googleAds = { detectado: false, conversionId: null, eventos: [] };
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
    // Detectar eventos de conversion de Google Ads: gtag('event', 'conversion', {send_to: 'AW-xxx/yyy'})
    if (googleAds.detectado) {
      try {
        const conversionMatches = scriptTextos.matchAll(/gtag\s*\(\s*['"]event['"]\s*,\s*['"]conversion['"]\s*,\s*\{[^}]*send_to['"]\s*:\s*['"]([^'"]+)['"]/g);
        for (const m of conversionMatches) {
          if (!googleAds.eventos.includes(m[1])) googleAds.eventos.push(m[1]);
        }
        // Tambien buscar eventos personalizados de remarketing
        const remarketingMatch = scriptTextos.matchAll(/gtag\s*\(\s*['"]event['"]\s*,\s*['"](\w+)['"]\s*,\s*\{[^}]*AW-/g);
        for (const m of remarketingMatch) {
          if (!googleAds.eventos.includes(m[1]) && m[1] !== 'conversion') googleAds.eventos.push(`remarketing: ${m[1]}`);
        }
      } catch { }
      // Buscar en dataLayer pushes con AW
      try {
        if (window.dataLayer) {
          for (const entry of window.dataLayer) {
            if (entry.event === 'conversion' || (entry['gtm.elementId'] && String(entry['gtm.elementId']).includes('AW'))) {
              if (!googleAds.eventos.includes('conversion')) googleAds.eventos.push('conversion');
            }
          }
        }
      } catch { }
    }
    resultado.googleAds = googleAds;

    // ─── TIKTOK PIXEL ───
    const tiktok = { detectado: false, pixelId: null, eventos: [] };
    if (window.ttq || window.TiktokAnalyticsObject) {
      tiktok.detectado = true;
      const matchId = scriptTextos.match(/ttq\.load\s*\(\s*['"]([A-Z0-9]{15,})['"]/);
      if (matchId) tiktok.pixelId = matchId[1];
      // Detectar ttq.track('EventName') en scripts
      try {
        const eventosMatch = scriptTextos.matchAll(/ttq\.track\s*\(\s*['"](\w+)['"]/g);
        for (const m of eventosMatch) {
          if (!tiktok.eventos.includes(m[1])) tiktok.eventos.push(m[1]);
        }
        // Tambien detectar via ttq.page() y ttq.identify()
        if (scriptTextos.includes('ttq.page(')) tiktok.eventos.push('PageView (ttq.page)');
      } catch { }
      // Intentar leer queue de eventos del objeto ttq
      try {
        if (window.ttq && Array.isArray(window.ttq._q)) {
          for (const cmd of window.ttq._q) {
            if (cmd[0] === 'track' && cmd[1] && !tiktok.eventos.includes(cmd[1])) {
              tiktok.eventos.push(cmd[1]);
            }
          }
        }
      } catch { }
    }
    resultado.tiktok = tiktok;

    // ─── LINKEDIN INSIGHT TAG ───
    const linkedin = { detectado: false, partnerId: null, eventos: [] };
    if (window._linkedin_data_partner_ids || document.querySelector('script[src*="snap.licdn.com"]')) {
      linkedin.detectado = true;
      if (window._linkedin_data_partner_ids && window._linkedin_data_partner_ids.length > 0) {
        linkedin.partnerId = window._linkedin_data_partner_ids[0];
      }
      // LinkedIn conversion events via lintrk
      try {
        const eventosLinkedin = scriptTextos.matchAll(/lintrk\s*\(\s*['"]track['"]\s*,\s*\{[^}]*conversion_id['"]\s*:\s*['"]?(\d+)/g);
        for (const m of eventosLinkedin) {
          linkedin.eventos.push(`Conversion ID: ${m[1]}`);
        }
      } catch { }
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
      detalle: `Tag de conversion activo — ID: ${googleAds.conversionId}`,
      items: googleAds.eventos.length > 0
        ? [`Conversiones detectadas: ${googleAds.eventos.join(', ')}`]
        : ['No se detectaron eventos de conversion en el codigo de la pagina']
    });
  } else {
    checks.push({ nombre: 'Google Ads', estado: 'ADVERTENCIA', detalle: 'Tag de conversion de Google Ads no detectado' });
  }

  // TikTok
  if (tiktok.detectado) {
    checks.push({
      nombre: 'TikTok Pixel',
      estado: 'OK',
      detalle: `Activo${tiktok.pixelId ? ` — ID: ${tiktok.pixelId}` : ' — ID no detectado'}`,
      items: tiktok.eventos.length > 0
        ? [`Eventos: ${tiktok.eventos.join(', ')}`]
        : ['No se detectaron eventos ttq.track() en la pagina']
    });
  } else {
    checks.push({ nombre: 'TikTok Pixel', estado: 'ADVERTENCIA', detalle: 'No detectado' });
  }

  // LinkedIn
  if (linkedin.detectado) {
    checks.push({
      nombre: 'LinkedIn Insight Tag',
      estado: 'OK',
      detalle: `Activo${linkedin.partnerId ? ` — Partner ID: ${linkedin.partnerId}` : ''}`,
      items: linkedin.eventos.length > 0
        ? linkedin.eventos
        : ['No se detectaron eventos de conversion de LinkedIn en la pagina']
    });
  } else {
    checks.push({ nombre: 'LinkedIn Insight Tag', estado: 'ADVERTENCIA', detalle: 'No detectado' });
  }

  // Scripts desconocidos (incluye Clarity y Hotjar si los detecta como no identificados)
  const herramientasGrabacion = [];
  if (clarity.detectado) herramientasGrabacion.push(`Microsoft Clarity${clarity.projectId ? ` (${clarity.projectId})` : ''}`);
  if (hotjar.detectado) herramientasGrabacion.push(`Hotjar${hotjar.siteId ? ` (Site ID: ${hotjar.siteId})` : ''}`);

  const todosDesconocidos = [...scriptsDesconocidos];
  const itemsDesconocidos = todosDesconocidos.map(d => String(d));
  if (herramientasGrabacion.length > 0) itemsDesconocidos.push(`Grabacion de sesiones: ${herramientasGrabacion.join(', ')}`);

  checks.push({
    nombre: 'Scripts de terceros desconocidos',
    estado: todosDesconocidos.length === 0 ? 'OK' : todosDesconocidos.length <= 2 ? 'ADVERTENCIA' : 'ERROR',
    detalle: todosDesconocidos.length === 0
      ? `Todos los scripts son de herramientas conocidas${herramientasGrabacion.length > 0 ? ` — grabacion activa: ${herramientasGrabacion.join(', ')}` : ''}`
      : `${todosDesconocidos.length} script(s) de origen desconocido — verificar con el equipo`,
    items: itemsDesconocidos
  });

  // Eventos disparados al hacer click en CTAs principales
  const eventosClic = await detectarEventosDeClic(page);
  checks.push(eventosClic);

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'Tracking',
    estado: estadoGeneral,
    checks
  };
}

async function detectarEventosDeClic(page) {
  // 1. Inyectar interceptores ANTES de los clicks
  await page.evaluate(() => {
    window.__qa_eventos_clic = [];

    // Interceptar dataLayer.push
    if (window.dataLayer) {
      const pushOriginal = window.dataLayer.push.bind(window.dataLayer);
      window.dataLayer.push = function(...args) {
        for (const entry of args) {
          if (entry && entry.event && !['gtm.js','gtm.dom','gtm.load','gtm.click','gtm.scroll','gtm.historyChange','gtm.timer'].includes(entry.event)) {
            window.__qa_eventos_clic.push({ fuente: 'dataLayer/GA4', evento: entry.event, datos: JSON.stringify(entry).slice(0, 200) });
          }
        }
        return pushOriginal(...args);
      };
    }

    // Interceptar fbq
    if (window.fbq) {
      const fbqOriginal = window.fbq;
      window.fbq = function(tipo, evento, datos) {
        if (tipo === 'track' || tipo === 'trackCustom') {
          window.__qa_eventos_clic.push({ fuente: 'Meta Pixel', evento, datos: datos ? JSON.stringify(datos).slice(0, 150) : null });
        }
        return fbqOriginal.apply(this, arguments);
      };
      // Copiar propiedades del fbq original
      Object.keys(fbqOriginal).forEach(k => { try { window.fbq[k] = fbqOriginal[k]; } catch { } });
    }

    // Interceptar ttq (TikTok)
    if (window.ttq) {
      const ttqOriginal = window.ttq;
      const trackOriginal = ttqOriginal.track?.bind(ttqOriginal);
      if (trackOriginal) {
        window.ttq.track = function(evento, datos) {
          window.__qa_eventos_clic.push({ fuente: 'TikTok Pixel', evento, datos: datos ? JSON.stringify(datos).slice(0, 150) : null });
          return trackOriginal(evento, datos);
        };
      }
    }

    // Interceptar gtag
    if (window.gtag) {
      const gtagOriginal = window.gtag;
      window.gtag = function(tipo, evento, datos) {
        if (tipo === 'event' && evento && datos?.send_to) {
          window.__qa_eventos_clic.push({ fuente: 'Google Ads/GA4', evento, datos: JSON.stringify(datos).slice(0, 150) });
        }
        return gtagOriginal.apply(this, arguments);
      };
    }
  });

  // 2. Identificar CTAs clickeables que NO naveguen fuera ni sean submit
  const ctasInfo = await page.evaluate(() => {
    const urlActual = window.location.href;
    const dominio = window.location.hostname;

    const selectores = [
      'button:not([type="submit"]):not([disabled])',
      'a[class*="btn"]:not([href^="http"]):not([href^="mailto"]):not([href^="tel"])',
      'a[class*="cta"]:not([href^="http"]):not([href^="mailto"]):not([href^="tel"])',
      '[class*="btn-primary"]:not([type="submit"])',
      '[class*="btn-cta"]:not([type="submit"])',
    ];

    const elementos = [];
    const vistos = new Set();

    for (const sel of selectores) {
      for (const el of document.querySelectorAll(sel)) {
        const texto = el.textContent.trim().slice(0, 60);
        if (!texto || vistos.has(texto)) continue;

        // Saltar si navega a otra pagina
        const href = el.getAttribute('href');
        if (href) {
          try {
            const linkUrl = new URL(href, window.location.href);
            if (linkUrl.hostname !== dominio) continue;
            if (linkUrl.href !== urlActual && !href.startsWith('#')) continue; // solo anclas o misma pagina
          } catch { continue; }
        }

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue; // no visible

        vistos.add(texto);
        elementos.push({ texto, selector: sel.split(':')[0], visible: rect.top < window.innerHeight });
      }
    }

    return elementos.slice(0, 8); // maximo 8 CTAs
  });

  if (ctasInfo.length === 0) {
    return {
      nombre: 'Eventos al hacer click (CTAs)',
      estado: 'ADVERTENCIA',
      detalle: 'No se encontraron botones CTA clickeables para probar en la pagina'
    };
  }

  // 3. Hacer click en cada CTA y capturar eventos
  const resultadosPorBoton = [];
  const urlOriginal = page.url();

  for (const cta of ctasInfo) {
    try {
      // Limpiar buffer de eventos antes del click
      await page.evaluate(() => { window.__qa_eventos_clic = []; });

      // Encontrar el elemento
      const elemento = await page.evaluateHandle((texto) => {
        const todos = document.querySelectorAll('button, a[class*="btn"], a[class*="cta"], [class*="btn-primary"], [class*="btn-cta"]');
        return Array.from(todos).find(el => el.textContent.trim().slice(0, 60) === texto);
      }, cta.texto);

      if (!elemento) continue;

      // Click sin esperar navegacion
      await elemento.click().catch(() => {});
      await page.waitForTimeout(1500);

      // Si navego a otra pagina, volver
      if (page.url() !== urlOriginal) {
        await page.goto(urlOriginal, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(500);
        // Re-inyectar interceptores si la pagina recargo
        await page.evaluate(() => { if (!window.__qa_eventos_clic) window.__qa_eventos_clic = []; });
      }

      // Leer eventos capturados
      const eventosCapturados = await page.evaluate(() => window.__qa_eventos_clic || []);

      resultadosPorBoton.push({
        boton: cta.texto,
        eventos: eventosCapturados
      });

    } catch { continue; }
  }

  // 4. Formatear resultado
  const botonesConEventos = resultadosPorBoton.filter(r => r.eventos.length > 0);
  const botonesSinEventos = resultadosPorBoton.filter(r => r.eventos.length === 0);

  const items = resultadosPorBoton.map(r => {
    if (r.eventos.length === 0) return `"${r.boton}" — sin eventos de tracking`;
    const eventosTexto = r.eventos.map(e => `${e.fuente}: ${e.evento}`).join(', ');
    return `"${r.boton}" → ${eventosTexto}`;
  });

  return {
    nombre: 'Eventos al hacer click (CTAs)',
    estado: botonesSinEventos.length > 0 && botonesConEventos.length === 0 ? 'ADVERTENCIA' : 'OK',
    detalle: resultadosPorBoton.length === 0
      ? 'No se pudieron probar clicks en los CTAs'
      : `${resultadosPorBoton.length} boton(es) probado(s) — ${botonesConEventos.length} disparan eventos, ${botonesSinEventos.length} sin tracking`,
    items
  };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkTracking };
