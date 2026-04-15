/**
 * SECCION 2 — RENDIMIENTO
 */
async function checkRendimiento({ page }) {
  const checks = [];

  const lcp = await page.evaluate(() => {
    return new Promise(resolve => {
      let lcpValue = null;
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        if (entries.length > 0) lcpValue = entries[entries.length - 1].startTime;
      });
      try { observer.observe({ type: 'largest-contentful-paint', buffered: true }); } catch { }
      setTimeout(() => { observer.disconnect(); resolve(lcpValue); }, 3000);
    });
  });

  let lcpEstado, lcpDetalle;
  if (!lcp) { lcpEstado = 'ADVERTENCIA'; lcpDetalle = 'No se pudo medir la velocidad de carga'; }
  else if (lcp < 2500) { lcpEstado = 'OK'; lcpDetalle = `${(lcp/1000).toFixed(2)}s — Carga rapida (ideal: menos de 2.5s)`; }
  else if (lcp < 4000) { lcpEstado = 'ADVERTENCIA'; lcpDetalle = `${(lcp/1000).toFixed(2)}s — Carga lenta (ideal: menos de 2.5s)`; }
  else { lcpEstado = 'ERROR'; lcpDetalle = `${(lcp/1000).toFixed(2)}s — Carga muy lenta (ideal: menos de 2.5s)`; }
  checks.push({ nombre: 'Velocidad de carga', estado: lcpEstado, detalle: lcpDetalle });

  const ttfb = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return nav ? nav.responseStart - nav.requestStart : null;
  });
  let ttfbEstado, ttfbDetalle;
  if (!ttfb) { ttfbEstado = 'ADVERTENCIA'; ttfbDetalle = 'No se pudo medir la velocidad del servidor'; }
  else if (ttfb < 600) { ttfbEstado = 'OK'; ttfbDetalle = `${Math.round(ttfb)}ms — Servidor rapido (ideal: menos de 600ms)`; }
  else if (ttfb < 1500) { ttfbEstado = 'ADVERTENCIA'; ttfbDetalle = `${Math.round(ttfb)}ms — Servidor lento (ideal: menos de 600ms) — revisar hosting`; }
  else { ttfbEstado = 'ERROR'; ttfbDetalle = `${Math.round(ttfb)}ms — Servidor muy lento (ideal: menos de 600ms)`; }
  checks.push({ nombre: 'Velocidad del servidor', estado: ttfbEstado, detalle: ttfbDetalle });

  const imagenesProblematicas = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const problemas = [];
    for (const img of imgs) {
      if (!img.complete || img.naturalWidth === 0) continue;
      const src = img.src || img.getAttribute('src') || '';
      const nombre = src.split('/').pop().split('?')[0].slice(0, 60);
      const problema = [];
      const rectWidth = img.getBoundingClientRect().width;
      if (img.naturalWidth > 0 && rectWidth > 0 && img.naturalWidth > rectWidth * 2.5 && img.naturalWidth > 800)
        problema.push(`imagen de ${img.naturalWidth}px mostrada en ${Math.round(rectWidth)}px`);
      if (/\.(jpg|jpeg|png)(\?|$)/i.test(src)) problema.push('formato JPG/PNG (podria ser WebP)');
      if (problema.length > 0) problemas.push({ nombre, problemas: problema });
    }
    return problemas.slice(0, 15);
  });
  checks.push({
    nombre: 'Imagenes sin optimizar',
    estado: imagenesProblematicas.length === 0 ? 'OK' : imagenesProblematicas.length <= 3 ? 'ADVERTENCIA' : 'ERROR',
    detalle: imagenesProblematicas.length === 0 ? 'Imagenes bien optimizadas' : `${imagenesProblematicas.length} imagen(es) con problemas`,
    items: imagenesProblematicas.map(i => `${i.nombre}: ${i.problemas.join(', ')}`)
  });

  const scriptsTerceros = await page.evaluate(() => {
    const dominio = window.location.hostname.replace('www.', '');
    return [...new Set(
      Array.from(document.querySelectorAll('script[src]'))
        .filter(s => { try { const d = new URL(s.src).hostname.replace('www.', ''); return !d.includes(dominio) && d !== ''; } catch { return false; } })
        .map(s => { try { return new URL(s.src).hostname; } catch { return s.src; } })
    )];
  });
  checks.push({
    nombre: 'Scripts de terceros',
    estado: 'INFORMATIVO',
    detalle: `${scriptsTerceros.length} dominio(s) de terceros detectado(s)`,
    items: scriptsTerceros
  });

  const googleFontsInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('link[href*="fonts.googleapis.com"]'));
    const familias = new Set();
    for (const link of links) {
      const match = (link.href || '').match(/family=([^&:]+)/g) || [];
      for (const m of match) {
        const fams = m.replace('family=', '').split('|');
        for (const f of fams) familias.add(decodeURIComponent(f.split(':')[0]).replace(/\+/g, ' ').trim());
      }
    }
    const enStyle = Array.from(document.querySelectorAll('style')).some(s => s.textContent.includes('fonts.googleapis.com'));
    return { detectado: links.length > 0 || enStyle, familias: [...familias] };
  });
  const numFamilias = googleFontsInfo.familias.length;
  checks.push({
    nombre: 'Google Fonts',
    estado: !googleFontsInfo.detectado ? 'OK' : numFamilias > 3 ? 'ADVERTENCIA' : 'INFORMATIVO',
    detalle: !googleFontsInfo.detectado
      ? 'No se detectaron Google Fonts externos'
      : numFamilias > 3
        ? `${numFamilias} familias de Google Fonts — mas de 3 puede afectar velocidad`
        : `${numFamilias || 'Detectado'} fuente(s) de Google Fonts — dentro de lo razonable`,
    items: googleFontsInfo.familias
  });

  const fuentes = await page.evaluate(() => {
    const fontFamilies = new Set();
    for (const el of document.querySelectorAll('h1, h2, h3, p, span, button, a')) {
      const font = window.getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/['"]/g, '');
      if (font) fontFamilies.add(font);
    }
    return [...fontFamilies].filter(f => !['serif','sans-serif','monospace','cursive','inherit','initial'].includes(f.toLowerCase()));
  });
  checks.push({
    nombre: 'Fuentes tipograficas',
    estado: fuentes.length <= 3 ? 'OK' : 'ADVERTENCIA',
    detalle: fuentes.length <= 3 ? `${fuentes.length} fuente(s) — correcto` : `${fuentes.length} fuentes distintas — mas de 3 afecta velocidad`,
    items: fuentes
  });

  return { nombre: 'Rendimiento', estado: calcularEstado(checks), checks };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkRendimiento };
