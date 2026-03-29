/**
 * SECCION 4 — MOBILE
 * Verifica si el sitio es responsive en viewport mobile (390px)
 */

async function checkMobile({ page, context }) {
  const checks = [];

  const paginaMobile = await context.newPage();
  await paginaMobile.setViewportSize({ width: 390, height: 844 });

  try {
    await paginaMobile.goto(page.url(), { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    await paginaMobile.close();
    return {
      nombre: 'Mobile',
      estado: 'ADVERTENCIA',
      checks: [{ nombre: 'Responsive', estado: 'ADVERTENCIA', detalle: 'No se pudo cargar la pagina en viewport mobile' }]
    };
  }

  // Responsive — overflow horizontal
  const tieneOverflow = await paginaMobile.evaluate(() => {
    return document.body.scrollWidth > document.documentElement.clientWidth + 10;
  });

  // Meta viewport configurado
  const tieneViewport = await paginaMobile.evaluate(() => {
    const vp = document.querySelector('meta[name="viewport"]');
    return vp ? vp.getAttribute('content') : null;
  });

  const viewportCorrecto = tieneViewport && tieneViewport.includes('width=device-width');

  if (!tieneViewport) {
    checks.push({
      nombre: 'Responsive',
      estado: 'ERROR',
      detalle: 'Sin meta viewport — la pagina NO esta preparada para mobile, se ve como version desktop en telefono'
    });
  } else if (tieneOverflow) {
    checks.push({
      nombre: 'Responsive',
      estado: 'ERROR',
      detalle: 'Meta viewport presente pero hay contenido que se sale del ancho en mobile — el usuario tiene que hacer scroll horizontal'
    });
  } else if (!viewportCorrecto) {
    checks.push({
      nombre: 'Responsive',
      estado: 'ADVERTENCIA',
      detalle: `Meta viewport configurado pero posiblemente incorrecto: "${tieneViewport}"`
    });
  } else {
    checks.push({
      nombre: 'Responsive',
      estado: 'OK',
      detalle: 'El sitio es responsive — se adapta correctamente a mobile (390px)'
    });
  }

  await paginaMobile.close();

  return { nombre: 'Mobile', estado: calcularEstado(checks), checks };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkMobile };
