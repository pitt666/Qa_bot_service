/**
 * SECCION 5 — NEGOCIO Y CONFIANZA
 */
const tls = require('tls');

async function checkNegocio({ url, page }) {
  const checks = [];

  // 1. WhatsApp — INFORMATIVO (no todo negocio lo usa)
  const whatsappInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll(
      'a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href*="whatsapp.com/send"], a[href*="wa.link"], a[href*="web.whatsapp.com"]'
    ));
    const numeros = links.map(a => {
      const match = a.href.match(/(?:wa\.me\/|phone=)(\d+)/);
      return {
        numero: match ? `+${match[1]}` : 'numero no extraible',
        texto: a.textContent.trim().slice(0, 40) || a.getAttribute('aria-label') || 'boton sin texto',
        ubicacion: a.closest('header') ? 'header' : a.closest('footer') ? 'footer' : 'cuerpo'
      };
    });
    const widgets = document.querySelectorAll(
      '[class*="whatsapp"], [id*="whatsapp"], [class*="wa-"], [id*="wa-"], [class*="wp-float"], [class*="float-whats"], [class*="ws-float"], [class*="chat-whatsapp"], img[src*="whatsapp"]'
    );
    return { numeros, widgetDetectado: widgets.length > 0 };
  });
  const tieneWA = whatsappInfo.numeros.length > 0 || whatsappInfo.widgetDetectado;
  checks.push({
    nombre: 'WhatsApp',
    estado: tieneWA ? 'OK' : 'INFORMATIVO',
    detalle: tieneWA
      ? `${whatsappInfo.numeros.length} boton(es) de WhatsApp${whatsappInfo.widgetDetectado ? ' + widget flotante' : ''}`
      : 'Sin boton de WhatsApp (informativo)',
    items: whatsappInfo.numeros.map(n => `${n.numero} — "${n.texto}" (${n.ubicacion})`)
  });

  // 2. Telefono clickeable — real check
  const telefonosInfo = await page.evaluate(() => {
    const clickeables = Array.from(document.querySelectorAll('a[href^="tel:"]')).map(a => ({
      numero: decodeURIComponent(a.href.replace('tel:', '').trim()),
      texto: a.textContent.trim().slice(0, 40) || a.getAttribute('aria-label') || ''
    }));
    return { clickeables };
  });
  checks.push({
    nombre: 'Telefono clickeable',
    estado: telefonosInfo.clickeables.length > 0 ? 'OK' : 'ADVERTENCIA',
    detalle: telefonosInfo.clickeables.length > 0
      ? `${telefonosInfo.clickeables.length} numero(s) con href=tel:`
      : 'Sin telefono clickeable — agregar <a href="tel:..."> para mobile',
    items: telefonosInfo.clickeables.map(t => `${t.numero}${t.texto ? ` — "${t.texto}"` : ''}`)
  });

  // 3. Correo clickeable — INFORMATIVO
  const emailInfo = await page.evaluate(() => {
    const clickeables = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => ({
      email: decodeURIComponent(a.href.replace('mailto:', '').split('?')[0].trim()),
      texto: a.textContent.trim().slice(0, 40) || ''
    }));
    return { clickeables };
  });
  checks.push({
    nombre: 'Correo clickeable',
    estado: emailInfo.clickeables.length > 0 ? 'OK' : 'INFORMATIVO',
    detalle: emailInfo.clickeables.length > 0
      ? `${emailInfo.clickeables.length} correo(s) con href=mailto:`
      : 'Sin correo clickeable (informativo)',
    items: emailInfo.clickeables.map(e => `${e.email}${e.texto ? ` — "${e.texto}"` : ''}`)
  });

  // 4. Direccion fisica — INFORMATIVO (negocios online no la tienen)
  const dirInfo = await page.evaluate(() => {
    if (document.querySelector('iframe[src*="google.com/maps"], iframe[src*="maps.googleapis"], a[href*="maps.google"], a[href*="goo.gl/maps"], a[href*="maps.app.goo.gl"]'))
      return { tiene: true, como: 'Mapa de Google embebido o enlace' };
    if (document.querySelector('[itemtype*="PostalAddress"], [itemprop="streetAddress"], [itemprop="addressLocality"]'))
      return { tiene: true, como: 'Schema.org PostalAddress' };
    if (document.querySelector('address'))
      return { tiene: true, como: 'Etiqueta <address>' };
    const texto = document.body.innerText;
    const patrones = [
      { re: /\bC\.?P\.?\s*\d{5}\b/i,                                                             label: 'codigo postal' },
      { re: /\b(calle|av\.|avenida|blvd\.?|boulevard|calzada|carretera|privada|andador|circuito|paseo)\b/i, label: 'tipo de via' },
      { re: /#\s*\d+|\bNo\.?\s*\d+|\bInt\.?\s*\d+|\bExt\.?\s*\d+/i,                            label: 'numeracion' },
      { re: /\b(col\.|colonia|fracc\.|fraccionamiento|manzana|lote)\b/i,                          label: 'colonia' },
      { re: /\b(municipio|alcald[i\u00ed]a|delegaci[o\u00f3]n)\b/i,                               label: 'municipio/alcaldia' },
    ];
    const hits = patrones.filter(p => p.re.test(texto));
    if (hits.length >= 2) return { tiene: true, como: `Patrones: ${hits.map(h => h.label).join(', ')}` };
    return { tiene: false };
  });
  checks.push({
    nombre: 'Direccion fisica',
    estado: dirInfo.tiene ? 'OK' : 'INFORMATIVO',
    detalle: dirInfo.tiene
      ? `Direccion detectada — ${dirInfo.como}`
      : 'Sin direccion fisica (informativo — no aplica para negocios online)'
  });

  // 5. Favicon — verificacion robusta
  const favicon = await page.evaluate(async () => {
    // 1. Buscar cualquier link tag de icono
    const linkTag = document.querySelector('link[rel*="icon"], link[rel="shortcut icon"]');
    if (linkTag) {
      const href = linkTag.getAttribute('href') || '(sin href)';
      return { ok: true, como: `tag <link rel="${linkTag.getAttribute('rel')}"> — ${href.slice(0, 60)}` };
    }
    // 2. Probar rutas comunes de favicon
    for (const path of ['/favicon.ico', '/favicon.png', '/favicon.svg']) {
      try {
        const r = await fetch(path, { method: 'HEAD', cache: 'no-cache' });
        if (r.ok) return { ok: true, como: `${path} disponible (HTTP ${r.status})` };
      } catch {}
    }
    return { ok: false };
  });
  checks.push({
    nombre: 'Favicon',
    estado: favicon.ok ? 'OK' : 'ADVERTENCIA',
    detalle: favicon.ok ? `Favicon configurado — ${favicon.como}` : 'Sin favicon'
  });

  // 6. Aviso de cookies / GDPR — real check (requerido para Google Ads + Facebook Ads)
  const tieneCookies = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    return !!document.querySelector('[class*="cookie"], [id*="cookie"], [class*="gdpr"], [class*="consent"], [class*="aviso"]') ||
      ['cookie', 'consentimiento', 'aceptar', 'gdpr'].filter(p => texto.includes(p)).length >= 2;
  });
  checks.push({
    nombre: 'Aviso de cookies / GDPR',
    estado: tieneCookies ? 'OK' : 'ADVERTENCIA',
    detalle: tieneCookies
      ? 'Aviso de cookies detectado'
      : 'Sin aviso de cookies — requerido para Google Ads y Facebook Ads (remarketing)'
  });

  // 7. Documentos legales — verificar las 3 politicas
  const legal = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const texto = document.body.innerText.toLowerCase();
    // Verifica si algún link (texto o URL) contiene las palabras, o si el texto de la pagina las contiene
    const check = (palabras) =>
      links.some(a => palabras.some(p => a.textContent.toLowerCase().includes(p) || (a.href || '').toLowerCase().includes(p))) ||
      palabras.some(p => texto.includes(p));
    return {
      privacidad: check(['privacidad', 'privacy', 'aviso de privacidad', 'aviso-de-privacidad', 'politica de privacidad', 'politica-de-privacidad']),
      terminos:   check(['terminos y condiciones', 'términos y condiciones', 'terms and conditions', 'terms of service', 'aviso legal', 'aviso-legal', 'condiciones de uso']),
      cookies:    check(['politica de cookies', 'política de cookies', 'cookie policy', 'cookie-policy', 'politica-cookies'])
    };
  });
  const encontrados = [
    legal.privacidad && 'Politica de privacidad',
    legal.terminos   && 'Terminos y condiciones',
    legal.cookies    && 'Politica de cookies'
  ].filter(Boolean);
  const faltantes = [
    !legal.privacidad && 'Politica de privacidad',
    !legal.terminos   && 'Terminos y condiciones',
    !legal.cookies    && 'Politica de cookies'
  ].filter(Boolean);
  checks.push({
    nombre: 'Documentos legales',
    estado: encontrados.length === 3 ? 'OK' : encontrados.length > 0 ? 'ADVERTENCIA' : 'ERROR',
    detalle: encontrados.length === 3
      ? `Documentos legales completos: ${encontrados.join(', ')}`
      : encontrados.length > 0
        ? `Encontrado: ${encontrados.join(', ')} — Falta: ${faltantes.join(', ')}`
        : 'Sin documentos legales — obligatorio si tienes formularios, tracking o campanias',
    items: faltantes.map(f => `Falta crear: ${f}`)
  });

  // 8. Redes sociales — real check
  const redes = await page.evaluate(() => {
    const plataformas = [
      { nombre: 'Facebook',    dominios: ['facebook.com', 'fb.com', 'fb.me'] },
      { nombre: 'Instagram',   dominios: ['instagram.com'] },
      { nombre: 'YouTube',     dominios: ['youtube.com', 'youtu.be'] },
      { nombre: 'Twitter / X', dominios: ['twitter.com', 'x.com'] },
      { nombre: 'TikTok',      dominios: ['tiktok.com'] },
      { nombre: 'LinkedIn',    dominios: ['linkedin.com'] },
      { nombre: 'Pinterest',   dominios: ['pinterest.com'] },
      { nombre: 'Telegram',    dominios: ['t.me', 'telegram.me'] },
    ];
    const links = Array.from(document.querySelectorAll('a[href]'));
    return plataformas.map(({ nombre, dominios }) => {
      const link = links.find(a => dominios.some(d => (a.href || '').toLowerCase().includes(d)));
      return link ? { red: nombre, url: link.href } : null;
    }).filter(Boolean);
  });
  checks.push({
    nombre: 'Links a redes sociales',
    estado: redes.length > 0 ? 'OK' : 'ADVERTENCIA',
    detalle: redes.length > 0
      ? `${redes.length} red(es): ${redes.map(r => r.red).join(', ')}`
      : 'No se detectaron links a redes sociales',
    items: redes.map(r => `${r.red}: ${r.url}`)
  });

  // 9. SSL
  const sslInfo = await verificarSSL(url);
  checks.push(sslInfo);

  return { nombre: 'Negocio y Confianza', estado: calcularEstado(checks), checks };
}

