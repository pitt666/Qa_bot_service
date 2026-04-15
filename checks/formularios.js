/**
 * SECCION 3 — FORMULARIOS Y CONVERSION
 */
async function checkFormularios({ page, context, mailtrap_token, mailtrap_inbox_id }) {
  const checks = [];

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

  const tienePaginaGracias = await page.evaluate(() => {
    const palabras = ['gracias','thank','thanks','confirmacion','confirmation','exito','success'];
    return Array.from(document.querySelectorAll('a[href]')).some(a =>
      palabras.some(p => (a.href||'').toLowerCase().includes(p) || (a.textContent||'').toLowerCase().includes(p))
    );
  });
  checks.push({
    nombre: 'Pagina de gracias',
    estado: tienePaginaGracias ? 'OK' : 'ADVERTENCIA',
    detalle: tienePaginaGracias ? 'Pagina de gracias detectada' : 'No se detecto pagina de gracias — el Pixel y GA4 no pueden trackear conversiones'
  });

  const antispamInfo = await page.evaluate(() => {
    const html = document.documentElement.outerHTML.toLowerCase();
    const detectados = [];

    // reCAPTCHA (Google v2/v3)
    if (document.querySelector('.g-recaptcha, iframe[src*="recaptcha"], script[src*="recaptcha"]') ||
        window.grecaptcha) {
      detectados.push('reCAPTCHA');
    }

    // hCaptcha
    if (document.querySelector('.h-captcha, iframe[src*="hcaptcha"], script[src*="hcaptcha"]')) {
      detectados.push('hCaptcha');
    }

    // Cloudflare Turnstile
    if (document.querySelector('.cf-turnstile, script[src*="challenges.cloudflare.com"]') ||
        window.turnstile) {
      detectados.push('Cloudflare Turnstile');
    }

    // CleanTalk (WordPress, invisible)
    if (document.querySelector('script[src*="cleantalk"], script[src*="apbct"]') ||
        document.querySelector('input[name*="ct_checkjs"], input[name*="apbct"]') ||
        html.includes('apbct_event_id') || html.includes('ctpublicfunctions') ||
        window.ctNocache || window.ctPublic || window.ctPublicFunctions) {
      detectados.push('CleanTalk');
    }

    // Honeypot generico
    const honeypotSelectors = [
      'input[name*="honeypot"]','input[name*="hp_"]','input[name="email_confirm"]',
      'input[name="url"][tabindex="-1"]','input[class*="honeypot"]','input[name="_gotcha"]'
    ];
    if (honeypotSelectors.some(sel => document.querySelector(sel))) {
      detectados.push('Honeypot');
    }

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
