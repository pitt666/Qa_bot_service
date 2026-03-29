/**
 * SECCION 5 — NEGOCIO Y CONFIANZA
 * WhatsApp (numeros), tel clickeable, direccion fisica,
 * horario, testimonios, certificaciones, favicon,
 * cookies/GDPR, privacidad, dominio expira pronto
 */

const https = require('https');
const tls = require('tls');

async function checkNegocio({ url, page }) {
  const checks = [];

  // 1. WhatsApp — detectar numeros y botones
  const whatsappInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href*="whatsapp.com/send"]'));
    const numeros = links.map(a => {
      const href = a.href;
      const match = href.match(/(?:wa\.me\/|phone=)(\d+)/);
      return {
        numero: match ? `+${match[1]}` : 'numero no extraible',
        texto: a.textContent.trim().slice(0, 40) || 'boton sin texto',
        ubicacion: a.closest('header') ? 'header' : a.closest('footer') ? 'footer' : a.closest('nav') ? 'nav' : 'cuerpo'
      };
    });

    // Tambien buscar widgets de WhatsApp
    const widgets = document.querySelectorAll('[class*="whatsapp"], [id*="whatsapp"], [class*="wa-"], [id*="wa-"]');

    return { numeros, widgetDetectado: widgets.length > 0 };
  });

  if (whatsappInfo.numeros.length > 0 || whatsappInfo.widgetDetectado) {
    checks.push({
      nombre: 'WhatsApp',
      estado: 'OK',
      detalle: `${whatsappInfo.numeros.length} boton(es) de WhatsApp detectado(s)${whatsappInfo.widgetDetectado ? ' + widget flotante' : ''}`,
      items: whatsappInfo.numeros.map(n => `${n.numero} — "${n.texto}" (${n.ubicacion})`)
    });
  } else {
    checks.push({
      nombre: 'WhatsApp',
      estado: 'ADVERTENCIA',
      detalle: 'No se detectaron botones ni links de WhatsApp en la pagina'
    });
  }

  // 2. Telefono clickeable (tel:)
  const telefonosInfo = await page.evaluate(() => {
    const linkstel = Array.from(document.querySelectorAll('a[href^="tel:"]'));
    const numeros = linkstel.map(a => ({
      numero: a.href.replace('tel:', ''),
      texto: a.textContent.trim().slice(0, 40)
    }));

    // Detectar numeros visibles que NO son clickeables
    const textoCompleto = document.body.innerText;
    const patronTelefono = /(?:\+?52\s?)?(?:\(?\d{2,3}\)?\s?)?\d{4}[-\s]?\d{4}/g;
    const numerosTexto = textoCompleto.match(patronTelefono) || [];

    return { clickeables: numeros, totalEnTexto: numerosTexto.length };
  });

  if (telefonosInfo.clickeables.length > 0) {
    checks.push({
      nombre: 'Telefono clickeable',
      estado: 'OK',
      detalle: `${telefonosInfo.clickeables.length} numero(s) de telefono clickeable(s) en mobile`,
      items: telefonosInfo.clickeables.map(t => `${t.numero} — "${t.texto}"`)
    });
  } else if (telefonosInfo.totalEnTexto > 0) {
    checks.push({
      nombre: 'Telefono clickeable',
      estado: 'ADVERTENCIA',
      detalle: `Se detectan numeros de telefono en el texto pero NO son clickeables en mobile — el usuario no puede llamar con un tap`
    });
  } else {
    checks.push({
      nombre: 'Telefono clickeable',
      estado: 'ADVERTENCIA',
      detalle: 'No se detecto numero de telefono en la pagina'
    });
  }

  // 3. Direccion fisica
  const tienesDireccion = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    const indicadores = ['calle ', 'av.', 'avenida', 'blvd', 'boulevard', 'col.', 'colonia', 'c.p.', 'codigo postal', 'ciudad de mexico', 'monterrey', 'guadalajara', 'address', 'ubicacion', 'location'];
    const tieneAddress = !!document.querySelector('address');
    const tieneIndicador = indicadores.some(i => texto.includes(i));
    return tieneAddress || tieneIndicador;
  });

  checks.push({
    nombre: 'Direccion fisica',
    estado: tienesDireccion ? 'OK' : 'ADVERTENCIA',
    detalle: tienesDireccion
      ? 'Se detecta informacion de direccion fisica — positivo para SEO local'
      : 'No se detecto direccion fisica — importante para SEO local y confianza del cliente'
  });

  // 4. Horario de atencion
  const tieneHorario = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    const indicadores = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom', 'horario', 'atencion', 'a.m.', 'p.m.', 'am', 'pm'];
    return indicadores.filter(i => texto.includes(i)).length >= 2;
  });

  checks.push({
    nombre: 'Horario de atencion',
    estado: tieneHorario ? 'OK' : 'ADVERTENCIA',
    detalle: tieneHorario
      ? 'Se detecta informacion de horario de atencion'
      : 'No se detecto horario de atencion visible'
  });

  // 5. Testimonios o resenas
  const tieneTestimonios = await page.evaluate(() => {
    const palabras = ['testimonio', 'opinion', 'resena', 'review', 'cliente dice', 'lo que dicen', 'valoracion', 'calificacion', 'estrellas', 'stars', '"', '\u201c'];
    const texto = document.body.innerText.toLowerCase();
    const tieneTexto = palabras.some(p => texto.includes(p));
    const tieneSchema = !!document.querySelector('[itemtype*="Review"], [itemtype*="AggregateRating"]');
    return tieneTexto || tieneSchema;
  });

  checks.push({
    nombre: 'Testimonios o resenas',
    estado: tieneTestimonios ? 'OK' : 'ADVERTENCIA',
    detalle: tieneTestimonios
      ? 'Se detectan testimonios o resenas — positivo para conversion'
      : 'No se detectaron testimonios ni resenas de clientes'
  });

  // 6. Favicon
  const faviconInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('link[rel*="icon"]'));
    return {
      detectado: links.length > 0,
      hrefs: links.map(l => l.href).slice(0, 3)
    };
  });

  checks.push({
    nombre: 'Favicon',
    estado: faviconInfo.detectado ? 'OK' : 'ADVERTENCIA',
    detalle: faviconInfo.detectado
      ? `Favicon configurado`
      : 'Sin favicon — muestra el icono generico del browser, poco profesional'
  });

  // 7. Aviso de cookies / GDPR
  const tieneCookies = await page.evaluate(() => {
    const palabras = ['cookie', 'privacidad', 'consentimiento', 'aceptar', 'accept', 'gdpr', 'lgpd'];
    const texto = document.body.innerText.toLowerCase();
    const tieneBanner = !!document.querySelector('[class*="cookie"], [id*="cookie"], [class*="gdpr"], [id*="gdpr"], [class*="consent"], [id*="consent"]');
    const tieneTexto = palabras.filter(p => texto.includes(p)).length >= 2;
    return tieneBanner || tieneTexto;
  });

  checks.push({
    nombre: 'Aviso de cookies / GDPR',
    estado: tieneCookies ? 'OK' : 'ADVERTENCIA',
    detalle: tieneCookies
      ? 'Aviso de cookies o GDPR detectado'
      : 'No se detecto aviso de cookies — requerido si usas tracking y operas en Mexico/Europa'
  });

  // 8. Politica de privacidad
  const privacidadInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const palabras = ['privacidad', 'privacy', 'aviso legal', 'politica'];
    const link = links.find(a => palabras.some(p => (a.textContent.toLowerCase().includes(p) || a.href.toLowerCase().includes(p))));
    return link ? { encontrado: true, url: link.href, texto: link.textContent.trim() } : { encontrado: false };
  });

  checks.push({
    nombre: 'Politica de privacidad',
    estado: privacidadInfo.encontrado ? 'OK' : 'ERROR',
    detalle: privacidadInfo.encontrado
      ? `Enlace a politica de privacidad encontrado: "${privacidadInfo.texto}"`
      : 'No se encontro enlace a politica de privacidad — obligatorio legalmente si tienes formularios o tracking'
  });

  // 9. Links a redes sociales (presentes y no rotos)
  const redesInfo = await page.evaluate(async () => {
    const redes = {
      facebook: 'facebook.com',
      instagram: 'instagram.com',
      youtube: 'youtube.com',
      twitter: 'twitter.com',
      tiktok: 'tiktok.com',
      linkedin: 'linkedin.com'
    };
    const encontradas = [];
    const links = Array.from(document.querySelectorAll('a[href]'));

    for (const [red, dominio] of Object.entries(redes)) {
      const link = links.find(a => a.href.includes(dominio));
      if (link) {
        encontradas.push({ red, url: link.href, texto: link.textContent.trim() || link.getAttribute('aria-label') || red });
      }
    }
    return encontradas;
  });

  if (redesInfo.length > 0) {
    checks.push({
      nombre: 'Links a redes sociales',
      estado: 'OK',
      detalle: `${redesInfo.length} red(es) social(es) enlazada(s): ${redesInfo.map(r => r.red).join(', ')}`,
      items: redesInfo.map(r => `${r.red}: ${r.url}`)
    });
  } else {
    checks.push({
      nombre: 'Links a redes sociales',
      estado: 'ADVERTENCIA',
      detalle: 'No se detectaron links a redes sociales en la pagina'
    });
  }

  // 10. SSL — fecha de vencimiento
  const sslInfo = await verificarSSL(url);
  checks.push(sslInfo);

  // 11. Año del copyright actualizado
  const copyrightInfo = await page.evaluate(() => {
    const texto = document.body.innerText;
    const match = texto.match(/©\s*(\d{4})/);
    return match ? parseInt(match[1]) : null;
  });

  const anioActual = new Date().getFullYear();
  if (copyrightInfo) {
    checks.push({
      nombre: 'Copyright actualizado',
      estado: copyrightInfo >= anioActual - 1 ? 'OK' : 'ADVERTENCIA',
      detalle: copyrightInfo >= anioActual - 1
        ? `Copyright © ${copyrightInfo} — actualizado`
        : `Copyright © ${copyrightInfo} — desactualizado, dice ${copyrightInfo} cuando estamos en ${anioActual}`
    });
  }

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'Negocio y Confianza',
    estado: estadoGeneral,
    checks
  };
}

function verificarSSL(url) {
  return new Promise(resolve => {
    try {
      const hostname = new URL(url).hostname;
      const socket = tls.connect(443, hostname, { servername: hostname }, () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();

        if (!cert || !cert.valid_to) {
          resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'No se pudo obtener informacion del certificado SSL' });
          return;
        }

        const expira = new Date(cert.valid_to);
        const hoy = new Date();
        const diasRestantes = Math.floor((expira - hoy) / (1000 * 60 * 60 * 24));

        if (diasRestantes < 0) {
          resolve({ nombre: 'Certificado SSL', estado: 'ERROR', detalle: `El certificado SSL ha EXPIRADO — el sitio mostrara "No seguro" en todos los navegadores` });
        } else if (diasRestantes < 15) {
          resolve({ nombre: 'Certificado SSL', estado: 'ERROR', detalle: `El certificado SSL vence en ${diasRestantes} dias — URGENTE renovar` });
        } else if (diasRestantes < 30) {
          resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: `El certificado SSL vence en ${diasRestantes} dias — renovar pronto` });
        } else {
          resolve({ nombre: 'Certificado SSL', estado: 'OK', detalle: `Certificado SSL valido, vence en ${diasRestantes} dias (${expira.toLocaleDateString('es-MX')})` });
        }
      });

      socket.on('error', () => {
        resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'No se pudo verificar el certificado SSL' });
      });
      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'Timeout al verificar el certificado SSL' });
      });
    } catch {
      resolve({ nombre: 'Certificado SSL', estado: 'ADVERTENCIA', detalle: 'No se pudo verificar el certificado SSL' });
    }
  });
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkNegocio };
