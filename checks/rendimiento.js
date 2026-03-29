/**
 * SECCION 2 — RENDIMIENTO
 * LCP, imagenes (peso/formato/dimensiones/lazy loading),
 * scripts de terceros (cantidad), Google Fonts, CSS/JS minificado,
 * video autoplay con sonido, fuentes tipograficas
 */

async function checkRendimiento({ page }) {
  const checks = [];

  // 1. LCP — Largest Contentful Paint
  const lcp = await page.evaluate(() => {
    return new Promise(resolve => {
      let lcpValue = null;
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          lcpValue = entries[entries.length - 1].startTime;
        }
      });
      try {
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch { }
      setTimeout(() => {
        observer.disconnect();
        resolve(lcpValue);
      }, 3000);
    });
  });

  let lcpEstado, lcpDetalle;
  if (!lcp) {
    lcpEstado = 'ADVERTENCIA';
    lcpDetalle = 'No se pudo medir el LCP';
  } else if (lcp < 2500) {
    lcpEstado = 'OK';
    lcpDetalle = `LCP: ${(lcp / 1000).toFixed(2)}s — Excelente (el contenido principal aparece rapido)`;
  } else if (lcp < 4000) {
    lcpEstado = 'ADVERTENCIA';
    lcpDetalle = `LCP: ${(lcp / 1000).toFixed(2)}s — Mejorable (el contenido principal tarda en aparecer)`;
  } else {
    lcpEstado = 'ERROR';
    lcpDetalle = `LCP: ${(lcp / 1000).toFixed(2)}s — Lento (los usuarios se van antes de ver el contenido)`;
  }

  checks.push({ nombre: 'LCP — Velocidad de carga percibida', estado: lcpEstado, detalle: lcpDetalle });

  // 2. TTFB — Tiempo hasta primer byte
  const ttfb = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return nav ? nav.responseStart - nav.requestStart : null;
  });

  let ttfbEstado, ttfbDetalle;
  if (!ttfb) {
    ttfbEstado = 'ADVERTENCIA';
    ttfbDetalle = 'No se pudo medir el TTFB';
  } else if (ttfb < 600) {
    ttfbEstado = 'OK';
    ttfbDetalle = `TTFB: ${Math.round(ttfb)}ms — El servidor responde rapidamente`;
  } else if (ttfb < 1500) {
    ttfbEstado = 'ADVERTENCIA';
    ttfbDetalle = `TTFB: ${Math.round(ttfb)}ms — El servidor tarda en responder, revisar hosting`;
  } else {
    ttfbEstado = 'ERROR';
    ttfbDetalle = `TTFB: ${Math.round(ttfb)}ms — El servidor es muy lento, problema de hosting o configuracion`;
  }

  checks.push({ nombre: 'TTFB — Velocidad del servidor', estado: ttfbEstado, detalle: ttfbDetalle });

  // 3. Imagenes sin optimizar
  const imagenesProblematicas = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const problemas = [];

    for (const img of imgs) {
      if (!img.complete || img.naturalWidth === 0) continue;

      const src = img.src || img.getAttribute('src') || '';
      const nombre = src.split('/').pop().split('?')[0].slice(0, 60);
      const problema = [];

      // Imagen se muestra muy pequeña pero puede ser grande (detectar por dimensiones del elemento vs naturaleza)
      const rectWidth = img.getBoundingClientRect().width;
      if (img.naturalWidth > 0 && rectWidth > 0 && img.naturalWidth > rectWidth * 2.5 && img.naturalWidth > 800) {
        problema.push(`imagen de ${img.naturalWidth}px mostrada en ${Math.round(rectWidth)}px`);
      }

      // Formato JPG/PNG (no WebP, no AVIF)
      if (/\.(jpg|jpeg|png)(\?|$)/i.test(src)) {
        problema.push('formato JPG/PNG (podria ser WebP)');
      }

      // Sin lazy loading
      if (!img.loading && !img.getAttribute('loading') && !img.getAttribute('data-src')) {
        const rect = img.getBoundingClientRect();
        if (rect.top > window.innerHeight * 2) {
          problema.push('sin lazy loading (carga aunque no se vea)');
        }
      }

      if (problema.length > 0) {
        problemas.push({ nombre, problemas: problema });
      }
    }
    return problemas.slice(0, 15);
  });

  checks.push({
    nombre: 'Imagenes sin optimizar',
    estado: imagenesProblematicas.length === 0 ? 'OK' : imagenesProblematicas.length <= 3 ? 'ADVERTENCIA' : 'ERROR',
    detalle: imagenesProblematicas.length === 0
      ? 'Las imagenes parecen estar bien optimizadas'
      : `${imagenesProblematicas.length} imagen(es) con problemas de optimizacion`,
    items: imagenesProblematicas.map(i => `${i.nombre}: ${i.problemas.join(', ')}`)
  });

  // 4. Scripts de terceros — cantidad
  const scriptsTerceros = await page.evaluate(() => {
    const dominio = window.location.hostname.replace('www.', '');
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const terceros = scripts.filter(s => {
      try {
        const scriptDominio = new URL(s.src).hostname.replace('www.', '');
        return !scriptDominio.includes(dominio) && scriptDominio !== '';
      } catch { return false; }
    });
    return terceros.map(s => {
      try { return new URL(s.src).hostname; } catch { return s.src; }
    });
  });

  const dominiosTerceros = [...new Set(scriptsTerceros)];
  let scriptsEstado;
  if (dominiosTerceros.length <= 5) scriptsEstado = 'OK';
  else if (dominiosTerceros.length <= 10) scriptsEstado = 'ADVERTENCIA';
  else scriptsEstado = 'ERROR';

  checks.push({
    nombre: 'Scripts de terceros',
    estado: scriptsEstado,
    detalle: `${dominiosTerceros.length} dominio(s) de terceros cargando scripts — ${dominiosTerceros.length <= 5 ? 'nivel normal' : dominiosTerceros.length <= 10 ? 'un poco elevado, puede afectar velocidad' : 'demasiados, impacto significativo en velocidad'}`,
    items: dominiosTerceros
  });

  // 5. Google Fonts
  const googleFonts = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]'));
    const stylesConFonts = Array.from(document.querySelectorAll('style')).filter(s => s.textContent.includes('fonts.googleapis.com'));
    return links.length > 0 || stylesConFonts.length > 0;
  });

  checks.push({
    nombre: 'Google Fonts',
    estado: googleFonts ? 'ADVERTENCIA' : 'OK',
    detalle: googleFonts
      ? 'Se detectaron Google Fonts — ralentizan la carga, considera hospedar las fuentes localmente'
      : 'No se detectaron Google Fonts externos'
  });

  // 6. Numero de fuentes tipograficas distintas
  const fuentes = await page.evaluate(() => {
    const elementos = document.querySelectorAll('h1, h2, h3, p, span, button, a');
    const fontFamilies = new Set();
    for (const el of elementos) {
      const font = window.getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/['"]/g, '');
      if (font) fontFamilies.add(font);
    }
    return [...fontFamilies];
  });

  const fuentesUnicas = fuentes.filter(f => !['serif', 'sans-serif', 'monospace', 'cursive', 'inherit', 'initial'].includes(f.toLowerCase()));

  checks.push({
    nombre: 'Fuentes tipograficas',
    estado: fuentesUnicas.length <= 3 ? 'OK' : 'ADVERTENCIA',
    detalle: fuentesUnicas.length <= 3
      ? `${fuentesUnicas.length} fuente(s) detectada(s) — cantidad correcta`
      : `${fuentesUnicas.length} fuentes distintas — mas de 3 puede afectar velocidad y consistencia visual`,
    items: fuentesUnicas
  });

  // 7. Video autoplay con sonido
  const videosAutoplay = await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video[autoplay]'));
    return videos
      .filter(v => !v.muted && !v.getAttribute('muted'))
      .map(v => v.src || v.querySelector('source')?.src || '(video embebido)');
  });

  checks.push({
    nombre: 'Video autoplay con sonido',
    estado: videosAutoplay.length === 0 ? 'OK' : 'ERROR',
    detalle: videosAutoplay.length === 0
      ? 'No hay videos con autoplay y sonido'
      : `${videosAutoplay.length} video(s) con autoplay y sonido — Google penaliza esto y molesta al usuario`,
    items: videosAutoplay
  });

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'Rendimiento',
    estado: estadoGeneral,
    checks
  };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkRendimiento };
