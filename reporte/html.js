/**
 * Generador de reporte HTML legible para humanos
 * Compatible con Gotenberg para conversion a PDF
 */

function generarReporteHTML(reporte) {
  const { reporteId, cliente, proyecto, url, analizadoEn, tiempoAnalisis, secciones, resumen } = reporte;

  const fecha = new Date(analizadoEn).toLocaleString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const estadoColor = { 'OK': '#22c55e', 'ADVERTENCIA': '#f59e0b', 'ERROR': '#ef4444' };
  const estadoEmoji = { 'OK': '✅', 'ADVERTENCIA': '⚠️', 'ERROR': '❌' };
  const estadoBg = { 'OK': '#f0fdf4', 'ADVERTENCIA': '#fffbeb', 'ERROR': '#fef2f2' };

  function badgeEstado(estado) {
    const color = estadoColor[estado] || '#6b7280';
    const bg = estadoBg[estado] || '#f9fafb';
    return `<span style="background:${bg};color:${color};border:1px solid ${color};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap">${estadoEmoji[estado] || ''} ${estado}</span>`;
  }

  function renderChecks(checks) {
    if (!checks || checks.length === 0) return '';
    return checks.map(check => {
      const color = estadoColor[check.estado] || '#6b7280';
      const bg = estadoBg[check.estado] || '#f9fafb';
      const items = check.items && check.items.length > 0
        ? `<ul style="margin:6px 0 0 0;padding-left:18px;">${check.items.map(i => `<li style="color:#374151;font-size:13px;margin-bottom:3px">${escapeHtml(String(i))}</li>`).join('')}</ul>`
        : '';
      return `
        <div style="background:${bg};border-left:3px solid ${color};padding:10px 14px;margin-bottom:8px;border-radius:4px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:0">
              <span style="font-weight:600;color:#111827;font-size:14px">${escapeHtml(check.nombre)}</span>
              <p style="margin:4px 0 0 0;color:#4b5563;font-size:13px;line-height:1.5">${escapeHtml(check.detalle)}</p>
              ${items}
            </div>
            <div style="flex-shrink:0">${badgeEstado(check.estado)}</div>
          </div>
        </div>`;
    }).join('');
  }

  function renderSeccion(seccion) {
    if (!seccion) return '';
    const color = estadoColor[seccion.estado] || '#6b7280';
    return `
      <div style="margin-bottom:32px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${color};padding-bottom:8px;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <h2 style="margin:0;font-size:18px;color:#111827;font-weight:700">${escapeHtml(seccion.nombre)}</h2>
          ${badgeEstado(seccion.estado)}
        </div>
        ${renderChecks(seccion.checks)}
      </div>`;
  }

  const colorResumen = estadoColor[resumen?.estadoFinal] || '#6b7280';
  const bgResumen = estadoBg[resumen?.estadoFinal] || '#f9fafb';

  const seccionesHTML = Object.values(secciones).map(renderSeccion).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte QA — ${escapeHtml(url)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 0; background: #f8fafc; color: #111827;
      font-size: 14px; line-height: 1.6;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 24px; }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: white; padding: 32px 40px; border-radius: 12px; margin-bottom: 32px;
    }
    .header h1 { margin: 0 0 4px 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
    .header .subtitle { opacity: 0.7; font-size: 13px; margin-bottom: 20px; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 20px; }
    .meta-item { background: rgba(255,255,255,0.1); padding: 10px 14px; border-radius: 8px; }
    .meta-item .label { font-size: 11px; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta-item .value { font-size: 14px; font-weight: 600; margin-top: 2px; word-break: break-all; }
    .resumen {
      background: ${bgResumen}; border: 2px solid ${colorResumen};
      border-radius: 12px; padding: 24px 28px; margin-bottom: 32px;
    }
    .resumen h2 { margin: 0 0 8px 0; font-size: 20px; color: ${colorResumen}; }
    .resumen .estado-label { font-size: 28px; font-weight: 800; color: ${colorResumen}; }
    .resumen .recomendacion { color: #4b5563; margin-top: 8px; font-size: 15px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
    .stat { background: white; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid #e5e7eb; }
    .stat .numero { font-size: 28px; font-weight: 800; }
    .stat .etiqueta { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .secciones { background: white; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb; }
    @media print {
      body { background: white; }
      .container { padding: 20px; }
      .header { border-radius: 8px; }
    }
    @media (max-width: 600px) {
      .container { padding: 16px; }
      .header { padding: 20px; }
      .stats { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="subtitle">QA Bot ARSEN 4.0</p>
      <h1>Reporte de Auditoria Web</h1>
      <div class="meta-grid">
        <div class="meta-item">
          <div class="label">URL Analizada</div>
          <div class="value">${escapeHtml(url)}</div>
        </div>
        ${cliente ? `<div class="meta-item"><div class="label">Cliente</div><div class="value">${escapeHtml(cliente)}</div></div>` : ''}
        ${proyecto ? `<div class="meta-item"><div class="label">Proyecto</div><div class="value">${escapeHtml(proyecto)}</div></div>` : ''}
        <div class="meta-item">
          <div class="label">Fecha</div>
          <div class="value">${fecha}</div>
        </div>
        <div class="meta-item">
          <div class="label">Tiempo de analisis</div>
          <div class="value">${tiempoAnalisis || 'N/A'}</div>
        </div>
        <div class="meta-item">
          <div class="label">ID de reporte</div>
          <div class="value" style="font-size:11px">${reporteId}</div>
        </div>
      </div>
    </div>

    <div class="resumen">
      <h2>Resultado General</h2>
      <div class="estado-label">${estadoEmoji[resumen?.estadoFinal] || ''} ${resumen?.estadoFinal || 'N/A'}</div>
      <div class="recomendacion">${escapeHtml(resumen?.recomendacion || '')}</div>
      <div class="stats">
        <div class="stat">
          <div class="numero" style="color:#ef4444">${resumen?.criticos || 0}</div>
          <div class="etiqueta">Criticos</div>
        </div>
        <div class="stat">
          <div class="numero" style="color:#f59e0b">${resumen?.advertencias || 0}</div>
          <div class="etiqueta">Advertencias</div>
        </div>
        <div class="stat">
          <div class="numero" style="color:#22c55e">${resumen?.ok || 0}</div>
          <div class="etiqueta">OK</div>
        </div>
      </div>
    </div>

    <div class="secciones">
      ${seccionesHTML}
    </div>

    <div style="text-align:center;margin-top:24px;color:#9ca3af;font-size:12px">
      Generado por QA Bot ARSEN 4.0 &bull; ${fecha} &bull; ID: ${reporteId}
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { generarReporteHTML };
