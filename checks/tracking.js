/**
 * SECCION 9 — TRACKING
 * Deteccion basada en IDs reales en scripts del HTML
 */
async function checkTracking({ page }) {
  const checks = [];
  try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}

  const td = await page.evaluate(() => {
    const txt = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent).join('\n');
    const r = {};

    // META PIXEL
    const mp = { detectado: false, pixelId: null };
    if (document.querySelector('script[src*="connect.facebook.net"]') || /fbq\s*\(/.test(txt)) {
      mp.detectado = true;
      const m = txt.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d{10,17})['"]/);
      if (m) mp.pixelId = m[1];
    }
    r.metaPixel = mp;

    // GA4
    const ga4 = { detectado: false, measurementId: null };
    const ga4s = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
    if (ga4s) { ga4.detectado = true; const m = ga4s.src.match(/id=(G-[A-Z0-9]+)/); if (m) ga4.measurementId = m[1]; }
    if (!ga4.detectado) { const m = txt.match(/['"]?(G-[A-Z0-9]{4,})/); if (m) { ga4.detectado = true; ga4.measurementId = m[1]; } }
    r.ga4 = ga4;

    // GTM
    const gtm = { detectado: false, containerId: null };
    const gtms = document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
    if (gtms) { gtm.detectado = true; const m = gtms.src.match(/id=(GTM-[A-Z0-9]+)/); if (m) gtm.containerId = m[1]; }
    if (!gtm.detectado) { const m = txt.match(/(GTM-[A-Z0-9]+)/); if (m) { gtm.detectado = true; gtm.containerId = m[1]; } }
    r.gtm = gtm;

    // GOOGLE ADS
    const ads = { detectado: false, conversionId: null };
    const am = txt.match(/(AW-\d{7,12})/);
    if (am) { ads.detectado = true; ads.conversionId = am[1]; }
    r.googleAds = ads;

    // TIKTOK
    const tt = { detectado: false, pixelId: null };
    if (document.querySelector('script[src*="analytics.tiktok.com"]') || /ttq\.load/.test(txt)) {
      tt.detectado = true;
      const m = txt.match(/ttq\.load\s*\(\s*['"]([A-Z0-9]{10,})['"]/);
      if (m) tt.pixelId = m[1];
    }
    r.tiktok = tt;

    // LINKEDIN
    const li = { detectado: false, partnerId: null };
    if (document.querySelector('script[src*="snap.licdn.com"]') || window._linkedin_data_partner_ids) {
      li.detectado = true;
      if (window._linkedin_data_partner_ids?.[0]) li.partnerId = String(window._linkedin_data_partner_ids[0]);
    }
    r.linkedin = li;

    r.clarity = { detectado: !!(window.clarity || document.querySelector('script[src*="clarity.ms"]')) };
    r.hotjar  = { detectado: !!(window.hj || document.querySelector('script[src*="hotjar.com"]')), siteId: window._hjSettings?.hjid || null };

    const conocidos = ['google','facebook','connect.facebook','tiktok','linkedin','hotjar','clarity.ms',
      'hubspot','intercom','drift','zendesk','crisp','tawk','tidio','youtube','vimeo','cloudflare',
      'jquery','bootstrap','wordpress','shopify','stripe','paypal','googleapis','recaptcha','sentry',
      'cdn.jsdelivr','cdnjs','unpkg','cleantalk','moderate.cleantalk','activecampaign','klaviyo','mailchimp'];
    const dom = window.location.hostname.replace('www.','');
    const desc = [];
    for (const s of document.querySelectorAll('script[src]')) {
      try { const d = new URL(s.src).hostname.replace('www.',''); if (d !== dom && !conocidos.some(c => d.includes(c))) desc.push(d); } catch {}
    }
    r.scriptsDesconocidos = [...new Set(desc)];
    return r;
  });

  const { metaPixel, ga4, gtm, googleAds, tiktok, linkedin, clarity, hotjar, scriptsDesconocidos } = td;

  checks.push(metaPixel.detectado ? { nombre: 'Meta Pixel',           estado: 'OK',          detalle: `Activo${metaPixel.pixelId  ? ` — ID: ${metaPixel.pixelId}`   : ''}` } : { nombre: 'Meta Pixel',           estado: 'ADVERTENCIA', detalle: 'No detectado' });
  checks.push(ga4.detectado       ? { nombre: 'Google Analytics 4',   estado: 'OK',          detalle: `Activo${ga4.measurementId  ? ` — ${ga4.measurementId}`        : ''}` } : { nombre: 'Google Analytics 4',   estado: 'ADVERTENCIA', detalle: 'No detectado' });
  checks.push(gtm.detectado       ? { nombre: 'Google Tag Manager',   estado: 'OK',          detalle: `Activo${gtm.containerId    ? ` — ${gtm.containerId}`          : ''}` } : { nombre: 'Google Tag Manager',   estado: 'ADVERTENCIA', detalle: 'No detectado' });
  checks.push(googleAds.detectado ? { nombre: 'Google Ads',           estado: 'OK',          detalle: `Activo — ${googleAds.conversionId}` }                                    : { nombre: 'Google Ads',           estado: 'ADVERTENCIA', detalle: 'No detectado' });
  checks.push(tiktok.detectado    ? { nombre: 'TikTok Pixel',         estado: 'OK',          detalle: `Activo${tiktok.pixelId     ? ` — ID: ${tiktok.pixelId}`       : ''}` } : { nombre: 'TikTok Pixel',         estado: 'ADVERTENCIA', detalle: 'No detectado' });
  checks.push(linkedin.detectado  ? { nombre: 'LinkedIn Insight Tag', estado: 'OK',          detalle: `Activo${linkedin.partnerId ? ` — Partner: ${linkedin.partnerId}` : ''}` } : { nombre: 'LinkedIn Insight Tag', estado: 'ADVERTENCIA', detalle: 'No detectado' });

  const grabacion = [...(clarity.detectado ? ['Microsoft Clarity'] : []), ...(hotjar.detectado ? [`Hotjar${hotjar.siteId ? ` (${hotjar.siteId})` : ''}`] : [])];
  checks.push({
    nombre: 'Scripts de terceros',
    estado: scriptsDesconocidos.length === 0 ? 'OK' : scriptsDesconocidos.length <= 2 ? 'ADVERTENCIA' : 'ERROR',
    detalle: scriptsDesconocidos.length === 0 ? `Sin scripts desconocidos${grabacion.length ? ` — grabacion: ${grabacion.join(', ')}` : ''}` : `${scriptsDesconocidos.length} script(s) no identificados`,
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
