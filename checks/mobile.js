/**
 * SECCION 4 — MOBILE
 * Tap targets pequeños, zoom deshabilitado, teclado inputs,
 * menu hamburguesa, overflow horizontal mobile
 */

async function checkMobile({ page, context }) {
  const checks = [];

  // Crear pagina mobile para los checks
  const paginaMobile = await context.newPage();
  await paginaMobile.setViewportSize({ width: 390, height: 844 }); // iPhone 14

  try {
    await paginaMobile.goto(page.url(), { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    await paginaMobile.close();
    return {
      nombre: 'Mobile',
      estado: 'ADVERTENCIA',
      checks: [{ nombre: 'Analisis mobile', estado: 'ADVERTENCIA', detalle: 'No se pudo cargar la pagina en viewport mobile' }]
    };
  }

  // 1. Overflow horizontal en mobile
  const tieneOverflowMobile = await paginaMobile.evaluate(() => {
    return document.body.scrollWidth > document.documentElement.clientWidth + 10;
  });

  checks.push({
    nombre: 'Overflow horizontal en mobile',
    estado: tieneOverflowMobile ? 'ERROR' : 'OK',
    detalle: tieneOverflowMobile
      ? 'La pagina tiene contenido que se sale del ancho en mobile — el usuario tiene que hacer scroll horizontal'
      : 'No hay overflow horizontal en mobile'
  });

  // 2. Zoom deshabilitado (user-scalable=no)
  const zoomDeshabilitado = await paginaMobile.evaluate(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return false;
    const content = viewport.getAttribute('content') || '';
    return content.includes('user-scalable=no') || content.includes('user-scalable=0') || content.includes('maximum-scale=1');
  });

  checks.push({
    nombre: 'Zoom en mobile',
    estado: zoomDeshabilitado ? 'ADVERTENCIA' : 'OK',
    detalle: zoomDeshabilitado
      ? 'El zoom esta deshabilitado en mobile — afecta accesibilidad y puede penalizar en Google'
      : 'El zoom esta permitido en mobile'
  });

  // 3. Tap targets pequeños (menos de 44px)
  const tapTargetsPequenos = await paginaMobile.evaluate(() => {
    const elementos = Array.from(document.querySelectorAll('a, button, input, select, [role="button"]'));
    const pequenos = [];
    for (const el of elementos) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue; // no visible
      if (rect.width < 44 || rect.height < 44) {
        const texto = el.textContent.trim().slice(0, 40) || el.getAttribute('aria-label') || el.type || '(sin texto)';
        pequenos.push({ texto, ancho: Math.round(rect.width), alto: Math.round(rect.height) });
      }
    }
    return pequenos.slice(0, 10);
  });

  checks.push({
    nombre: 'Botones y links tocables en mobile',
    estado: tapTargetsPequenos.length === 0 ? 'OK' : tapTargetsPequenos.length <= 3 ? 'ADVERTENCIA' : 'ERROR',
    detalle: tapTargetsPequenos.length === 0
      ? 'Todos los elementos interactivos tienen tamaño adecuado en mobile (minimo 44x44px)'
      : `${tapTargetsPequenos.length} elemento(s) demasiado pequeños para tocar con el dedo`,
    items: tapTargetsPequenos.map(t => `"${t.texto}" — ${t.ancho}x${t.alto}px`)
  });

  // 4. Inputs con tipo correcto en mobile
  const inputsTipoIncorrecto = await paginaMobile.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const problemas = [];
    for (const input of inputs) {
      const nombre = (input.name || input.id || input.placeholder || '').toLowerCase();
      const tipo = input.type || 'text';

      if ((nombre.includes('email') || nombre.includes('correo')) && tipo !== 'email') {
        problemas.push(`Campo "${input.name || input.placeholder}" parece ser email pero tipo="${tipo}"`);
      }
      if ((nombre.includes('tel') || nombre.includes('phone') || nombre.includes('celular') || nombre.includes('movil')) && tipo !== 'tel') {
        problemas.push(`Campo "${input.name || input.placeholder}" parece ser telefono pero tipo="${tipo}"`);
      }
      if ((nombre.includes('numero') || nombre.includes('number') || nombre.includes('cantidad')) && tipo !== 'number') {
        problemas.push(`Campo "${input.name || input.placeholder}" parece ser numero pero tipo="${tipo}"`);
      }
    }
    return problemas.slice(0, 10);
  });

  checks.push({
    nombre: 'Teclado correcto en inputs mobile',
    estado: inputsTipoIncorrecto.length === 0 ? 'OK' : 'ADVERTENCIA',
    detalle: inputsTipoIncorrecto.length === 0
      ? 'Los campos de formulario abren el teclado correcto en mobile'
      : `${inputsTipoIncorrecto.length} campo(s) con tipo incorrecto — el usuario vera el teclado equivocado`,
    items: inputsTipoIncorrecto
  });

  // 5. Menu hamburguesa — detectar y verificar
  const menuInfo = await paginaMobile.evaluate(() => {
    const selectores = [
      '[class*="hamburger"]', '[class*="burger"]', '[class*="menu-toggle"]',
      '[class*="nav-toggle"]', '[aria-label*="menu"]', '[aria-label*="Menu"]',
      'button[class*="menu"]', '.toggle', '#menu-toggle'
    ];
    let botonMenu = null;
    for (const sel of selectores) {
      botonMenu = document.querySelector(sel);
      if (botonMenu) break;
    }
    if (!botonMenu) return { detectado: false };

    const rect = botonMenu.getBoundingClientRect();
    return {
      detectado: true,
      visible: rect.width > 0 && rect.height > 0,
      texto: botonMenu.textContent.trim() || botonMenu.getAttribute('aria-label') || '(icono)'
    };
  });

  if (menuInfo.detectado) {
    // Intentar hacer click y ver si algo cambia
    try {
      const estadoAntes = await paginaMobile.evaluate(() => {
        const nav = document.querySelector('nav, [role="navigation"]');
        return nav ? window.getComputedStyle(nav).display : null;
      });

      const botonMenu = await paginaMobile.$('[class*="hamburger"], [class*="burger"], [class*="menu-toggle"], [class*="nav-toggle"], button[class*="menu"]');
      if (botonMenu) await botonMenu.click();
      await paginaMobile.waitForTimeout(500);

      const estadoDespues = await paginaMobile.evaluate(() => {
        const nav = document.querySelector('nav, [role="navigation"]');
        return nav ? window.getComputedStyle(nav).display : null;
      });

      const menuFunciona = estadoAntes !== estadoDespues || estadoDespues !== 'none';
      checks.push({
        nombre: 'Menu hamburguesa',
        estado: menuFunciona ? 'OK' : 'ADVERTENCIA',
        detalle: menuFunciona
          ? 'Menu hamburguesa detectado y funciona al hacer click'
          : 'Menu hamburguesa detectado pero no parece abrir al hacer click'
      });
    } catch {
      checks.push({
        nombre: 'Menu hamburguesa',
        estado: 'ADVERTENCIA',
        detalle: 'Menu hamburguesa detectado pero no se pudo verificar si abre correctamente'
      });
    }
  } else {
    checks.push({
      nombre: 'Menu hamburguesa',
      estado: 'OK',
      detalle: 'No se detecto menu hamburguesa (puede que la navegacion sea visible directamente en mobile)'
    });
  }

  // 6. Fuente legible en mobile (minimo 12px)
  const fuentesPequenas = await paginaMobile.evaluate(() => {
    const elementos = Array.from(document.querySelectorAll('p, span, li, td, label, a'));
    const pequenos = [];
    for (const el of elementos) {
      if (el.offsetParent === null) continue; // no visible
      const tamano = parseFloat(window.getComputedStyle(el).fontSize);
      if (tamano < 12) {
        const texto = el.textContent.trim().slice(0, 40);
        if (texto) pequenos.push({ texto, tamano: `${tamano}px` });
      }
    }
    return pequenos.slice(0, 5);
  });

  checks.push({
    nombre: 'Texto legible en mobile',
    estado: fuentesPequenas.length === 0 ? 'OK' : 'ADVERTENCIA',
    detalle: fuentesPequenas.length === 0
      ? 'El texto tiene tamaño legible en mobile (12px o mas)'
      : `${fuentesPequenas.length} elemento(s) con texto demasiado pequeño en mobile`,
    items: fuentesPequenas.map(f => `"${f.texto}..." — ${f.tamano}`)
  });

  await paginaMobile.close();

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'Mobile',
    estado: estadoGeneral,
    checks
  };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkMobile };
