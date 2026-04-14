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
      try { observer.observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
      setTimeout(() => { observer.disconnect(); resolve(lcpValue); }, 3000);
    });
  });
  let lcpEstado, lcpDetalle;
  if (!lcp)            { lcpEstado = 'ADVERTENCIA'; lcpDetalle = 'No se pudo medir el LCP'; }
  else if (lcp < 2500) { lcpEstado = 'OK';          lcpDetalle = `LCP: ${(lcp/1000).toFixed(2)}s — rapido`; }
  else if (lcp < 4000) { lcpEstado = 'ADVERTENCIA'; lcpDetalle = `LCP: ${(lcp/1000).toFixed(2)}s — lento`; }
  else                 { lcpEstado = 'ERROR';        lcpDetalle = `LCP: ${(lcp/1000).toFixed(2)}s — muy lento`; }
  checks.push({ nombre: 'LCP — Velocidad de carga percibida', estado: lcpEstado, detalle: lcpDetalle });

  const ttfb = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return nav ? nav.responseStart - nav.requestStart : null;
  });
  let ttfbEstado, ttfbDetalle;
  if (!ttfb)            { ttfbEstado = 'ADVERTENCIA'; ttfbDetalle = 'No se pudo medir el TTFB'; }
  else if (ttfb < 600)  { ttfbEstado = 'OK';          ttfbDetalle = `TTFB: ${Math.round(ttfb)}ms — rapido`; }
  else if (ttfb < 1500) { ttfbEstado = 'ADVERTENCIA'; ttfbDetalle = `TTFB: ${Math.round(ttfb)}ms — revisar hosting`; }
  else                  { ttfbEstado = 'ERROR';        ttfbDetalle = `TTFB: ${Math.round(ttfb)}ms — muy lento`; }
  checks.push({ nombre: 'TTFB — Velocidad del servidor', estado: ttfbEstado, detalle: ttfbDetalle });

  const imagenesProblematicas = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const recursos = performance.getEntriesByType('resource');
    const problemas = [];
    for (const img of imgs) {
      if (!img.complete || img.naturalWidth === 0) continue;
      const src = img.src || img.getAttribute('src') || '';
      if (!src) continue;
      const nombre = src.split('/').pop().split('?')[0].slice(0, 60);
      const problema = [];
      const rectWidth = img.getBoundingClientRect().width;
      if (img.naturalWidth > 0 && rectWidth > 0 && img.naturalWidth > rectWidth * 2.5 && img.naturalWidth > 800)
        problema.push(`${img.naturalWidth}px en ${Math.round(rectWidth)}px`);
      if (/\.(jpg|jpeg|png)(\?|$)/i.test(src)) problema.push('usar WebP/AVIF');
      const srcBase = src.split('?')[0];
      const recurso = recursos.find(r => r.name === src || r.name.split('?')[0] === srcBase);
      if (recurso) {
        const bytes = recurso.encodedBodySize || recurso.transferSize || 0;
        if (bytes > 0) {
          const kb = Math.round(bytes / 1024);
          if (kb > 500)      problema.push(`${kb} KB — muy pesada (objetivo <200 KB)`);
          else if (kb > 200) problema.push(`${kb} KB — comprimir`);
        }
      }
      if (problema.length > 0) problemas.push({ nombre, problemas: problema });
    }
    return problemas.slice(0, 15);
  });
  checks.push({
    nombre: 'Imagenes sin optimizar',
    estado: imagenesProblematicas.length === 0 ? 'OK' : imagenesProblematicas.length <= 3 ? 'ADVERTENCIA' : 'ERROR',
    detalle: imagenesProblematicas.length === 0 ? 'Imagenes bien optimizadas' : `${imagenesProblematicas.length} imagen(es) con problemas`,
    items: imagenesProblematicas.map(i => `${i.nombre}: ${i.problemas.join(' | ')}`)
  });

  // Scripts de terceros — INFORMATIVO
  const scriptsTerceros = await page.evaluate(() => {
    const dominio = window.location.hostname.replace('www.', '');
    return [...new Set(Array.from(document.querySelectorAll('script[src]'))
      .filter(s => { try { const d = new URL(s.src).hostname.replace('www.',''); return !d.includes(dominio) && d !== ''; } catch { return false; } })
      .map(s => { try { return new URL(s.src).hostname; } catch { return s.src; } }))];
  });
  checks.push({
    nombre: 'Scripts de terceros',
    estado: 'OK',
    detalle: scriptsTerceros.length === 0
      ? 'Sin scripts de terceros'
      : `${scriptsTerceros.length} dominio(s) de terceros (informativo)`,
    items: scriptsTerceros
  });

  // Fuentes tipograficas — INFORMATIVO si >3 (observacion de diseno, no problema real)
  const fuentes = await page.evaluate(() => {
    const ff = new Set();
    for (const el of document.querySelectorAll('h1,h2,h3,p,span,button,a')) {
      const f = window.getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/['"]/g,'');
      if (f) ff.add(f);
    }
    return [...ff].filter(f => !['serif','sans-serif','monospace','cursive','inherit','initial'].includes(f.toLowerCase()));
  });
  checks.push({
    nombre: 'Fuentes tipograficas',
    estado: fuentes.length <= 3 ? 'OK' : 'INFORMATIVO',
    detalle: fuentes.length <= 3
      ? `${fuentes.length} fuente(s) — correcto`
      : `${fuentes.length} fuentes — mas de 3 puede afectar consistencia visual (informativo)`,
    items: fuentes
  });

  return { nombre: 'Rendimiento', estado: calcularEstado(checks), checks };
}

function calcularEstado(checks) {
  const reales = checks.filter(c => c.estado !== 'INFORMATIVO');
  if (reales.some(c => c.estado === 'ERROR'))       return 'ERROR';
  if (reales.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkRendimiento };
