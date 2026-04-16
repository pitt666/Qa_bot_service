/**
 * SECCION 3 — FORMULARIOS Y CONVERSION
 */
const https = require('https');
const http = require('http');

function fetchTexto(url, timeoutMs = 5000) {
  return new Promise(resolve => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'QA-Bot/1.0' } }, res => {
        if (res.statusCode >= 400) return resolve(null);
        let data = '';
        res.on('data', chunk => { data += chunk; if (data.length > 500000) { req.destroy(); resolve(data); } });
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch { resolve(null); }
  });
}

const norm = t => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

async function buscarEnSitemap(baseUrl, keywords) {
  const paths = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap-index.xml'];
  let locs = [];
  for (const path of paths) {
    const content = await fetchTexto(baseUrl + path);
    if (!content) continue;
    const matches = [...content.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m => m[1].trim());
    locs.push(...matches);
    if (locs.length > 0) break;
  }
  const subSitemaps = locs.filter(u => norm(u).includes('sitemap') && u.endsWith('.xml'));
  if (subSitemaps.length > 0) {
    const contents = await Promise.all(subSitemaps.slice(0, 5).map(u => fetchTexto(u)));
    for (const c of contents) {
      if (!c) continue;
      const matches = [...c.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m => m[1].trim());
      locs.push(...matches.filter(u => !u.endsWith('.xml')));
    }
  }
  return locs.filter(loc => keywords.some(k => norm(loc).includes(k)));
}

async function checkFormularios({ page, context, url, mailtrap_token, mailtrap_inbox_id }) {
  const checks = [];

  let baseUrl = '';
  try { const u = new URL(url); baseUrl = `${u.protocol}//${u.host}`; } catch {}

  const formularios = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('form')).map((form, i) => {
      const campos = Array.from(form.querySelectorAll('input, textarea, select'))
        .map(f => ({ tipo: f.type || f.tagName.toLowerCase(), nombre: f.name || f.id || f.placeholder || '(sin nombre)', requerido: f.required }))
        .filter(c => !['hidden','submit','button','reset'].includes(c.tipo));
      const botonSubmit = form.querySelector('[type="submit"], button:not([type="button"])');
      return {
        indice: i + 1, campos, totalCampos: campos.length,
        tieneSubmit: !!botonSubmit,
        textoSubmit: botonSubmit?.textContent.trim().slice(0, 50) || '(sin texto)',
        action: (form.action || form.getAttribute('action') || '').slice(0, 100),
        method: form.method || 'get'
      };
    });
  });

  if (formularios.length === 0) {
    checks.push({ nombre: 'Formularios', estado: 'INFORMATIVO', detalle: 'No se encontraron formularios en esta pagina — no aplica' });
  } else {
    checks.push({
      nombre: 'Formularios detectados', estado: 'OK',
      detalle: `${formularios.length} formulario(s) encontrado(s)`,
      items: formularios.map(f => `Formulario ${f.indice}: ${f.totalCampos} campo(s) — Submit: ${f.tieneSubmit ? f.textoSubmit : 'SIN BOTON'}`)
    });
    if (mailtrap_token && mailtrap_inbox_id) {
      const resultadoEnvio = await intentarEnvioFormulario(page, formularios[0], mailtrap_token, mailtrap_inbox_id);
      checks.push(resultadoEnvio);
    } else {
      checks.push({ nombre: 'Prueba de envio real', estado: 'ADVERTENCIA', detalle: 'Agrega mailtrap_token y mailtrap_inbox_id para probar el envio real' });
    }
  }

  // Pagina de gracias: links en la pagina + sitemap como fallback
  const palabrasGracias = ['gracias', 'thank', 'confirmation', 'confirmacion', 'exito', 'success'];
  const tieneLinkGracias = await page.evaluate((palabras) => {
    return Array.from(document.querySelectorAll('a[href]')).some(a =>
      palabras.some(p => (a.href || '').toLowerCase().includes(p) || (a.textContent || '').toLowerCase().includes(p))
    );
  }, palabrasGracias);

  let estadoGracias, detalleGracias;
  if (tieneLinkGracias) {
    estadoGracias = 'OK';
    detalleGracias = 'Pagina de gracias detectada (link encontrado)';
  } else {
    const graciasSitemap = await buscarEnSitemap(baseUrl, palabrasGracias);
    if (graciasSitemap.length > 0) {
      estadoGracias = 'OK';
      detalleGracias = `Pagina de gracias encontrada en sitemap: ${graciasSitemap[0]}`;
    } else {
      estadoGracias = 'ADVERTENCIA';
      detalleGracias = 'No se detecto pagina de gracias — el Pixel y GA4 no pueden trackear conversiones';
    }
  }
  checks.push({ nombre: 'Pagina de gracias', estado: estadoGracias, detalle: detalleGracias });

  // Verificar widget Tochat/Chatwit si esta presente
  const tochatResult = await verificarWidgetTochat(page);
  if (tochatResult) checks.push(tochatResult);

  const antispamInfo = await page.evaluate(() => {
    const html = document.documentElement.outerHTML.toLowerCase();
    const detectados = [];
    if (document.querySelector('.g-recaptcha, iframe[src*="recaptcha"], script[src*="recaptcha"]') || window.grecaptcha) detectados.push('reCAPTCHA');
    if (document.querySelector('.h-captcha, iframe[src*="hcaptcha"], script[src*="hcaptcha"]')) detectados.push('hCaptcha');
    if (document.querySelector('.cf-turnstile, script[src*="challenges.cloudflare.com"]') || window.turnstile) detectados.push('Cloudflare Turnstile');
    if (document.querySelector('script[src*="cleantalk"], script[src*="apbct"]') ||
        document.querySelector('input[name*="ct_checkjs"], input[name*="apbct"]') ||
        html.includes('apbct_event_id') || html.includes('ctpublicfunctions') ||
        window.ctNocache || window.ctPublic || window.ctPublicFunctions) detectados.push('CleanTalk');
    const honeypotSelectors = ['input[name*="honeypot"]','input[name*="hp_"]','input[name="email_confirm"]','input[name="url"][tabindex="-1"]','input[class*="honeypot"]','input[name="_gotcha"]'];
    if (honeypotSelectors.some(sel => document.querySelector(sel))) detectados.push('Honeypot');
    return { detectados };
  });

  if (formularios.length === 0) {
    checks.push({ nombre: 'Proteccion anti-spam', estado: 'INFORMATIVO', detalle: 'No aplica — no hay formularios en la pagina' });
  } else if (antispamInfo.detectados.length > 0) {
    checks.push({ nombre: 'Proteccion anti-spam', estado: 'OK', detalle: `Detectado: ${antispamInfo.detectados.join(', ')}` });
  } else {
    checks.push({ nombre: 'Proteccion anti-spam', estado: 'ADVERTENCIA', detalle: 'Sin proteccion anti-spam detectada — los formularios pueden recibir spam (deteccion basada en front-end; plugins 100% backend como Akismet pueden no aparecer)' });
  }

  return { nombre: 'Formularios y Conversion', estado: calcularEstado(checks), checks };
}

