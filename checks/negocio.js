/**
 * SECCION 5 — NEGOCIO Y CONFIANZA
 */
const tls = require('tls');

async function checkNegocio({ url, page }) {
  const checks = [];

  // 1. WhatsApp
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
  checks.push({
    nombre: 'WhatsApp',
    estado: whatsappInfo.numeros.length > 0 || whatsappInfo.widgetDetectado ? 'OK' : 'ADVERTENCIA',
    detalle: whatsappInfo.numeros.length > 0 || whatsappInfo.widgetDetectado
      ? `${whatsappInfo.numeros.length} boton(es) de WhatsApp${whatsappInfo.widgetDetectado ? ' + widget flotante' : ''}`
      : 'No se detectaron botones de WhatsApp',
    items: whatsappInfo.numeros.map(n => `${n.numero} — "${n.texto}" (${n.ubicacion})`)
  });

  // 2. Telefono clickeable — solo href=tel:
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
      : 'Sin telefono clickeable — agregar <a href="tel:..."> para que funcione en mobile',
    items: telefonosInfo.clickeables.map(t => `${t.numero}${t.texto ? ` — "${t.texto}"` : ''}`)
  });

  // 3. Correo clickeable — solo href=mailto:
  const emailInfo = await page.evaluate(() => {
    const clickeables = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => ({
      email: decodeURIComponent(a.href.replace('mailto:', '').split('?')[0].trim()),
      texto: a.textContent.trim().slice(0, 40) || ''
    }));
    return { clickeables };
  });
  checks.push({
    nombre: 'Correo clickeable',
    estado: emailInfo.clickeables.length > 0 ? 'OK' : 'ADVERTENCIA',
    detalle: emailInfo.clickeables.length > 0
      ? `${emailInfo.clickeables.length} correo(s) con href=mailto:`
      : 'Sin correo clickeable — agregar <a href="mailto:..."> si se muestra un email',
    items: emailInfo.clickeables.map(e => `${e.email}${e.texto ? ` — "${e.texto}"` : ''}`)
  });

  // 4. Direccion fisica — patrones estructurales, sin nombres de ciudades
  const dirInfo = await page.evaluate(() => {
    // Señal definitiva: mapa de Google
    if (document.querySelector('iframe[src*="google.com/maps"], iframe[src*="maps.googleapis"], a[href*="maps.google"], a[href*="goo.gl/maps"], a[href*="maps.app.goo.gl"]'))
      return { tiene: true, como: 'Mapa de Google embebido o enlace' };
    // Schema.org PostalAddress
    if (document.querySelector('[itemtype*="PostalAddress"], [itemprop="streetAddress"], [itemprop="addressLocality"]'))
      return { tiene: true, como: 'Schema.org PostalAddress' };
    // Etiqueta semantica <address>
    if (document.querySelector('address'))
      return { tiene: true, como: 'Etiqueta <address>' };
    // Patrones en texto (2+ coincidencias)
    const texto = document.body.innerText;
    const patrones = [
      { re: /\bC\.?P\.?\s*\d{5}\b/i,                                                                    label: 'codigo postal' },
      { re: /\b(calle|av\.|avenida|blvd\.?|boulevard|calzada|carretera|privada|andador|circuito|paseo)\b/i, label: 'tipo de via' },
      { re: /#\s*\d+|\bNo\.?\s*\d+|\bInt\.?\s*\d+|\bExt\.?\s*\d+/i,                                   label: 'numeracion' },
      { re: /\b(col\.|colonia|fracc\.|fraccionamiento|manzana|lote)\b/i,                                  label: 'colonia' },
      { re: /\b(municipio|alcald[ií]a|delegaci[oó]n)\b/i,                                               label: 'municipio/alcaldia' },
    ];
    const hits = patrones.filter(p => p.re.test(texto));
    if (hits.length >= 2) return { tiene: true, como: `Patrones: ${hits.map(h => h.label).join(', ')}` };
    return { tiene: false };
  });
  checks.push({
    nombre: 'Direccion fisica',
    estado: dirInfo.tiene ? 'OK' : 'ADVERTENCIA',
    detalle: dirInfo.tiene
      ? `Direccion detectada — ${dirInfo.como}`
      : 'Sin direccion fisica (mapa de Google, CP, calle, colonia...)'
  });

  // 5. Favicon
  const favicon = await page.evaluate(() => !!document.querySelector('link[rel*="icon"]'));
  checks.push({ nombre: 'Favicon', estado: favicon ? 'OK' : 'ADVERTENCIA', detalle: favicon ? 'Favicon configurado' : 'Sin favicon' });

  // 6. Aviso de cookies / GDPR
  const tieneCookies = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    return !!document.querySelector('[class*="cookie"], [id*="cookie"], [class*="gdpr"], [class*="consent"], [class*="aviso"]') ||
      ['cookie', 'consentimiento', 'aceptar', 'gdpr'].filter(p => texto.includes(p)).length >= 2;
  });
  checks.push({ nombre: 'Aviso de cookies / GDPR', estado: tieneCookies ? 'OK' : 'ADVERTENCIA', detalle: tieneCookies ? 'Aviso de cookies detectado' : 'No se detecto aviso de cookies' });

  // 7. Politica de privacidad
  const privacidad = await page.evaluate(() => {
    const palabras = ['privacidad', 'privacy', 'aviso legal', 'politica', 'terminos', 'terminos', 'cookies', 'aviso de privacidad', 'legal'];
    const links = Array.from(document.querySelectorAll('a[href]'));
    const link = links.find(a =>
      palabras.some(p => a.textContent.toLowerCase().includes(p) || (a.href || '').toLowerCase().includes(p))
    );
    return link ? { encontrado: true, texto: link.textContent.trim().slice(0, 60) } : { encontrado: false };
  });
  checks.push({
    nombre: 'Politica de privacidad / Terminos',
    estado: privacidad.encontrado ? 'OK' : 'ADVERTENCIA',
    detalle: privacidad.encontrado
      ? `Enlace encontrado: "${privacidad.texto}"`
      : 'Sin politica de privacidad o terminos — recomendado si tienes formularios o tracking'
  });

  // 8. Redes sociales
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
      ? `${redes.length} red(es) detectada(s): ${redes.map(r => r.red).join(', ')}`
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
        if (dias < 0)  resolve({ nombre: 'Certificado SSL', estado: 'ERROR',       detalle: 'El certificado SSL ha EXPIRADO' });
        else if (dias < 15) resolve({ nombre: 'Certificado SSL', estado: 'ERROR',  detalle: `Vence en ${dias} dias — URGENTE renovar` });
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
