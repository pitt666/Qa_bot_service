/**
 * SECCION 10 — SEO
 */

const https = require('https');
const http = require('http');

async function checkSEO({ url, page }) {
  const checks = [];

  const d = await page.evaluate(() => {
    const title = document.title || '';
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim().slice(0, 80));
    const h2s = Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim().slice(0, 60));
    const h3s = document.querySelectorAll('h3').length;
    const h4s = document.querySelectorAll('h4').length;
    const allH = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => parseInt(h.tagName[1]));
    const saltos = [];
    for (let i = 1; i < allH.length; i++) if (allH[i] - allH[i-1] > 1) saltos.push(`H${allH[i-1]}\u2192H${allH[i]}`);
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null;
    const robotsMeta = document.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
    const estaNoIndex = robotsMeta.toLowerCase().includes('noindex');
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || null;
    const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || null;
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;
    const twitterCard = document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || null;
    const schemas = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => { try { const d = JSON.parse(s.textContent); return d['@type'] || 'Schema'; } catch { return null; } }).filter(Boolean);
    const dominioActual = window.location.hostname;
    const linksInternos = Array.from(document.querySelectorAll('a[href]')).filter(a => { try { return new URL(a.href).hostname === dominioActual; } catch { return false; } }).length;
    const urlActual = window.location.href;
    return { title, metaDesc, h1s, h2s: h2s.slice(0,5), h3s, h4s, saltos: saltos.slice(0,5), canonical, estaNoIndex, robotsMeta, ogTitle, ogDescription, ogImage, twitterCard, schemas, linksInternos, urlActual };
  });

  const tLen = d.title.length;
  checks.push({ nombre: 'Title', estado: !d.title ? 'ERROR' : (tLen < 30 || tLen > 60) ? 'ADVERTENCIA' : 'OK', detalle: !d.title ? 'Sin titulo' : `"${d.title.slice(0,60)}" (${tLen} chars)` });

  const dLen = d.metaDesc.length;
  checks.push({ nombre: 'Meta description', estado: !d.metaDesc ? 'ERROR' : (dLen < 120 || dLen > 160) ? 'ADVERTENCIA' : 'OK', detalle: !d.metaDesc ? 'Sin meta description' : `${dLen} chars` });

  checks.push({ nombre: 'H1', estado: d.h1s.length === 0 ? 'ERROR' : d.h1s.length > 1 ? 'ADVERTENCIA' : 'OK', detalle: d.h1s.length === 0 ? 'Sin H1' : d.h1s.length > 1 ? `${d.h1s.length} H1 encontrados` : `"${d.h1s[0]}"` });

  checks.push({ nombre: 'Estructura H2-H6', estado: d.saltos.length > 0 ? 'ADVERTENCIA' : 'OK', detalle: d.saltos.length > 0 ? `Saltos: ${d.saltos.join(', ')}` : `H1:${d.h1s.length} H2:${d.h2s.length} H3:${d.h3s} H4:${d.h4s}`, items: d.h2s.map(h => `H2: "${h}"`) });

  checks.push({ nombre: 'No-index', estado: d.estaNoIndex ? 'ERROR' : 'OK', detalle: d.estaNoIndex ? `PAGINA BLOQUEADA — meta robots: "${d.robotsMeta}"` : 'Sin restricciones de indexacion' });

  checks.push({ nombre: 'Canonical', estado: d.canonical ? 'OK' : 'ADVERTENCIA', detalle: d.canonical ? `Canonical: ${d.canonical}` : 'Sin canonical' });

  const ogCompleto = d.ogTitle && d.ogDescription && d.ogImage;
  checks.push({ nombre: 'Open Graph', estado: ogCompleto ? 'OK' : d.ogTitle ? 'ADVERTENCIA' : 'ERROR', detalle: ogCompleto ? 'OG tags completos' : !d.ogTitle ? 'Sin Open Graph tags' : 'OG incompleto', items: [d.ogTitle && `og:title: "${d.ogTitle.slice(0,60)}"`, d.ogImage && `og:image: ${d.ogImage.slice(0,80)}`].filter(Boolean) });

  checks.push({ nombre: 'Twitter/X Card', estado: d.twitterCard ? 'OK' : 'ADVERTENCIA', detalle: d.twitterCard ? `Twitter Card: "${d.twitterCard}"` : 'Sin Twitter Card' });

  checks.push({ nombre: 'Schema markup', estado: d.schemas.length > 0 ? 'OK' : 'ADVERTENCIA', detalle: d.schemas.length > 0 ? `Schema: ${d.schemas.join(', ')}` : 'Sin schema markup' });

  checks.push({ nombre: 'Links internos', estado: d.linksInternos >= 3 ? 'OK' : d.linksInternos >= 1 ? 'ADVERTENCIA' : 'ERROR', detalle: `${d.linksInternos} link(s) interno(s)` });

  const urlProblemas = /[A-Z]/.test(d.urlActual.split('?')[0]) || d.urlActual.includes('%20');
  checks.push({ nombre: 'URL limpia', estado: urlProblemas ? 'ADVERTENCIA' : 'OK', detalle: urlProblemas ? `URL con problemas: ${d.urlActual}` : 'URL correcta' });

  const origin = new URL(url).origin;
  const sitemapPaths = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap-index.xml'];
  let sitemapEncontrado = null;
  for (const p of sitemapPaths) {
    const status = await verificarURL(origin + p);
    if (status === 200 || status === 301 || status === 302) { sitemapEncontrado = p; break; }
  }
  let sitemapDesdeRobots = null;
  if (!sitemapEncontrado) {
    const robotsTxt = await leerTexto(origin + '/robots.txt');
    if (robotsTxt) {
      const match = robotsTxt.match(/^\s*sitemap\s*:\s*(\S+)/im);
      if (match) sitemapDesdeRobots = match[1].trim();
    }
  }
  checks.push({
    nombre: 'Sitemap.xml',
    estado: (sitemapEncontrado || sitemapDesdeRobots) ? 'OK' : 'ADVERTENCIA',
    detalle: sitemapEncontrado ? `Accesible en ${origin}${sitemapEncontrado}` : sitemapDesdeRobots ? `Declarado en robots.txt: ${sitemapDesdeRobots}` : `No encontrado en rutas comunes: ${sitemapPaths.join(', ')}`
  });

  const robotsOk = await verificarURL(origin + '/robots.txt');
  checks.push({ nombre: 'Robots.txt', estado: (robotsOk === 200 || robotsOk === 301 || robotsOk === 302) ? 'OK' : 'ADVERTENCIA', detalle: (robotsOk === 200 || robotsOk === 301 || robotsOk === 302) ? `Accesible en ${origin}/robots.txt` : 'No encontrado' });

  return { nombre: 'SEO', estado: calcularEstado(checks), checks };
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function verificarURL(url) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 5000, headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res => resolve(res.statusCode));
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function leerTexto(url) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 5000, headers: { 'User-Agent': UA, 'Accept': 'text/plain,*/*' } }, res => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; if (data.length > 50000) { req.destroy(); resolve(data); } });
      res.on('end', () => resolve(data));
    });
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