async function verificarWidgetTochat(page) {
  try {
    const tieneTochat = await page.evaluate(() =>
      !!document.querySelector('script[src*="tochat"], script[src*="chatwit"]')
    );
    if (!tieneTochat) return null;

    const selectores = [
      '[class*="tochat"] button', '[id*="tochat"] button',
      '[class*="chatwit"] button', '[id*="chatwit"] button',
      '[class*="tochat"]', '[id*="tochat"]', '[class*="chatwit"]', '[id*="chatwit"]'
    ];
    let botonSelector = null;
    for (const sel of selectores) {
      try { await page.waitForSelector(sel, { timeout: 2000 }); botonSelector = sel; break; } catch {}
    }

    if (!botonSelector) {
      return { nombre: 'Widget de chat (Tochat/Chatwit)', estado: 'ADVERTENCIA', detalle: 'Script detectado pero el widget no aparecio en 2s — puede cargar tarde' };
    }

    await page.click(botonSelector).catch(() => {});
    await page.waitForTimeout(2000);

    const tieneFormulario = await page.evaluate(() => {
      const el = document.querySelector('[class*="tochat"], [id*="tochat"], [class*="chatwit"], [id*="chatwit"]');
      if (!el) return false;
      return el.querySelectorAll('input, textarea').length > 0 || !!el.querySelector('[type="submit"], button');
    });

    return {
      nombre: 'Widget de chat (Tochat/Chatwit)',
      estado: tieneFormulario ? 'OK' : 'ADVERTENCIA',
      detalle: tieneFormulario ? 'Widget funcional con formulario de contacto' : 'Widget detectado pero sin formulario visible tras click — verifica que abra correctamente'
    };
  } catch (e) {
    return { nombre: 'Widget de chat (Tochat/Chatwit)', estado: 'ADVERTENCIA', detalle: `No se pudo verificar el widget: ${e.message.slice(0, 100)}` };
  }
}

async function intentarEnvioFormulario(page, formulario, mailtrap_token, mailtrap_inbox_id) {
  try {
    const emailPrueba = `qa-test-${Date.now()}@prueba-arsen.com`;
    const paginaAntes = page.url();
    const forms = await page.$$('form');
    if (!forms[formulario.indice - 1]) return { nombre: 'Prueba de envio real', estado: 'ADVERTENCIA', detalle: 'No se encontro el formulario' };
    const form = forms[formulario.indice - 1];
    for (const campo of formulario.campos) {
      try {
        const selector = campo.nombre !== '(sin nombre)' ? `[name="${campo.nombre}"], [id="${campo.nombre}"]` : null;
        if (!selector) continue;
        const input = await form.$(selector);
        if (!input) continue;
        if (campo.tipo === 'email') await input.fill(emailPrueba);
        else if (campo.tipo === 'tel') await input.fill('5500000000');
        else if (campo.tipo === 'textarea') await input.fill('Mensaje de prueba QA Bot ARSEN');
        else if (campo.tipo === 'text') {
          const n = campo.nombre.toLowerCase();
          await input.fill(n.includes('name') || n.includes('nombre') ? 'QA Test ARSEN' : 'Prueba QA');
        }
      } catch { continue; }
    }
    const submitBtn = await form.$('[type="submit"], button:not([type="button"])');
    if (!submitBtn) return { nombre: 'Prueba de envio real', estado: 'ADVERTENCIA', detalle: 'Sin boton de envio' };
    await Promise.all([
      page.waitForNavigation({ timeout: 10000, waitUntil: 'networkidle' }).catch(() => {}),
      submitBtn.click()
    ]);
    const paginaDespues = page.url();
    const redirigioAGracias = paginaDespues !== paginaAntes &&
      ['gracias','thank','thanks','confirmacion','success','exito'].some(p => paginaDespues.toLowerCase().includes(p));
    let emailLlego = false, detalleMailtrap = '';
    try {
      const r = await fetch(`https://mailtrap.io/api/accounts/1/inboxes/${mailtrap_inbox_id}/messages`, { headers: { 'Api-Token': mailtrap_token } });
      if (r.ok) {
        const msgs = await r.json();
        emailLlego = msgs.some(m => (Date.now() - new Date(m.created_at).getTime()) < 30000);
        detalleMailtrap = emailLlego ? ' — Email confirmado en Mailtrap' : ' — No se encontro el email en Mailtrap';
      }
    } catch { detalleMailtrap = ' — No se pudo verificar en Mailtrap'; }
    return {
      nombre: 'Prueba de envio real',
      estado: redirigioAGracias || emailLlego ? 'OK' : 'ADVERTENCIA',
      detalle: `Formulario enviado.${redirigioAGracias ? ` Redirige a: ${paginaDespues}` : ' Sin redireccion a pagina de gracias.'}${detalleMailtrap}`
    };
  } catch (e) {
    return { nombre: 'Prueba de envio real', estado: 'ADVERTENCIA', detalle: `No se pudo completar: ${e.message}` };
  }
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkFormularios };
