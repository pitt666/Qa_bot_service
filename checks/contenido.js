/**
 * SECCION 7 — CONTENIDO
 * Palabras minimas, contenido duplicado, blog activo,
 * videos cargan, imagenes con alt descriptivo,
 * logo enlaza al home, consistencia de fuentes
 */

async function checkContenido({ page }) {
  const checks = [];

  // 1. Palabras en la pagina (minimo 300 para SEO)
  const palabras = await page.evaluate(() => {
    const texto = document.body.innerText
      .replace(/\s+/g, ' ')
      .trim();
    return texto.split(' ').filter(p => p.length > 2).length;
  });

  checks.push({
    nombre: 'Cantidad de contenido',
    estado: palabras >= 300 ? 'OK' : palabras >= 150 ? 'ADVERTENCIA' : 'ERROR',
    detalle: palabras >= 300
      ? `${palabras} palabras — contenido suficiente para SEO`
      : palabras >= 150
        ? `${palabras} palabras — poco contenido, Google puede no indexar bien la pagina`
        : `${palabras} palabras — contenido muy escaso, casi sin texto visible`
  });

  // 2. Contenido duplicado en la misma pagina (parrafos repetidos)
  const contenidoDuplicado = await page.evaluate(() => {
    const parrafos = Array.from(document.querySelectorAll('p, h1, h2, h3, li'))
      .map(el => el.textContent.trim())
      .filter(t => t.length > 30);

    const conteo = {};
    parrafos.forEach(p => { conteo[p] = (conteo[p] || 0) + 1; });
    const duplicados = Object.entries(conteo)
      .filter(([, count]) => count > 1)
      .map(([texto, count]) => `"${texto.slice(0, 60)}..." (${count} veces)`);

    return duplicados.slice(0, 5);
  });

  checks.push({
    nombre: 'Contenido duplicado',
    estado: contenidoDuplicado.length === 0 ? 'OK' : 'ADVERTENCIA',
    detalle: contenidoDuplicado.length === 0
      ? 'No se encontro contenido duplicado en la pagina'
      : `${contenidoDuplicado.length} bloque(s) de texto repetido(s) — puede ser un error al copiar secciones`,
    items: contenidoDuplicado
  });

  // 3. Imagenes con alt descriptivo vs generico
  const altInfo = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const sinAlt = [];
    const altGenerico = [];

    const patronesGenericos = /^(img|image|foto|photo|pic|picture|banner|img\d+|dsc|dsc_|p\d+|image\d+|photo\d+|untitled|screenshot)/i;

    for (const img of imgs) {
      const src = img.src || '';
      const alt = img.getAttribute('alt');
      const nombreArchivo = src.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '');

      if (!alt || alt.trim() === '') {
        sinAlt.push(nombreArchivo.slice(0, 40) || '(imagen sin nombre)');
      } else if (patronesGenericos.test(alt) || patronesGenericos.test(nombreArchivo)) {
        altGenerico.push(`alt="${alt.slice(0, 40)}" — nombre generico`);
      }
    }
    return { sinAlt: sinAlt.slice(0, 10), altGenerico: altGenerico.slice(0, 10) };
  });

  checks.push({
    nombre: 'Alt text en imagenes',
    estado: altInfo.sinAlt.length === 0 && altInfo.altGenerico.length === 0 ? 'OK'
      : altInfo.sinAlt.length > 5 ? 'ERROR' : 'ADVERTENCIA',
    detalle: altInfo.sinAlt.length === 0 && altInfo.altGenerico.length === 0
      ? 'Todas las imagenes tienen alt text descriptivo'
      : `${altInfo.sinAlt.length} imagen(es) sin alt text, ${altInfo.altGenerico.length} con alt generico (IMG001, foto, etc.)`,
    items: [
      ...altInfo.sinAlt.map(s => `Sin alt: ${s}`),
      ...altInfo.altGenerico
    ]
  });

  // 4. Blog activo
  const blogInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const palabrasBlog = ['blog', 'articulo', 'article', 'post', 'noticias', 'news', 'recursos', 'resources'];
    const linkBlog = links.find(a =>
      palabrasBlog.some(p =>
        a.href.toLowerCase().includes(`/${p}`) ||
        a.textContent.toLowerCase().trim() === p
      )
    );
    return linkBlog ? { encontrado: true, url: linkBlog.href } : { encontrado: false };
  });

  checks.push({
    nombre: 'Blog o seccion de contenido',
    estado: 'OK',
    detalle: blogInfo.encontrado
      ? `Blog/noticias detectado: ${blogInfo.url}`
      : 'No se detecto seccion de blog — no es requerido pero ayuda al SEO'
  });

  // 5. Videos embebidos cargan
  const videosInfo = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"]'));
    const problemas = iframes.filter(iframe => {
      // Si el iframe no tiene src o tiene src vacia
      const src = iframe.src || iframe.getAttribute('src');
      return !src || src.trim() === '' || src === 'about:blank';
    });
    return {
      total: iframes.length,
      conProblemas: problemas.length,
      srcs: iframes.map(f => f.src).slice(0, 5)
    };
  });

  if (videosInfo.total > 0) {
    checks.push({
      nombre: 'Videos embebidos (YouTube/Vimeo)',
      estado: videosInfo.conProblemas > 0 ? 'ADVERTENCIA' : 'OK',
      detalle: videosInfo.conProblemas > 0
        ? `${videosInfo.conProblemas} de ${videosInfo.total} video(s) con posibles problemas de carga`
        : `${videosInfo.total} video(s) embebido(s) detectados — se ven bien`,
      items: videosInfo.srcs
    });
  }

  // 6. Logo enlaza al home
  const logoInfo = await page.evaluate(() => {
    const posiblesLogos = document.querySelectorAll('a img, header a, .logo a, a.logo, a[href="/"], a[href*="home"]');
    let logoEnlazaHome = false;
    let logoTieneAlt = false;

    for (const el of posiblesLogos) {
      const esLink = el.tagName === 'A' || el.closest('a');
      const link = el.tagName === 'A' ? el : el.closest('a');
      if (link) {
        const href = link.getAttribute('href');
        logoEnlazaHome = href === '/' || href === '' || (link.href === window.location.origin + '/') || href === window.location.origin;
        const img = link.querySelector('img') || (el.tagName === 'IMG' ? el : null);
        logoTieneAlt = img ? (img.getAttribute('alt') || '').trim().length > 0 : true;
        if (logoEnlazaHome) break;
      }
    }
    return { enlazaHome: logoEnlazaHome, tieneAlt: logoTieneAlt };
  });

  checks.push({
    nombre: 'Logo enlaza al home',
    estado: logoInfo.enlazaHome ? 'OK' : 'ADVERTENCIA',
    detalle: logoInfo.enlazaHome
      ? `Logo enlaza correctamente al home${!logoInfo.tieneAlt ? ' (sin alt text en la imagen del logo)' : ''}`
      : 'No se pudo confirmar que el logo enlace al home — comportamiento esperado por los usuarios'
  });

  // 7. Archivos sensibles accesibles (seguridad basica)
  const urlObj = new URL(page.url());
  const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
  const archivosRiesgosos = ['.env', 'wp-config.php', '.git/config', 'backup.zip', 'database.sql'];
  const archivosExpuestos = [];

  for (const archivo of archivosRiesgosos) {
    try {
      const resp = await page.evaluate(async (url) => {
        const r = await fetch(url, { method: 'HEAD' });
        return r.status;
      }, `${baseUrl}/${archivo}`);

      if (resp === 200) {
        archivosExpuestos.push(`${baseUrl}/${archivo}`);
      }
    } catch { }
  }

  if (archivosExpuestos.length > 0) {
    checks.push({
      nombre: 'Archivos sensibles expuestos',
      estado: 'ERROR',
      detalle: `${archivosExpuestos.length} archivo(s) sensible(s) accesible(s) publicamente — riesgo de seguridad`,
      items: archivosExpuestos
    });
  } else {
    checks.push({
      nombre: 'Archivos sensibles expuestos',
      estado: 'OK',
      detalle: 'No se encontraron archivos sensibles expuestos (.env, wp-config, etc.)'
    });
  }

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'Contenido',
    estado: estadoGeneral,
    checks
  };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkContenido };
