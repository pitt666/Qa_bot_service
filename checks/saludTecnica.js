/**
 * SECCION 1 — SALUD TECNICA
 * Links rotos, imagenes rotas, botones sin accion, SSL,
 * errores JS, errores 500, responsive, headers de seguridad, TTFB
 */

async function checkSaludTecnica({ url, page, erroresJS, requestsFallidos, httpStatus }) {
  const checks = [];

  // 1. HTTP Status
  const statusOk = httpStatus && httpStatus < 400;
  checks.push({
    nombre: 'Estado HTTP',
    estado: statusOk ? 'OK' : 'ERROR',
    detalle: statusOk ? `La pagina responde correctamente (${httpStatus})` : `La pagina responde con error ${httpStatus}`
  });

  // 2. HTTPS
  const esHttps = url.startsWith('https://');
  checks.push({
    nombre: 'HTTPS / SSL',
    estado: esHttps ? 'OK' : 'ERROR',
    detalle: esHttps ? 'El sitio usa HTTPS correctamente' : 'El sitio NO usa HTTPS — los datos no viajan cifrados'
  });

  // 3. Links rotos (verificar todos los <a href>)
  const linksRotos = await page.evaluate(async () => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const rotos = [];
    const internos = anchors.filter(a => {
      const href = a.getAttribute('href');
      return href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:');
    });

    // Verificar solo links internos (mismo dominio) para no hacer miles de requests
    const dominio = window.location.hostname;
    const internosMismoDominio = internos.filter(a => {
      try {
        const linkUrl = new URL(a.href, window.location.href);
        return linkUrl.hostname === dominio;
      } catch { return false; }
    }).slice(0, 30); // maximo 30 para no tardar demasiado

    for (const a of internosMismoDominio) {
      try {
        const resp = await fetch(a.href, { method: 'HEAD', cache: 'no-cache' });
        if (resp.status >= 400) {
          rotos.push({ url: a.href, status: resp.status, texto: a.textContent.trim().slice(0, 50) });
        }
      } catch {
        rotos.push({ url: a.href, status: 'Sin respuesta', texto: a.textContent.trim().slice(0, 50) });
      }
    }
    return rotos;
  });

  checks.push({
    nombre: 'Links rotos',
    estado: linksRotos.length === 0 ? 'OK' : 'ERROR',
    detalle: linksRotos.length === 0
      ? 'No se encontraron links rotos'
      : `${linksRotos.length} link(s) roto(s) encontrado(s)`,
    items: linksRotos.map(l => `${l.texto || '(sin texto)'} → ${l.url} [${l.status}]`)
  });

  // 4. Links rotos en el menu de navegacion especificamente
  const linksMenuRotos = await page.evaluate(async () => {
    const navSelectors = ['nav a[href]', 'header a[href]', '[role="navigation"] a[href]', '.menu a[href]', '.navbar a[href]'];
    const navLinks = new Set();
    for (const sel of navSelectors) {
      document.querySelectorAll(sel).forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
          navLinks.add({ href: a.href, texto: a.textContent.trim().slice(0, 50) });
        }
      });
    }
    const rotos = [];
    for (const link of navLinks) {
      try {
        const resp = await fetch(link.href, { method: 'HEAD', cache: 'no-cache' });
        if (resp.status >= 400) {
          rotos.push({ url: link.href, status: resp.status, texto: link.texto });
        }
      } catch {
        rotos.push({ url: link.href, status: 'Sin respuesta', texto: link.texto });
      }
    }
    return rotos;
  });

  checks.push({
    nombre: 'Links rotos en navegacion/menu',
    estado: linksMenuRotos.length === 0 ? 'OK' : 'ERROR',
    detalle: linksMenuRotos.length === 0
      ? 'Todos los links del menu funcionan'
      : `${linksMenuRotos.length} link(s) roto(s) en el menu`,
    items: linksMenuRotos.map(l => `"${l.texto}" → ${l.url} [${l.status}]`)
  });

  // 5. Imagenes rotas
  const imagenesRotas = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs
      .filter(img => !img.complete || img.naturalWidth === 0)
      .map(img => ({ src: img.src || img.getAttribute('src'), alt: img.alt || '(sin alt)' }))
      .slice(0, 20);
  });

  checks.push({
    nombre: 'Imagenes rotas',
    estado: imagenesRotas.length === 0 ? 'OK' : 'ERROR',
    detalle: imagenesRotas.length === 0
      ? 'No se encontraron imagenes rotas'
      : `${imagenesRotas.length} imagen(es) rota(s)`,
    items: imagenesRotas.map(i => `${i.alt} → ${i.src}`)
  });

  // 6. Botones sin accion
  const botonesVacios = await page.evaluate(() => {
    const botones = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
    const vacios = [];
    for (const btn of botones) {
      const tipo = btn.tagName.toLowerCase();
      const texto = btn.textContent.trim().slice(0, 60) || btn.value || '(sin texto)';
      const tieneAccion = btn.onclick ||
        btn.getAttribute('onclick') ||
        btn.getAttribute('data-href') ||
        btn.getAttribute('href') ||
        btn.closest('form') ||
        btn.type === 'submit';

      if (!tieneAccion) {
        vacios.push({ texto, tipo });
      }
    }

    // Tambien revisar <a> que parecen botones pero no tienen href util
    const anchorsBoton = Array.from(document.querySelectorAll('a.btn, a.button, a[class*="btn"], a[class*="cta"]'));
    for (const a of anchorsBoton) {
      const href = a.getAttribute('href');
      if (!href || href === '#' || href === 'javascript:void(0)' || href === 'javascript:;') {
        vacios.push({ texto: a.textContent.trim().slice(0, 60), tipo: 'enlace-boton sin destino' });
      }
    }
    return vacios;
  });

  checks.push({
    nombre: 'Botones sin accion',
    estado: botonesVacios.length === 0 ? 'OK' : 'ADVERTENCIA',
    detalle: botonesVacios.length === 0
      ? 'Todos los botones tienen accion definida'
      : `${botonesVacios.length} boton(es) sin accion detectado(s)`,
    items: botonesVacios.map(b => `"${b.texto}" (${b.tipo})`)
  });

  // 7. Errores JS
  const erroresCriticos = erroresJS.filter(e => !e.includes('Warning') && !e.includes('Deprecated'));
  checks.push({
    nombre: 'Errores JavaScript',
    estado: erroresCriticos.length === 0 ? 'OK' : erroresCriticos.length <= 2 ? 'ADVERTENCIA' : 'ERROR',
    detalle: erroresCriticos.length === 0
      ? 'No se detectaron errores de JavaScript'
      : `${erroresCriticos.length} error(es) JS detectado(s) — puede haber funcionalidad rota`,
    items: erroresCriticos.slice(0, 10).map(e => e.slice(0, 150))
  });

  // 8. Errores 500 en requests
  const errores500 = requestsFallidos.filter(r => r.motivo && (r.motivo.includes('500') || r.motivo.includes('ERR_')));
  checks.push({
    nombre: 'Errores de servidor (500)',
    estado: errores500.length === 0 ? 'OK' : 'ERROR',
    detalle: errores500.length === 0
      ? 'No se detectaron errores de servidor'
      : `${errores500.length} request(s) fallido(s) con error de servidor`,
    items: errores500.slice(0, 10).map(r => `${r.url} — ${r.motivo}`)
  });

  // 9. Headers de seguridad basicos
  const headersSeguridad = await page.evaluate(() => {
    // No podemos leer headers desde el browser directamente, pero podemos
    // detectar mixed content y otras señales
    const mixedContent = Array.from(document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"]'));
    return {
      mixedContent: mixedContent.map(el => el.src || el.href).slice(0, 5)
    };
  });

  checks.push({
    nombre: 'Contenido mixto (HTTP en HTTPS)',
    estado: headersSeguridad.mixedContent.length === 0 ? 'OK' : 'ADVERTENCIA',
    detalle: headersSeguridad.mixedContent.length === 0
      ? 'No se detectaron recursos HTTP inseguros'
      : `${headersSeguridad.mixedContent.length} recurso(s) cargando sin cifrado en un sitio HTTPS`,
    items: headersSeguridad.mixedContent
  });

  // 10. Responsive — detectar overflow horizontal
  const tieneOverflow = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    return body.scrollWidth > html.clientWidth + 10;
  });

  checks.push({
    nombre: 'Responsive — overflow horizontal',
    estado: tieneOverflow ? 'ADVERTENCIA' : 'OK',
    detalle: tieneOverflow
      ? 'La pagina tiene contenido que se sale del ancho en desktop — posible problema responsive'
      : 'No se detectaron problemas de overflow horizontal en desktop'
  });

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'Salud Tecnica',
    estado: estadoGeneral,
    checks
  };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkSaludTecnica };
