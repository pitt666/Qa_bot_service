/**
 * SECCION 5 — NEGOCIO Y CONFIANZA
 */
const tls = require('tls');

async function checkNegocio({ url, page }) {
  const checks = [];

  const whatsappInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href*="whatsapp.com/send"]'));
    const numeros = links.map(a => {
      const match = a.href.match(/(?:wa\.me\/|phone=)(\d+)/);
      return { numero: match ? `+${match[1]}` : 'numero no extraible', texto: a.textContent.trim().slice(0, 40) || 'boton sin texto', ubicacion: a.closest('header') ? 'header' : a.closest('footer') ? 'footer' : 'cuerpo' };
    });
    const widgets = document.querySelectorAll('[class*="whatsapp"], [id*="whatsapp"], [class*="wa-"], [id*="wa-"]');
    return { numeros, widgetDetectado: widgets.length > 0 };
  });
  checks.push({
    nombre: 'WhatsApp',
    estado: whatsappInfo.numeros.length > 0 || whatsappInfo.widgetDetectado ? 'OK' : 'ADVERTENCIA',
    detalle: whatsappInfo.numeros.length > 0 || whatsappInfo.widgetDetectado ? `${whatsappInfo.numeros.length} boton(es) de WhatsApp${whatsappInfo.widgetDetectado ? ' + widget flotante' : ''}` : 'No se detectaron botones de WhatsApp',
    items: whatsappInfo.numeros.map(n => `${n.numero} — "${n.texto}" (${n.ubicacion})`)
  });

  const telefonosInfo = await page.evaluate(() => {
    const clickeables = Array.from(document.querySelectorAll('a[href^="tel:"]')).map(a => ({ numero: a.href.replace('tel:',''), texto: a.textContent.trim().slice(0, 40) }));
    const numerosEnTexto = (document.body.innerText.match(/(?:\+?52\s?)?(?:\(?\d{2,3}\)?\s?)?\d{4}[-\s]?\d{4}/g) || []).length;
    return { clickeables, numerosEnTexto };
  });
  if (telefonosInfo.clickeables.length > 0) {
    checks.push({ nombre: 'Telefono clickeable', estado: 'OK', detalle: `${telefonosInfo.clickeables.length} numero(s) clickeable(s)`, items: telefonosInfo.clickeables.map(t => `${t.numero} — "${t.texto}"`) });
  } else if (telefonosInfo.numerosEnTexto > 0) {
    checks.push({ nombre: 'Telefono clickeable', estado: 'ADVERTENCIA', detalle: 'Hay numeros en el texto pero NO son clickeables en mobile' });
  } else {
    checks.push({ nombre: 'Telefono clickeable', estado: 'ADVERTENCIA', detalle: 'No se detecto numero de telefono' });
  }

  const direccionInfo = await page.evaluate(() => {
    const texto = document.body.innerText;
    const fuentes = [];
    if (document.querySelector('address')) fuentes.push('tag <address>');
    const etiquetas = ['direccion', 'direcci\u00f3n', 'ubicacion', 'ubicaci\u00f3n', 'address', 'oficinas', 'sucursal', 'nuestra oficina'];
    for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,span,div,label')) {
      const t = el.textContent.trim().toLowerCase();
      if (t.length > 0 && t.length < 60 && etiquetas.some(e => t === e || t.startsWith(e + ':'))) {
        const padre = el.parentElement;
        if (padre && padre.textContent.trim().length > el.textContent.trim().length + 15) { fuentes.push('seccion etiquetada "Direccion"'); break; }
      }
    }
    if (document.querySelector('iframe[src*="google.com/maps"], iframe[src*="maps.google"], iframe[src*="goo.gl/maps"]')) fuentes.push('Google Maps embebido');
    const prefijosCalle = /\b(calle|av\.?|avenida|blvd\.?|boulevard|calz\.?|calzada|privada|priv\.?|cerrada|andador|camino|paseo|circuito|rio|r\u00edo|plaza)\s+[a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]/i;
    if (prefijosCalle.test(texto)) fuentes.push('prefijo de calle');
    const estadosMx = /,\s*(mor|mex|jal|pue|ags|qro|cdmx|bcn|bcs|chih|coah|col|dgo|gto|gro|hgo|mich|nay|n\.?l\.?|oax|q\.?roo|slp|sin|son|tab|tamps|tlax|ver|yuc|zac|camp|chis)\.?(\s|$|,|\.)/i;
    if (estadosMx.test(texto)) fuentes.push('ciudad, estado mexicano');
    if (/\b(c\.?\s?p\.?|codigo postal|c\u00f3digo postal)\.?\s*\d{5}\b/i.test(texto)) fuentes.push('codigo postal');
    if (/\b(col\.?|colonia|fracc\.?|fraccionamiento)\s+[a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]/i.test(texto)) fuentes.push('colonia/fraccionamiento');
    return { detectado: fuentes.length > 0, fuentes: [...new Set(fuentes)] };
  });
  checks.push({
    nombre: 'Direccion fisica',
    estado: direccionInfo.detectado ? 'OK' : 'ADVERTENCIA',
    detalle: direccionInfo.detectado ? `Direccion detectada (${direccionInfo.fuentes.join(', ')})` : 'No se detecto direccion fisica'
  });

  const favicon = await page.evaluate(async () => {
    const linkTag = document.querySelector('link[rel*="icon"], link[rel="shortcut icon"]');
    if (linkTag) return { ok: true, como: `tag <link rel="${linkTag.getAttribute('rel')}">` };
    for (const path of ['/favicon.ico', '/favicon.png', '/favicon.svg']) {
      try { const r = await fetch(path, { method: 'HEAD', cache: 'no-cache' }); if (r.ok) return { ok: true, como: `${path} disponible` }; } catch {}
    }
    return { ok: false };
  });
  checks.push({ nombre: 'Favicon', estado: favicon.ok ? 'OK' : 'ADVERTENCIA', detalle: favicon.ok ? `Favicon configurado — ${favicon.como}` : 'Sin favicon' });

  const tieneCookies = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    return !!document.querySelector('[class*="cookie"], [id*="cookie"], [class*="gdpr"], [class*="consent"]') ||
      ['cookie','consentimiento','aceptar','gdpr'].filter(p => texto.includes(p)).length >= 2;
  });
  checks.push({ nombre: 'Aviso de cookies / GDPR', estado: tieneCookies ? 'OK' : 'ADVERTENCIA', detalle: tieneCookies ? 'Aviso de cookies detectado' : 'No se detecto aviso de cookies' });

  const docsLegales = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const buscar = (palabras) => {
      const hit = links.find(a => {
        const t = (a.textContent + ' ' + (a.href || '')).toLowerCase();
        return palabras.some(p => t.includes(p));
      });
      return hit ? hit.textContent.trim().slice(0, 60) : null;
    };
    return {
      privacidad: buscar(['privacidad', 'privacy', 'aviso legal', 'aviso de privacidad']),
      terminos:   buscar(['terminos', 't\u00e9rminos', 'condiciones', 'terms']),
      cookies:    buscar(['politica de cookies', 'pol\u00edtica de cookies', 'cookie policy', 'aviso de cookies'])
    };
  });
  checks.push({ nombre: 'Politica de privacidad', estado: docsLegales.privacidad ? 'OK' : 'ERROR', detalle: docsLegales.privacidad ? `Enlace encontrado: "${docsLegales.privacidad}"` : 'Sin politica de privacidad — obligatorio si tienes formularios o tracking' });
  checks.push({ nombre: 'Terminos y condiciones', estado: docsLegales.terminos ? 'OK' : 'ADVERTENCIA', detalle: docsLegales.terminos ? `Enlace encontrado: "${docsLegales.terminos}"` : 'Sin terminos y condiciones — recomendado' });
  checks.push({ nombre: 'Politica de cookies', estado: docsLegales.cookies ? 'OK' : 'ADVERTENCIA', detalle: docsLegales.cookies ? `Enlace encontrado: "${docsLegales.cookies}"` : 'Sin politica de cookies — recomendado si usas tracking o banner de cookies' });

  const redes = await page.evaluate(() => {
    const dominios = { facebook:'facebook.com', instagram:'instagram.com', youtube:'youtube.com', twitter:'twitter.com', tiktok:'tiktok.com', linkedin:'linkedin.com' };
    const links = Array.from(document.querySelectorAll('a[href]'));
    return Object.entries(dominios).map(([red, dominio]) => { const link = links.find(a => a.href.includes(dominio)); return link ? { red, url: link.href } : null; }).filter(Boolean);
  });
  checks.push({ nombre: 'Links a redes sociales', estado: redes.length > 0 ? 'OK' : 'ADVERTENCIA', detalle: redes.length > 0 ? `${redes.length} red(es): ${redes.map(r=>r.red).join(', ')}` : 'No se detectaron links a redes sociales', items: redes.map(r=>`${r.red}: ${r.url}`) });

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
        const dias = Math.floor((new Date(cert.valid_to) - new Date()) / (1000*60*60*24));
        if (dias < 0) resolve({ nombre: 'Certificado SSL', estado: 'ERROR', detalle: 'El certificado SSL ha EXPIRADO' });
        else if (dias < 15) resolve({ nombre: 'Certificado SSL', estado: 'ERROR', detalle: `Vence en ${dias} dias — URGENTE renovar` });
        else if (dias < 30) resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: `Vence en ${dias} dias — renovar pronto` });
        else resolve({ nombre: 'Certificado SSL', estado: 'OK', detalle: `Valido, vence en ${dias} dias` });
      });
      socket.on('error', () => resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'No se pudo verificar el certificado' }));
      socket.setTimeout(5000, () => { socket.destroy(); resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'Timeout al verificar SSL' }); });
    } catch { resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'No se pudo verificar el certificado' }); }
  });
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkNegocio };
