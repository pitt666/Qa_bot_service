/**
 * SECCION 9 — TRACKING
 */

async function checkTracking({ page }) {
  const checks = [];

  // Esperar que scripts asíncronos (Meta Pixel, GTM, GA4, etc.) terminen de inicializarse
  try { await page.waitForTimeout(3000); } catch {}

  const trackingData = await page.evaluate(() => {
    const resultado = {};

    // META PIXEL
    const metaPixel = { detectado: false, pixelId: null, eventos: [], capiSignal: false };
    const allScriptText = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent).join(' ');
    if (window.fbq || window._fbq || allScriptText.includes('fbq(') || document.querySelector('script[src*="connect.facebook.net"]')) {
      metaPixel.detectado = true;
      try {
        if (window.fbq?.getState?.()) {
          const pixels = window.fbq.getState()?.pixels || [];
          if (pixels.length > 0) metaPixel.pixelId = pixels[0].id;
        }
      } catch {}
      if (!metaPixel.pixelId) {
        for (const s of document.querySelectorAll('script:not([src])')) {
          const match = s.textContent.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{10,16})['"]?\s*\)/);
          if (match) { metaPixel.pixelId = match[1]; break; }
        }
      }
      try {
        for (const m of allScriptText.matchAll(/fbq\s*\(\s*['"]track['"]\s*,\s*['"](\w+)['"]\s*/g)) {
          if (!metaPixel.eventos.includes(m[1])) metaPixel.eventos.push(m[1]);
        }
        metaPixel.capiSignal = allScriptText.includes('event_id') || allScriptText.includes('eventID');
      } catch {}
    }
    resultado.metaPixel = metaPixel;

    // GA4
    const ga4 = { detectado: false, measurementId: null, eventos: [] };
    if (window.gtag || window.dataLayer || document.querySelector('script[src*="googletagmanager"], script[src*="google-analytics"]')) {
      for (const s of document.querySelectorAll('script[src*="googletagmanager"], script[src*="google-analytics"]')) {
        const match = (s.src || '').match(/[?&]id=(G-[A-Z0-9]+)/);
        if (match) { ga4.detectado = true; ga4.measurementId = match[1]; break; }
      }
      if (!ga4.measurementId) {
        const t = allScriptText;
        const m = t.match(/['"]?(G-[A-Z0-9]{6,})/);
        if (m) { ga4.detectado = true; ga4.measurementId = m[1]; }
      }
      if (!ga4.detectado && (window.gtag || window.dataLayer)) ga4.detectado = true;
      if (window.dataLayer) {
        for (const e of window.dataLayer) {
          if (e.event && !['gtm.js','gtm.dom','gtm.load','gtm.click','gtm.scroll'].includes(e.event)) {
            if (!ga4.eventos.includes(e.event)) ga4.eventos.push(e.event);
          }
        }
      }
    }
    resultado.ga4 = ga4;

    // GTM
    const gtm = { detectado: false, containerId: null };
    const gtmScript = document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
    if (gtmScript) {
      const m = (gtmScript.src || '').match(/[?&]id=(GTM-[A-Z0-9]+)/);
      gtm.detectado = true; gtm.containerId = m ? m[1] : 'ID no extraible';
    }
    if (!gtm.detectado) {
      const iframe = document.querySelector('iframe[src*="googletagmanager.com/ns.html"]');
      if (iframe) {
        const m = iframe.src.match(/[?&]id=(GTM-[A-Z0-9]+)/);
        gtm.detectado = true; gtm.containerId = m ? m[1] : 'ID no extraible';
      }
    }
    if (!gtm.detectado) {
      const m = allScriptText.match(/(GTM-[A-Z0-9]+)/);
      if (m) { gtm.detectado = true; gtm.containerId = m[1]; }
    }
    resultado.gtm = gtm;

    // Google Ads
    const googleAds = { detectado: false, conversionId: null, eventos: [] };
    const adsMatch = allScriptText.match(/['"]?(AW-\d{7,11})/);
    if (adsMatch) { googleAds.detectado = true; googleAds.conversionId = adsMatch[1]; }
    resultado.googleAds = googleAds;

    // TikTok
    const tiktok = { detectado: false, pixelId: null, eventos: [] };
    if (window.ttq || window.TiktokAnalyticsObject || allScriptText.includes('ttq.load') || document.querySelector('script[src*="analytics.tiktok.com"]')) {
      tiktok.detectado = true;
      const m = allScriptText.match(/ttq\.load\s*\(\s*['"](\w{15,})['"]/);
      if (m) tiktok.pixelId = m[1];
      try {
        for (const e of allScriptText.matchAll(/ttq\.track\s*\(\s*['"](\w+)['"]\s*/g)) {
          if (!tiktok.eventos.includes(e[1])) tiktok.eventos.push(e[1]);
        }
      } catch {}
    }
    resultado.tiktok = tiktok;

    // LinkedIn
    const linkedin = { detectado: false, partnerId: null };
    if (window._linkedin_data_partner_ids || document.querySelector('script[src*="snap.licdn.com"]') || allScriptText.includes('linkedin')) {
      linkedin.detectado = true;
      if (window._linkedin_data_partner_ids?.[0]) linkedin.partnerId = window._linkedin_data_partner_ids[0];
    }
    resultado.linkedin = linkedin;

    // Clarity
    const clarity = { detectado: !!(window.clarity || document.querySelector('script[src*="clarity.ms"]') || allScriptText.includes('clarity.ms')) };
    resultado.clarity = clarity;

    // Hotjar
    const hotjar = { detectado: !!(window.hj || window._hjSettings || document.querySelector('script[src*="hotjar.com"]') || allScriptText.includes('hotjar.com')), siteId: window._hjSettings?.hjid || null };
    resultado.hotjar = hotjar;

    // Scripts desconocidos
    const conocidos = ['google','facebook','fb.com','instagram','tiktok','linkedin','hotjar','clarity.ms','hubspot','intercom','drift','zendesk','crisp','tawk','tidio','youtube','vimeo','cloudflare','jquery','bootstrap','wordpress','shopify','stripe','paypal','googleapis','recaptcha','sentry','cdn.jsdelivr','cdnjs','unpkg'];
    const dominioActual = window.location.hostname.replace('www.','');
    const desconocidos = [];
    for (const s of document.querySelectorAll('script[src]')) {
      try {
        const d = new URL(s.src).hostname.replace('www.','');
        if (d === dominioActual) continue;
        if (!conocidos.some(c => d.includes(c))) desconocidos.push(d);
      } catch {}
    }
    resultado.scriptsDesconocidos = [...new Set(desconocidos)];

    return resultado;
  });

  const { metaPixel, ga4, gtm, googleAds, tiktok, linkedin, clarity, hotjar, scriptsDesconocidos } = trackingData;

  checks.push(metaPixel.detectado
    ? { nombre: 'Meta Pixel', estado: 'OK', detalle: `Activo${metaPixel.pixelId ? ` — ID: ${metaPixel.pixelId}` : ''}`, items: [metaPixel.eventos.length ? `Eventos: ${metaPixel.eventos.join(', ')}` : 'Sin eventos detectados', metaPixel.capiSignal ? 'CAPI: event_id detectado' : 'CAPI: sin event_id'] }
    : { nombre: 'Meta Pixel', estado: 'ADVERTENCIA', detalle: 'No detectado' });

  checks.push(ga4.detectado
    ? { nombre: 'Google Analytics 4', estado: 'OK', detalle: `Activo${ga4.measurementId ? ` — ID: ${ga4.measurementId}` : ''}`, items: ga4.eventos.length ? [`Eventos: ${ga4.eventos.slice(0,8).join(', ')}`] : ['Sin eventos personalizados'] }
    : { nombre: 'Google Analytics 4', estado: 'ADVERTENCIA', detalle: 'No detectado' });

  checks.push(gtm.detectado
    ? { nombre: 'Google Tag Manager', estado: 'OK', detalle: `Activo — Contenedor: ${gtm.containerId}` }
    : { nombre: 'Google Tag Manager', estado: 'ADVERTENCIA', detalle: 'No detectado' });

  checks.push(googleAds.detectado
    ? { nombre: 'Google Ads', estado: 'OK', detalle: `Tag activo — ID: ${googleAds.conversionId}` }
    : { nombre: 'Google Ads', estado: 'ADVERTENCIA', detalle: 'No detectado' });

  checks.push(tiktok.detectado
    ? { nombre: 'TikTok Pixel', estado: 'OK', detalle: `Activo${tiktok.pixelId ? ` — ID: ${tiktok.pixelId}` : ''}`, items: tiktok.eventos.length ? [`Eventos: ${tiktok.eventos.join(', ')}`] : ['Sin eventos'] }
    : { nombre: 'TikTok Pixel', estado: 'ADVERTENCIA', detalle: 'No detectado' });

  checks.push(linkedin.detectado
    ? { nombre: 'LinkedIn Insight Tag', estado: 'OK', detalle: `Activo${linkedin.partnerId ? ` — Partner ID: ${linkedin.partnerId}` : ''}` }
    : { nombre: 'LinkedIn Insight Tag', estado: 'ADVERTENCIA', detalle: 'No detectado' });

  const grabacion = [];
  if (clarity.detectado) grabacion.push('Microsoft Clarity');
  if (hotjar.detectado) grabacion.push(`Hotjar${hotjar.siteId ? ` (${hotjar.siteId})` : ''}`);
  checks.push({
    nombre: 'Scripts de terceros desconocidos',
    estado: scriptsDesconocidos.length === 0 ? 'OK' : scriptsDesconocidos.length <= 2 ? 'ADVERTENCIA' : 'ERROR',
    detalle: scriptsDesconocidos.length === 0 ? `Scripts conocidos${grabacion.length ? ` — grabacion: ${grabacion.join(', ')}` : ''}` : `${scriptsDesconocidos.length} script(s) desconocido(s)`,
    items: [...scriptsDesconocidos, ...grabacion.map(g => `Grabacion: ${g}`)]
  });

  return { nombre: 'Tracking', estado: calcularEstado(checks), checks };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkTracking };
