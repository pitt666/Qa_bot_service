/**
 * SECCION 10 — SEO
 * Title, description, H1-H6 estructura, canonical, no-index,
 * OG tags, Twitter Card, Schema, Sitemap, Robots.txt,
 * alt imagenes, URLs limpias, links internos, LCP basico
 */

const https = require('https');
const http = require('http');

async function checkSEO({ url, page }) {
  const checks = [];

  const seoData = await page.evaluate(() => {
    // Title
    const title = document.title || '';

    // Meta description
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

    // Encabezados
    const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim().slice(0, 80));
    const h2s = Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim().slice(0, 60));
    const h3s = Array.from(document.querySelectorAll('h3')).length;
    const h4s = Array.from(document.querySelectorAll('h4')).length;
    const h5s = Array.from(document.querySelectorAll('h5')).length;
    const h6s = Array.from(document.querySelectorAll('h6')).length;

    // Detectar saltos en jerarquia (H1 → H3 sin H2)
    const todosEncabezados = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .map(h => parseInt(h.tagName.replace('H', '')));
    let saltosJerarquia = [];
    for (let i = 1; i < todosEncabezados.length; i++) {
      if (todosEncabezados[i] - todosEncabezados[i - 1] > 1) {
        saltosJerarquia.push(`H${todosEncabezados[i - 1]} → H${todosEncabezados[i]}`);
      }
    }

    // Canonical
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null;

    // No-index
    const robotsMeta = document.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
    const estaNoIndex = robotsMeta.toLowerCase().includes('noindex');

    // OG Tags
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || null;
    const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || null;
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;
    const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content') || null;

    // Twitter Card
    const twitterCard = document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || null;
    const twitterImage = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || null;

    // Schema markup
    const schemas = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map(s => {
        try {
          const data = JSON.parse(s.textContent);
          return data['@type'] || (Array.isArray(data) ? data.map(d => d['@type']).join(', ') : 'Schema sin tipo');
        } catch { return null; }
      })
      .filter(Boolean);

    // Idioma declarado
    const idioma = document.documentElement.getAttribute('lang') || null;

    // Links internos
    const dominioActual = window.location.hostname;
    const linksInternos = Array.from(document.querySelectorAll('a[href]'))
      .filter(a => {
        try {
          return new URL(a.href).hostname === dominioActual;
        } catch { return false; }
      }).length;

    // URL actual
    const urlActual = window.location.href;

    // Favicon
    const favicon = document.querySelector('link[rel*="icon"]')?.href || null;

    return {
      title, metaDesc, h1s, h2s: h2s.slice(0, 5), h3s, h4s, h5s, h6s,
      saltosJerarquia: saltosJerarquia.slice(0, 5),
      canonical, estaNoIndex, robotsMeta,
      ogTitle, ogDescription, ogImage, ogUrl,
      twitterCard, twitterImage,
      schemas,
      idioma, linksInternos, urlActual, favicon
    };
  });

  // 1. Title
  const tituloLen = seoData.title.length;
  checks.push({
    nombre: 'Title (titulo de pagina)',
    estado: !seoData.title ? 'ERROR' : tituloLen < 30 ? 'ADVERTENCIA' : tituloLen > 60 ? 'ADVERTENCIA' : 'OK',
    detalle: !seoData.title
      ? 'Sin titulo — critico para SEO'
      : tituloLen < 30
        ? `"${seoData.title}" — muy corto (${tituloLen} chars, recomendado 50-60)`
        : tituloLen > 60
          ? `"${seoData.title.slice(0, 60)}..." — muy largo (${tituloLen} chars, se corta en Google)`
          : `"${seoData.title}" — longitud correcta (${tituloLen} chars)`
  });

  // 2. Meta description
  const descLen = seoData.metaDesc.length;
  checks.push({
    nombre: 'Meta description',
    estado: !seoData.metaDesc ? 'ERROR' : descLen < 120 ? 'ADVERTENCIA' : descLen > 160 ? 'ADVERTENCIA' : 'OK',
    detalle: !seoData.metaDesc
      ? 'Sin meta description — Google generara una automaticamente (puede no ser la ideal)'
      : descLen < 120
        ? `Demasiado corta (${descLen} chars, recomendado 120-160): "${seoData.metaDesc.slice(0, 80)}..."`
        : descLen > 160
          ? `Demasiado larga (${descLen} chars, se corta en resultados de busqueda)`
          : `Correcta (${descLen} chars)`
  });

  // 3. H1
  checks.push({
    nombre: 'H1 (titulo principal)',
    estado: seoData.h1s.length === 0 ? 'ERROR' : seoData.h1s.length > 1 ? 'ADVERTENCIA' : 'OK',
    detalle: seoData.h1s.length === 0
      ? 'Sin H1 — cada pagina debe tener exactamente un H1'
      : seoData.h1s.length > 1
        ? `${seoData.h1s.length} H1 encontrados — debe haber solo uno. Encontrados: ${seoData.h1s.join(' / ')}`
        : `H1: "${seoData.h1s[0]}"`
  });

  // 4. Estructura de encabezados H2-H6
  const tieneH2 = seoData.h2s.length > 0;
  checks.push({
    nombre: 'Estructura de encabezados (H2-H6)',
    estado: seoData.saltosJerarquia.length > 0 ? 'ADVERTENCIA' : 'OK',
    detalle: seoData.saltosJerarquia.length > 0
      ? `Saltos de jerarquia detectados: ${seoData.saltosJerarquia.join(', ')} — puede afectar SEO y accesibilidad`
      : `Estructura correcta — H1:${seoData.h1s.length} H2:${seoData.h2s.length} H3:${seoData.h3s} H4:${seoData.h4s}`,
    items: tieneH2 ? seoData.h2s.map(h => `H2: "${h}"`) : []
  });

  // 5. No-index accidental
  checks.push({
    nombre: 'No-index',
    estado: seoData.estaNoIndex ? 'ERROR' : 'OK',
    detalle: seoData.estaNoIndex
      ? `PAGINA BLOQUEADA PARA GOOGLE — meta robots: "${seoData.robotsMeta}" — Google NO indexara esta pagina`
      : 'La pagina no tiene restricciones de indexacion'
  });

  // 6. Canonical
  checks.push({
    nombre: 'URL Canonical',
    estado: seoData.canonical ? 'OK' : 'ADVERTENCIA',
    detalle: seoData.canonical
      ? `Canonical configurado: ${seoData.canonical}`
      : 'Sin canonical — puede haber problemas de contenido duplicado si la URL tiene multiples versiones'
  });

  // 7. Open Graph tags
  const ogCompleto = seoData.ogTitle && seoData.ogDescription && seoData.ogImage;
  checks.push({
    nombre: 'Open Graph (compartir en redes)',
    estado: ogCompleto ? 'OK' : seoData.ogTitle ? 'ADVERTENCIA' : 'ERROR',
    detalle: ogCompleto
      ? 'OG tags completos — el sitio se vera bien al compartir en Facebook, WhatsApp, etc.'
      : !seoData.ogTitle
        ? 'Sin Open Graph tags — al compartir el link en redes no mostrara imagen ni descripcion'
        : `OG incompleto — falta: ${[!seoData.ogTitle && 'og:title', !seoData.ogDescription && 'og:description', !seoData.ogImage && 'og:image'].filter(Boolean).join(', ')}`,
    items: [
      seoData.ogTitle ? `og:title: "${seoData.ogTitle.slice(0, 60)}"` : null,
      seoData.ogImage ? `og:image: ${seoData.ogImage.slice(0, 80)}` : null
    ].filter(Boolean)
  });

  // 8. Twitter/X Card
  checks.push({
    nombre: 'Twitter/X Card',
    estado: seoData.twitterCard ? 'OK' : 'ADVERTENCIA',
    detalle: seoData.twitterCard
      ? `Twitter Card configurada: "${seoData.twitterCard}"${seoData.twitterImage ? '' : ' — sin imagen de Twitter'}`
      : 'Sin Twitter Card — el link se vera basico al compartir en Twitter/X'
  });

  // 9. Schema markup
  checks.push({
    nombre: 'Schema / Datos estructurados',
    estado: seoData.schemas.length > 0 ? 'OK' : 'ADVERTENCIA',
    detalle: seoData.schemas.length > 0
      ? `Schema detectado: ${seoData.schemas.join(', ')}`
      : 'Sin schema markup — agregar LocalBusiness, FAQ u Organization ayuda a Google a entender tu negocio',
  });

  // 10. Idioma declarado
  checks.push({
    nombre: 'Idioma declarado en HTML',
    estado: seoData.idioma ? 'OK' : 'ADVERTENCIA',
    detalle: seoData.idioma
      ? `Idioma declarado: lang="${seoData.idioma}"`
      : 'Sin atributo lang en el HTML — importante para SEO y accesibilidad'
  });

  // 11. Links internos
  checks.push({
    nombre: 'Links internos',
    estado: seoData.linksInternos >= 3 ? 'OK' : seoData.linksInternos >= 1 ? 'ADVERTENCIA' : 'ERROR',
    detalle: seoData.linksInternos >= 3
      ? `${seoData.linksInternos} links internos — buena estructura de navegacion`
      : seoData.linksInternos >= 1
        ? `Solo ${seoData.linksInternos} link(s) interno(s) — agregar mas mejora el SEO`
        : 'Sin links internos — Google no puede navegar hacia otras paginas del sitio'
  });

  // 12. URL limpia
  const urlTieneProblemas = /[A-Z]/.test(seoData.urlActual.split('?')[0]) ||
    seoData.urlActual.includes(' ') ||
    seoData.urlActual.includes('%20');

  checks.push({
    nombre: 'URL limpia',
    estado: urlTieneProblemas ? 'ADVERTENCIA' : 'OK',
    detalle: urlTieneProblemas
      ? `URL con posibles problemas: ${seoData.urlActual}`
      : 'URL limpia y correcta'
  });

  // 13. Sitemap
  const sitemapUrl = new URL(url).origin + '/sitemap.xml';
  const sitemapEstado = await verificarURL(sitemapUrl);
  checks.push({
    nombre: 'Sitemap.xml',
    estado: sitemapEstado === 200 ? 'OK' : 'ADVERTENCIA',
    detalle: sitemapEstado === 200
      ? `Sitemap accesible en ${sitemapUrl}`
      : `Sitemap no encontrado en ${sitemapUrl} — sin sitemap Google tarda mas en indexar`
  });

  // 14. Robots.txt
  const robotsUrl = new URL(url).origin + '/robots.txt';
  const robotsEstado = await verificarURL(robotsUrl);
  checks.push({
    nombre: 'Robots.txt',
    estado: robotsEstado === 200 ? 'OK' : 'ADVERTENCIA',
    detalle: robotsEstado === 200
      ? `Robots.txt accesible en ${robotsUrl}`
      : `Robots.txt no encontrado — recomendado tenerlo aunque sea basico`
  });

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'SEO',
    estado: estadoGeneral,
    checks
  };
}

function verificarURL(url) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 5000 }, res => resolve(res.statusCode));
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkSEO };
