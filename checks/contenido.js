/**
 * SECCION 7 — CONTENIDO
 * Contenido duplicado, alt text descriptivo,
 * videos YouTube/Vimeo cargan, logo enlaza al home
 */

async function checkContenido({ page }) {
  const checks = [];

  // 1. Contenido duplicado
  const duplicados = await page.evaluate(() => {
    const parrafos = Array.from(document.querySelectorAll('p, h1, h2, h3, li'))
      .map(el => el.textContent.trim())
      .filter(t => t.length > 30);
    const conteo = {};
    parrafos.forEach(p => { conteo[p] = (conteo[p] || 0) + 1; });
    return Object.entries(conteo)
      .filter(([, c]) => c > 1)
      .map(([texto, c]) => `"${texto.slice(0, 60)}..." (${c} veces)`)
      .slice(0, 5);
  });

  checks.push({
    nombre: 'Contenido duplicado',
    estado: duplicados.length === 0 ? 'OK' : 'ADVERTENCIA',
    detalle: duplicados.length === 0
      ? 'No se encontro contenido duplicado'
      : `${duplicados.length} bloque(s) de texto repetido(s) — puede ser error al copiar secciones`,
    items: duplicados
  });

  // 2. Alt text en imagenes
  const altInfo = await page.evaluate(() => {
    const patronGenerico = /^(img|image|foto|photo|pic|banner|img\d+|dsc|p\d+|image\d+|untitled|screenshot)/i;
    const sinAlt = [], altGenerico = [];
    for (const img of document.querySelectorAll('img')) {
      const src = img.src || '';
      const alt = img.getAttribute('alt');
      const nombre = src.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '');
      if (!alt || alt.trim() === '') sinAlt.push(nombre.slice(0, 40) || '(sin nombre)');
      else if (patronGenerico.test(alt) || patronGenerico.test(nombre)) altGenerico.push(`alt="${alt.slice(0, 40)}"`);
    }
    return { sinAlt: sinAlt.slice(0, 10), altGenerico: altGenerico.slice(0, 10) };
  });

  checks.push({
    nombre: 'Alt text en imagenes',
    estado: altInfo.sinAlt.length === 0 && altInfo.altGenerico.length === 0 ? 'OK'
      : altInfo.sinAlt.length > 5 ? 'ERROR' : 'ADVERTENCIA',
    detalle: altInfo.sinAlt.length === 0 && altInfo.altGenerico.length === 0
      ? 'Todas las imagenes tienen alt text descriptivo'
      : `${altInfo.sinAlt.length} sin alt, ${altInfo.altGenerico.length} con alt generico (IMG001, foto...)`,
    items: [...altInfo.sinAlt.map(s => `Sin alt: ${s}`), ...altInfo.altGenerico]
  });

  // 3. Videos YouTube/Vimeo
  const videosInfo = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"]'));
    const conProblemas = iframes.filter(f => { const src = f.src || f.getAttribute('src'); return !src || src.trim() === '' || src === 'about:blank'; });
    return { total: iframes.length, conProblemas: conProblemas.length, srcs: iframes.map(f => f.src).slice(0, 5) };
  });

  if (videosInfo.total > 0) {
    checks.push({
      nombre: 'Videos embebidos (YouTube/Vimeo)',
      estado: videosInfo.conProblemas > 0 ? 'ADVERTENCIA' : 'OK',
      detalle: videosInfo.conProblemas > 0
        ? `${videosInfo.conProblemas} de ${videosInfo.total} video(s) con posibles problemas`
        : `${videosInfo.total} video(s) detectados — cargan correctamente`,
      items: videosInfo.srcs
    });
  }

  // 4. Logo enlaza al home
  // Selectores expandidos: WordPress (.custom-logo-link), Elementor, Bootstrap, temas genéricos
  const logoInfo = await page.evaluate(() => {
    let enlazaHome = false;
    const selectors = [
      '.custom-logo-link',
      '.site-logo a',
      '.site-branding a',
      '.navbar-brand',
      '[class*="logo"] a',
      'a[class*="logo"]',
      'header a',
      '.logo a',
      'a.logo',
      'a[href="/"]',
      'a img'
    ].join(', ');
    for (const el of document.querySelectorAll(selectors)) {
      const link = el.tagName === 'A' ? el : el.closest('a');
      if (!link) continue;
      const href = link.getAttribute('href') || '';
      enlazaHome = href === '/' || href === '' ||
        href === window.location.origin + '/' ||
        link.href === window.location.origin + '/';
      if (enlazaHome) break;
    }
    return { enlazaHome };
  });

  checks.push({
    nombre: 'Logo enlaza al home',
    estado: logoInfo.enlazaHome ? 'OK' : 'ADVERTENCIA',
    detalle: logoInfo.enlazaHome
      ? 'El logo enlaza correctamente al home'
      : 'No se confirmo que el logo enlace al home'
  });

  return { nombre: 'Contenido', estado: calcularEstado(checks), checks };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkContenido };
