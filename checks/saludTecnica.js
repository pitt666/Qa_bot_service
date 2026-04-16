/**
 * SECCION 1 — SALUD TECNICA
 */
async function checkSaludTecnica({ url, page, erroresJS, httpStatus }) {
  const checks = [];

  if (httpStatus !== null && httpStatus !== undefined) {
    const esError = httpStatus >= 400;
    checks.push({
      nombre: 'Estado HTTP',
      estado: esError ? 'ERROR' : 'OK',
      detalle: esError
        ? `Pagina respondio HTTP ${httpStatus} — resultados del analisis pueden ser incorrectos (analiza la URL correcta)`
        : `HTTP ${httpStatus} — pagina accesible`
    });
  }

  const esHttps = url.startsWith('https://');
  checks.push({
    nombre: 'HTTPS / SSL',
    estado: esHttps ? 'OK' : 'ERROR',
    detalle: esHttps ? 'El sitio usa HTTPS correctamente' : 'El sitio NO usa HTTPS'
  });

  const dominiosExcluir = ['wa.link','bit.ly','t.co','goo.gl','ow.ly','tinyurl.com','rb.gy','cutt.ly','short.io','lnkd.in','fb.me','amzn.to'];

  const linksRotos = await page.evaluate(async (excluir) => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const dominio = window.location.hostname;
    const internos = anchors.filter(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;
      try {
        const u = new URL(a.href, window.location.href);
        if (excluir.some(d => u.hostname.includes(d))) return false;
        return u.hostname === dominio;
      } catch { return false; }
    }).slice(0, 20);
    const resultados = await Promise.all(
      internos.map(a => {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 5000);
        return fetch(a.href, { method: 'HEAD', cache: 'no-cache', signal: ctrl.signal })
          .then(r => ({ href: a.href, status: r.status, texto: a.textContent.trim().slice(0, 50) }))
          .catch(() => ({ href: a.href, status: 'Sin respuesta', texto: a.textContent.trim().slice(0, 50) }));
      })
    );
    return resultados
      .filter(({ status }) => status === 'Sin respuesta' || (typeof status === 'number' && status >= 400))
      .map(({ href, status, texto }) => ({ url: href, status, texto }));
  }, dominiosExcluir);

  checks.push({
    nombre: 'Links rotos',
    estado: linksRotos.length === 0 ? 'OK' : 'ERROR',
    detalle: linksRotos.length === 0 ? 'No se encontraron links rotos' : `${linksRotos.length} link(s) roto(s)`,
    items: linksRotos.map(l => `${l.texto || '(sin texto)'} \u2192 ${l.url} [${l.status}]`)
  });

  const linksMenuRotos = await page.evaluate(async (excluir) => {
    const navSelectors = ['nav a[href]', 'header a[href]', '[role="navigation"] a[href]', '.menu a[href]', '.navbar a[href]'];
    const navLinks = []; const vistos = new Set();
    const dominio = window.location.hostname;
    for (const sel of navSelectors) {
      document.querySelectorAll(sel).forEach(a => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
        try {
          const u = new URL(a.href, window.location.href);
          if (excluir.some(d => u.hostname.includes(d))) return;
          if (u.hostname !== dominio) return;
          if (!vistos.has(a.href)) { vistos.add(a.href); navLinks.push({ href: a.href, texto: a.textContent.trim().slice(0, 50) }); }
        } catch {}
      });
    }
    const resultados = await Promise.all(
      navLinks.map(link => {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 5000);
        return fetch(link.href, { method: 'HEAD', cache: 'no-cache', signal: ctrl.signal })
          .then(r => ({ link, status: r.status }))
          .catch(() => ({ link, status: 'Sin respuesta' }));
      })
    );
    return resultados
      .filter(({ status }) => status === 'Sin respuesta' || (typeof status === 'number' && status >= 400))
      .map(({ link, status }) => ({ url: link.href, status, texto: link.texto }));
  }, dominiosExcluir);

  checks.push({
    nombre: 'Links rotos en menu',
    estado: linksMenuRotos.length === 0 ? 'OK' : 'ERROR',
    detalle: linksMenuRotos.length === 0 ? 'Todos los links del menu funcionan' : `${linksMenuRotos.length} link(s) roto(s) en el menu`,
    items: linksMenuRotos.map(l => `"${l.texto}" \u2192 ${l.url} [${l.status}]`)
  });

  // Imagenes rotas — usar img.complete && naturalWidth === 0 para evitar falsos positivos con lazy loading
  const imagenesRotas = await page.evaluate(() => {
    const dominio = window.location.hostname;
    return Array.from(document.querySelectorAll('img'))
      .filter(img => img.complete && img.naturalWidth === 0)
      .map(img => {
        const src = img.src || img.getAttribute('src') || '';
        let esExterna = false;
        try { esExterna = new URL(src).hostname !== dominio; } catch {}
        return { src, alt: img.alt || '(sin alt)', esExterna };
      })
      .slice(0, 20);
  });

  const rotasInternas = imagenesRotas.filter(i => !i.esExterna);
  const rotasExternas = imagenesRotas.filter(i =>  i.esExterna);

  checks.push({
    nombre: 'Imagenes rotas',
    estado: rotasInternas.length > 0 ? 'ERROR' : rotasExternas.length > 0 ? 'ADVERTENCIA' : 'OK',
    detalle: imagenesRotas.length === 0
      ? 'No se encontraron imagenes rotas'
      : `${rotasInternas.length > 0 ? rotasInternas.length + ' interna(s) rota(s)' : ''}${rotasInternas.length > 0 && rotasExternas.length > 0 ? ' + ' : ''}${rotasExternas.length > 0 ? rotasExternas.length + ' externa(s) \u2014 puede ser anti-hotlinking' : ''}`,
    items: imagenesRotas.map(i => `${i.alt}${i.esExterna ? ' [externo]' : ''} \u2192 ${i.src}`)
  });

  const botonesVacios = await page.evaluate(() => {
    const vacios = [];
    for (const btn of document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')) {
      const texto = btn.textContent.trim().slice(0, 60) || btn.value || '(sin texto)';
      const tieneAccion = btn.onclick || btn.getAttribute('onclick') || btn.getAttribute('data-href') ||
        btn.getAttribute('href') || btn.closest('form') || btn.type === 'submit';
      if (!tieneAccion) vacios.push({ texto, tipo: btn.tagName.toLowerCase() });
    }
    for (const a of document.querySelectorAll('a.btn, a.button, a[class*="btn"], a[class*="cta"]')) {
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
    detalle: botonesVacios.length === 0 ? 'Todos los botones tienen accion definida' : `${botonesVacios.length} boton(es) sin accion`,
    items: botonesVacios.map(b => `"${b.texto}" (${b.tipo})`)
  });

  const erroresCriticos = erroresJS.filter(e => !e.includes('Warning') && !e.includes('Deprecated'));
  checks.push({
    nombre: 'Errores JavaScript',
    estado: erroresCriticos.length === 0 ? 'OK' : erroresCriticos.length <= 2 ? 'ADVERTENCIA' : 'ERROR',
    detalle: erroresCriticos.length === 0 ? 'No se detectaron errores de JavaScript' : `${erroresCriticos.length} error(es) JS`,
    items: erroresCriticos.slice(0, 10).map(e => e.slice(0, 150))
  });

  return { nombre: 'Salud Tecnica', estado: calcularEstado(checks), checks };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkSaludTecnica };
