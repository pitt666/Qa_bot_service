/**
 * SECCION 3 — FORMULARIOS Y CONVERSION
 * Envio real con Mailtrap, deteccion de pagina de gracias,
 * campos requeridos, popup/newsletter, lead magnet, exit intent
 */

async function checkFormularios({ page, context, mailtrap_token, mailtrap_inbox_id }) {
  const checks = [];

  // 1. Detectar formularios en la pagina
  const formularios = await page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll('form'));
    return forms.map((form, i) => {
      const campos = Array.from(form.querySelectorAll('input, textarea, select')).map(f => ({
        tipo: f.type || f.tagName.toLowerCase(),
        nombre: f.name || f.id || f.placeholder || '(sin nombre)',
        requerido: f.required,
        placeholder: f.placeholder || ''
      })).filter(c => !['hidden', 'submit', 'button', 'reset'].includes(c.tipo));

      const botonSubmit = form.querySelector('[type="submit"], button:not([type="button"])');
      const action = form.action || form.getAttribute('action') || '';
      const method = form.method || 'get';

      return {
        indice: i + 1,
        campos,
        totalCampos: campos.length,
        tieneSubmit: !!botonSubmit,
        textoSubmit: botonSubmit?.textContent.trim().slice(0, 50) || '(sin texto)',
        action: action.slice(0, 100),
        method
      };
    });
  });

  if (formularios.length === 0) {
    checks.push({
      nombre: 'Formularios',
      estado: 'OK',
      detalle: 'No se encontraron formularios en esta pagina'
    });
  } else {
    checks.push({
      nombre: 'Formularios detectados',
      estado: 'OK',
      detalle: `${formularios.length} formulario(s) encontrado(s)`,
      items: formularios.map(f =>
        `Formulario ${f.indice}: ${f.totalCampos} campo(s) — Submit: ${f.tieneSubmit ? f.textoSubmit : 'SIN BOTON DE ENVIO'}`
      )
    });

    // 2. Verificar que cada formulario tiene boton de submit
    const sinSubmit = formularios.filter(f => !f.tieneSubmit);
    if (sinSubmit.length > 0) {
      checks.push({
        nombre: 'Formularios sin boton de envio',
        estado: 'ERROR',
        detalle: `${sinSubmit.length} formulario(s) sin boton de envio`,
        items: sinSubmit.map(f => `Formulario ${f.indice} (${f.totalCampos} campos)`)
      });
    }

    // 3. Intentar envio real con Mailtrap si se proporcionaron credenciales
    if (mailtrap_token && mailtrap_inbox_id && formularios.length > 0) {
      const resultadoEnvio = await intentarEnvioFormulario(page, context, formularios[0], mailtrap_token, mailtrap_inbox_id);
      checks.push(resultadoEnvio);
    } else {
      checks.push({
        nombre: 'Prueba de envio real',
        estado: 'ADVERTENCIA',
        detalle: 'No se configuraron credenciales de Mailtrap — no se pudo probar el envio real del formulario. Agrega mailtrap_token y mailtrap_inbox_id al request.'
      });
    }
  }

  // 4. Pagina de gracias / thank you page
  const tienePaginaGracias = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const palabrasGracias = ['gracias', 'thank', 'thanks', 'confirmacion', 'confirmation', 'exito', 'success'];
    return links.some(a => {
      const href = (a.href || '').toLowerCase();
      const texto = (a.textContent || '').toLowerCase();
      return palabrasGracias.some(p => href.includes(p) || texto.includes(p));
    });
  });

  const urlActual = page.url();
  const esPaginaGracias = ['gracias', 'thank', 'thanks', 'confirmacion', 'success', 'exito'].some(p =>
    urlActual.toLowerCase().includes(p)
  );

  checks.push({
    nombre: 'Pagina de gracias',
    estado: tienePaginaGracias || esPaginaGracias ? 'OK' : 'ADVERTENCIA',
    detalle: tienePaginaGracias || esPaginaGracias
      ? 'Se detecta pagina de gracias — importante para tracking de conversiones'
      : 'No se detecto pagina de gracias — sin esto el Pixel y GA4 no pueden trackear conversiones correctamente'
  });

  // 5. Popup de captacion
  const popupInfo = await page.evaluate(() => {
    const posiblesPopups = document.querySelectorAll('[class*="popup"], [class*="modal"], [class*="overlay"], [id*="popup"], [id*="modal"]');
    return {
      detectado: posiblesPopups.length > 0,
      cantidad: posiblesPopups.length
    };
  });

  checks.push({
    nombre: 'Popup de captacion',
    estado: 'OK',
    detalle: popupInfo.detectado
      ? `${popupInfo.cantidad} elemento(s) tipo popup/modal detectado(s) en la pagina`
      : 'No se detectaron popups de captacion'
  });

  // 6. Newsletter / lead magnet
  const captacion = await page.evaluate(() => {
    const textos = document.body.innerText.toLowerCase();
    const palabrasNewsletter = ['newsletter', 'suscribete', 'suscribite', 'subscribe', 'recibe', 'recibir', 'gratis', 'descarga', 'download', 'guia', 'ebook', 'descuento'];
    const encontrados = palabrasNewsletter.filter(p => textos.includes(p));
    return encontrados;
  });

  checks.push({
    nombre: 'Captacion de leads / newsletter',
    estado: 'OK',
    detalle: captacion.length > 0
      ? `Se detectan elementos de captacion: ${captacion.slice(0, 5).join(', ')}`
      : 'No se detectaron elementos de captacion de leads (newsletter, lead magnet, descarga)'
  });

  // 7. reCAPTCHA o proteccion anti-spam
  const tieneRecaptcha = await page.evaluate(() => {
    return !!(
      document.querySelector('.g-recaptcha, [data-sitekey], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]') ||
      window.grecaptcha ||
      document.querySelector('script[src*="recaptcha"]') ||
      document.querySelector('script[src*="hcaptcha"]')
    );
  });

  checks.push({
    nombre: 'Proteccion anti-spam en formularios',
    estado: formularios.length > 0 && !tieneRecaptcha ? 'ADVERTENCIA' : 'OK',
    detalle: tieneRecaptcha
      ? 'reCAPTCHA o proteccion anti-spam detectada'
      : formularios.length > 0
        ? 'No se detecto reCAPTCHA ni proteccion anti-spam — los formularios pueden recibir spam'
        : 'No aplica (no hay formularios)'
  });

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'Formularios y Conversion',
    estado: estadoGeneral,
    checks
  };
}

async function intentarEnvioFormulario(page, context, formulario, mailtrap_token, mailtrap_inbox_id) {
  try {
    const emailPrueba = `qa-test-${Date.now()}@prueba-arsen.com`;
    const paginaAntes = page.url();

    // Llenar campos
    const forms = await page.$$('form');
    if (!forms[formulario.indice - 1]) {
      return { nombre: 'Prueba de envio real', estado: 'ADVERTENCIA', detalle: 'No se encontro el formulario en la pagina' };
    }

    const form = forms[formulario.indice - 1];

    for (const campo of formulario.campos) {
      try {
        const selector = campo.nombre !== '(sin nombre)'
          ? `[name="${campo.nombre}"], [id="${campo.nombre}"]`
          : null;

        if (!selector) continue;

        const input = await form.$(selector);
        if (!input) continue;

        if (campo.tipo === 'email') {
          await input.fill(emailPrueba);
        } else if (campo.tipo === 'tel' || campo.tipo === 'phone') {
          await input.fill('5500000000');
        } else if (campo.tipo === 'textarea') {
          await input.fill('Mensaje de prueba automatica QA Bot ARSEN');
        } else if (campo.tipo === 'text') {
          const nombreCampo = campo.nombre.toLowerCase();
          if (nombreCampo.includes('name') || nombreCampo.includes('nombre')) {
            await input.fill('QA Test ARSEN');
          } else {
            await input.fill('Prueba QA');
          }
        } else if (campo.tipo === 'select') {
          const opciones = await input.$$('option');
          if (opciones.length > 1) await opciones[1].click();
        }
      } catch { continue; }
    }

    // Enviar formulario
    const submitBtn = await form.$('[type="submit"], button:not([type="button"])');
    if (!submitBtn) {
      return { nombre: 'Prueba de envio real', estado: 'ADVERTENCIA', detalle: 'No se encontro boton de envio para hacer la prueba' };
    }

    await Promise.all([
      page.waitForNavigation({ timeout: 10000, waitUntil: 'networkidle' }).catch(() => {}),
      submitBtn.click()
    ]);

    const paginaDespues = page.url();
    const redirigioAGracias = paginaDespues !== paginaAntes &&
      ['gracias', 'thank', 'thanks', 'confirmacion', 'success', 'exito'].some(p => paginaDespues.toLowerCase().includes(p));

    // Verificar con Mailtrap si llego el email
    let emailLlego = false;
    let detalleMailtrap = '';
    try {
      const mailtrapResp = await fetch(`https://mailtrap.io/api/accounts/1/inboxes/${mailtrap_inbox_id}/messages`, {
        headers: { 'Api-Token': mailtrap_token }
      });
      if (mailtrapResp.ok) {
        const mensajes = await mailtrapResp.json();
        emailLlego = mensajes.some(m =>
          m.to_email?.includes(emailPrueba) ||
          m.subject?.toLowerCase().includes('qa') ||
          (Date.now() - new Date(m.created_at).getTime()) < 30000
        );
        detalleMailtrap = emailLlego ? ' — Email confirmado en bandeja Mailtrap' : ' — No se encontro el email en Mailtrap';
      }
    } catch { detalleMailtrap = ' — No se pudo verificar en Mailtrap'; }

    const estado = redirigioAGracias || emailLlego ? 'OK' : 'ADVERTENCIA';
    const detalle = `Formulario enviado con datos de prueba.` +
      (redirigioAGracias ? ` Redirige a: ${paginaDespues}` : ' Sin redireccion a pagina de gracias.') +
      detalleMailtrap;

    return { nombre: 'Prueba de envio real', estado, detalle };

  } catch (e) {
    return { nombre: 'Prueba de envio real', estado: 'ADVERTENCIA', detalle: `No se pudo completar la prueba de envio: ${e.message}` };
  }
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkFormularios };
