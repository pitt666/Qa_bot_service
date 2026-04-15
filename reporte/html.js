/**
 * Generador de reporte HTML compatible con Gotenberg
 */

function generarReporteHTML(reporte) {
  const { reporteId, cliente, proyecto, url, analizadoEn, tiempoAnalisis, secciones, resumen } = reporte;
  const fecha = new Date(analizadoEn).toLocaleString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const eColor = { 'OK': '#22c55e', 'ADVERTENCIA': '#f59e0b', 'ERROR': '#ef4444', 'INFORMATIVO': '#3b82f6' };
  const eEmoji = { 'OK': '\u2705', 'ADVERTENCIA': '\u26a0\ufe0f', 'ERROR': '\u274c', 'INFORMATIVO': '\u2139\ufe0f' };
  const eBg    = { 'OK': '#f0fdf4', 'ADVERTENCIA': '#fffbeb', 'ERROR': '#fef2f2', 'INFORMATIVO': '#eff6ff' };

  const score = resumen?.score;
  const scoreColor =
    score == null ? '#6b7280' :
    score >= 90   ? '#22c55e' :
    score >= 75   ? '#84cc16' :
    score >= 60   ? '#f59e0b' :
    score >= 40   ? '#f97316' :
                    '#ef4444';

  function badge(estado) {
    const c = eColor[estado] || '#6b7280', bg = eBg[estado] || '#f9fafb';
    return `<span style="background:${bg};color:${c};border:1px solid ${c};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">${eEmoji[estado] || ''} ${estado}</span>`;
  }

  function renderChecks(checks) {
    if (!checks?.length) return '';
    return checks.map(c => {
      const col = eColor[c.estado] || '#6b7280', bg = eBg[c.estado] || '#f9fafb';
      const items = c.items?.length ? `<ul style="margin:6px 0 0;padding-left:18px">${c.items.map(i => `<li style="color:#374151;font-size:13px">${esc(String(i))}</li>`).join('')}</ul>` : '';
      return `<div style="background:${bg};border-left:3px solid ${col};padding:10px 14px;margin-bottom:8px;border-radius:4px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div style="flex:1"><span style="font-weight:600;font-size:14px">${esc(c.nombre)}</span><p style="margin:4px 0 0;color:#4b5563;font-size:13px">${esc(c.detalle)}</p>${items}</div><div>${badge(c.estado)}</div></div></div>`;
    }).join('');
  }

  function renderSeccion(s) {
    if (!s) return '';
    const col = eColor[s.estado] || '#6b7280';
    return `<div style="margin-bottom:32px;page-break-inside:avoid"><div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${col};padding-bottom:8px;margin-bottom:16px"><h2 style="margin:0;font-size:18px;font-weight:700">${esc(s.nombre)}</h2>${badge(s.estado)}</div>${renderChecks(s.checks)}</div>`;
  }

  const colRes = eColor[resumen?.estadoFinal] || '#6b7280';
  const bgRes  = eBg[resumen?.estadoFinal]    || '#f9fafb';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte QA — ${esc(url)}</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f8fafc;color:#111827;font-size:14px;line-height:1.6}
.container{max-width:900px;margin:0 auto;padding:40px 24px}
.header{background:linear-gradient(135deg,#0f172a,#1e3a5f);color:white;padding:32px 40px;border-radius:12px;margin-bottom:32px}
.header h1{margin:0 0 4px;font-size:26px;font-weight:800}
.subtitle{opacity:.7;font-size:13px;margin-bottom:20px}
.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:20px}
.meta-item{background:rgba(255,255,255,.1);padding:10px 14px;border-radius:8px}
.meta-item .label{font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:.5px}
.meta-item .value{font-size:14px;font-weight:600;margin-top:2px;word-break:break-all}
.resumen{background:${bgRes};border:2px solid ${colRes};border-radius:12px;padding:24px 28px;margin-bottom:32px}
.resumen h2{margin:0 0 8px;font-size:20px;color:${colRes}}
.estado-label{font-size:28px;font-weight:800;color:${colRes}}
.rec{color:#4b5563;margin-top:8px;font-size:15px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
.stat{background:white;border-radius:8px;padding:12px;text-align:center;border:1px solid #e5e7eb}
.stat .num{font-size:28px;font-weight:800}
.stat .lbl{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
.secciones{background:white;border-radius:12px;padding:32px;border:1px solid #e5e7eb}
@media print{body{background:white}.container{padding:20px}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <p class="subtitle">QA Bot ARSEN 4.0</p>
    <h1>Reporte de Auditoria Web</h1>
    <div class="meta-grid">
      <div class="meta-item"><div class="label">URL</div><div class="value">${esc(url)}</div></div>
      ${cliente ? `<div class="meta-item"><div class="label">Cliente</div><div class="value">${esc(cliente)}</div></div>` : ''}
      ${proyecto ? `<div class="meta-item"><div class="label">Proyecto</div><div class="value">${esc(proyecto)}</div></div>` : ''}
      <div class="meta-item"><div class="label">Fecha</div><div class="value">${fecha}</div></div>
      <div class="meta-item"><div class="label">Tiempo</div><div class="value">${tiempoAnalisis || 'N/A'}</div></div>
      <div class="meta-item"><div class="label">ID</div><div class="value" style="font-size:11px">${reporteId}</div></div>
    </div>
  </div>
  <div class="resumen">
    <h2>Resultado General</h2>
    ${score != null ? `
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin:8px 0 12px">
      <div style="display:flex;align-items:baseline;gap:6px">
        <div style="font-size:64px;font-weight:800;line-height:1;color:${scoreColor}">${score}</div>
        <div style="font-size:20px;color:#6b7280;font-weight:600">/ 100</div>
      </div>
      <div style="background:${scoreColor};color:white;font-size:32px;font-weight:800;width:60px;height:60px;border-radius:8px;display:flex;align-items:center;justify-content:center">${resumen?.letra || '-'}</div>
      <div style="font-size:14px;color:#6b7280">Calificacion ponderada<br><span style="font-size:12px">considera todos los checks por su importancia</span></div>
    </div>` : ''}
    <div class="estado-label">${eEmoji[resumen?.estadoFinal] || ''} ${resumen?.estadoFinal || 'N/A'}</div>
    <div class="rec">${esc(resumen?.recomendacion || '')}</div>
    <div class="stats">
      <div class="stat"><div class="num" style="color:#ef4444">${resumen?.criticos || 0}</div><div class="lbl">Criticos</div></div>
      <div class="stat"><div class="num" style="color:#f59e0b">${resumen?.advertencias || 0}</div><div class="lbl">Advertencias</div></div>
      <div class="stat"><div class="num" style="color:#22c55e">${resumen?.ok || 0}</div><div class="lbl">OK</div></div>
    </div>
  </div>
  <div class="secciones">${Object.values(secciones).map(renderSeccion).join('')}</div>
  <div style="text-align:center;margin-top:24px;color:#9ca3af;font-size:12px">QA Bot ARSEN 4.0 &bull; ${fecha} &bull; ID: ${reporteId}</div>
</div>
</body>
</html>`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

module.exports = { generarReporteHTML };
