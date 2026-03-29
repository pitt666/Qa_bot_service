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
  if (!lcp) { lcpEstado = 'ADVERTENCIA'; lcpDetalle = 'No se pudo medir el LCP'; }
  else if (lcp < 2500) { lcpEstado = 'OK'; lcpDetalle = `LCP: ${(lcp/1000).toFixed(2)}s — rapido`; }
  else if (lcp < 4000) { lcpEstado = 'ADVERTENCIA'; lcpDetalle = `LCP: ${(lcp/1000).toFixed(2)}s — lento`; }
  else { lcpEstado = 'ERROR'; lcpDetalle = `LCP: ${(lcp/1000).toFixed(2)}s — muy lento`; }
  checks.push({ nombre: 'LCP — Velocidad de carga percibida', estado: lcpEstado, detalle: lcpDetalle });

  const ttfb = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return nav ? nav.responseStart - nav.requestStart : null;
  });
  let ttfbEstado, ttfbDetalle;
  if (!ttfb) { ttfbEstado = 'ADVERTENCIA'; ttfbDetalle = 'No se pudo medir el TTFB'; }
  else if (ttfb < 600) { ttfbEstado = 'OK'; ttfbDetalle = `TTFB: ${Math.round(ttfb)}ms — servidor rapido`; }
  else if (ttfb < 1500) { ttfbEstado = 'ADVERTENCIA'; ttfbDetalle = `TTFB: ${Math.round(ttfb)}ms — revisar hosting`; }
  else { ttfbEstado = 'ERROR'; ttfbDetalle = `TTFB: ${Math.round(ttfb)}ms — servidor muy lento`; }
  checks.push({ nombre: 'TTFB — Velocidad del servidor', estado: ttfbEstado, detalle: ttfbDetalle });

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
    estado: scriptsTerceros.length <= 5 ? 'OK' : scriptsTerceros.length <= 10 ? 'ADVERTENCIA' : 'ERROR',
    detalle: `${scriptsTerceros.length} dominio(s) de terceros`,
    items: scriptsTerceros
  });

  const googleFonts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('link[href*="fonts.googleapis.com"]')).length > 0 ||
    Array.from(document.querySelectorAll('style')).some(s => s.textContent.includes('fonts.googleapis.com'))
  );
  checks.push({
    nombre: 'Google Fonts',
    estado: googleFonts ? 'ADVERTENCIA' : 'OK',
    detalle: googleFonts ? 'Google Fonts detectados — considera hospedar fuentes localmente' : 'No se detectaron Google Fonts externos'
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
