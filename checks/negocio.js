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

  const tieneDireccion = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    return !!document.querySelector('address') || ['calle ','av.','avenida','blvd','col.','colonia','c.p.','address'].some(i => texto.includes(i));
  });
  checks.push({ nombre: 'Direccion fisica', estado: tieneDireccion ? 'OK' : 'ADVERTENCIA', detalle: tieneDireccion ? 'Se detecta informacion de direccion fisica' : 'No se detecto direccion fisica' });

  const favicon = await page.evaluate(() => !!document.querySelector('link[rel*="icon"]'));
  checks.push({ nombre: 'Favicon', estado: favicon ? 'OK' : 'ADVERTENCIA', detalle: favicon ? 'Favicon configurado' : 'Sin favicon' });

  const tieneCookies = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    return !!document.querySelector('[class*="cookie"], [id*="cookie"], [class*="gdpr"], [class*="consent"]') ||
      ['cookie','consentimiento','aceptar','gdpr'].filter(p => texto.includes(p)).length >= 2;
  });
  checks.push({ nombre: 'Aviso de cookies / GDPR', estado: tieneCookies ? 'OK' : 'ADVERTENCIA', detalle: tieneCookies ? 'Aviso de cookies detectado' : 'No se detecto aviso de cookies' });

  const privacidad = await page.evaluate(() => {
    const palabras = ['privacidad','privacy','aviso legal','politica'];
    const link = Array.from(document.querySelectorAll('a[href]')).find(a => palabras.some(p => a.textContent.toLowerCase().includes(p) || a.href.toLowerCase().includes(p)));
    return link ? { encontrado: true, texto: link.textContent.trim() } : { encontrado: false };
  });
  checks.push({ nombre: 'Politica de privacidad', estado: privacidad.encontrado ? 'OK' : 'ERROR', detalle: privacidad.encontrado ? `Enlace encontrado: "${privacidad.texto}"` : 'Sin politica de privacidad — obligatorio si tienes formularios o tracking' });

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