function verificarSSL(url) {
  return new Promise(resolve => {
    try {
      const hostname = new URL(url).hostname;
      const socket = tls.connect(443, hostname, { servername: hostname }, () => {
        const cert = socket.getPeerCertificate(); socket.destroy();
        if (!cert || !cert.valid_to) return resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'No se pudo obtener info del certificado' });
        const dias = Math.floor((new Date(cert.valid_to) - new Date()) / (1000 * 60 * 60 * 24));
        if (dias < 0)       resolve({ nombre: 'Certificado SSL', estado: 'ERROR',       detalle: 'El certificado SSL ha EXPIRADO' });
        else if (dias < 15) resolve({ nombre: 'Certificado SSL', estado: 'ERROR',       detalle: `Vence en ${dias} dias — URGENTE renovar` });
        else if (dias < 30) resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: `Vence en ${dias} dias — renovar pronto` });
        else                resolve({ nombre: 'Certificado SSL', estado: 'OK',          detalle: `Valido, vence en ${dias} dias` });
      });
      socket.on('error', () => resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'No se pudo verificar el certificado' }));
      socket.setTimeout(5000, () => { socket.destroy(); resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'Timeout al verificar SSL' }); });
    } catch { resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'No se pudo verificar el certificado' }); }
  });
}

function calcularEstado(checks) {
  const reales = checks.filter(c => c.estado !== 'INFORMATIVO');
  if (reales.some(c => c.estado === 'ERROR'))       return 'ERROR';
  if (reales.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkNegocio };
