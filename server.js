const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { chromium } = require('playwright');

const { checkSaludTecnica } = require('./checks/saludTecnica');
const { checkRendimiento } = require('./checks/rendimiento');
const { checkFormularios } = require('./checks/formularios');
const { checkMobile } = require('./checks/mobile');
const { checkNegocio } = require('./checks/negocio');
const { checkChat } = require('./checks/chat');
const { checkContenido } = require('./checks/contenido');
const { checkTracking } = require('./checks/tracking');
const { checkSEO } = require('./checks/seo');
const { checkTecnologia } = require('./checks/tecnologia');
const { generarReporteHTML } = require('./reporte/html');

const app = express();

app.use(cors({
  origin: [
    'https://app.pedroarandamarketing.com',
    'https://pedroarandamarketing.com',
    'http://localhost:3000',
    'http://localhost:8080'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'qa-bot-arsen-4.0', timestamp: new Date().toISOString() });
});

// Detecta el origen del error HTTP a partir de headers y contenido de la pagina
function detectarOrigenError(headers, contenidoPagina) {
  const server   = (headers['server']              || '').toLowerCase();
  const via      = (headers['via']                 || '').toLowerCase();
  const powered  = (headers['x-powered-by']        || '').toLowerCase();
  const cfRay    = headers['cf-ray']               || '';
  const sgId     = headers['x-sg-id']              || headers['x-siteground-id'] || '';
  const sucuri   = headers['x-sucuri-id']          || headers['x-sucuri-cache']  || '';
  const contenido = (contenidoPagina || '').toLowerCase();

  const causas = [];

  // Origen del servidor
  if (cfRay)                              causas.push('generado por Cloudflare');
  else if (sgId || server.includes('siteground') || contenido.includes('siteground'))
                                          causas.push('generado por SiteGround');
  else if (sucuri || contenido.includes('sucuri'))
                                          causas.push('generado por Sucuri WAF');
  else if (server.includes('litespeed'))  causas.push('generado por LiteSpeed');
  else if (server.includes('nginx'))      causas.push('generado por nginx');
  else if (server.includes('apache'))     causas.push('generado por Apache');
  else if (server)                        causas.push(`generado por ${headers['server']}`);

  // Causa probable
  if (contenido.includes('bot') || contenido.includes('automated') || contenido.includes('crawler'))
    causas.push('bloqueado como bot/crawler');
  else if (contenido.includes('maintenance') || contenido.includes('mantenimiento'))
    causas.push('sitio en mantenimiento');
  else if (contenido.includes('password') || contenido.includes('authorization required') || contenido.includes('contrasena'))
    causas.push('directorio protegido con contrasena');
  else if (contenido.includes('ip') && (contenido.includes('block') || contenido.includes('banned')))
    causas.push('IP bloqueada');
  else if (contenido.includes('geo') || contenido.includes('region') || contenido.includes('country'))
    causas.push('restriccion geografica');
  else
    causas.push('posible bloqueo por reglas de seguridad o URL incorrecta');

  return causas.join(' — ');
}

app.post('/qa/execute', async (req, res) => {
  const { url, cliente, proyecto, mailtrap_token, mailtrap_inbox_id } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Se requiere una URL' });
  }

  const reporteId = uuidv4();
  const inicioAnalisis = Date.now();

  console.log(`[${reporteId}] Iniciando analisis de: ${url}`);

  let browser;
  try {
    browser = await chromium.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu'
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: false
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    const erroresJS = [];
    const requestsFallidos = [];
    page.on('pageerror', err => erroresJS.push(err.message));
    page.on('requestfailed', req => requestsFallidos.push({
      url: req.url(),
      motivo: req.failure()?.errorText
    }));

    let httpStatus  = null;
    let httpHeaders = {};
    try {
      try {
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
        httpStatus  = response?.status();
        httpHeaders = response?.headers() || {};
      } catch (e) {
        if (e.message.includes('Timeout')) {
          console.log(`[${reporteId}] networkidle timeout, reintentando con domcontentloaded...`);
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          httpStatus  = response?.status();
          httpHeaders = response?.headers() || {};
          await page.waitForTimeout(3000);
        } else {
          throw e;
        }
      }
    } catch (e) {
      await browser.close();
      return res.status(200).json({
        reporteId,
        url,
        error: `No se pudo cargar la pagina: ${e.message}`,
        status: 'ERROR'
      });
    }

    // Si la pagina tiene status de error, verificar si es pagina de error real
    // o si cargo contenido de todas formas (Cloudflare / WAF / redireccion JS)
    if (httpStatus && httpStatus >= 400) {
      const infoError = await page.evaluate(() => {
        const titulo    = (document.title || '').trim();
        const texto     = (document.body?.innerText || '').trim();
        const esErrorPorTitulo    = /^(403|404|500|502|503|forbidden|not found|access denied|error)\b/i.test(titulo);
        const esErrorPorContenido = texto.length < 500;
        return { titulo, snippet: texto.slice(0, 300), esError: esErrorPorTitulo || esErrorPorContenido };
      });

      if (infoError.esError) {
        const origen = detectarOrigenError(httpHeaders, infoError.snippet);
        await browser.close();
        const tiempoTotal = Math.round((Date.now() - inicioAnalisis) / 1000);
        console.log(`[${reporteId}] Pagina bloqueada (HTTP ${httpStatus}): ${origen}`);
        return res.json({
          reporteId,
          cliente: cliente || null,
          proyecto: proyecto || null,
          url,
          analizadoEn: new Date().toISOString(),
          tiempoAnalisis: `${tiempoTotal}s`,
          secciones: {
            saludTecnica: {
              nombre: 'Salud Tecnica',
              estado: 'ERROR',
              checks: [{
                nombre: 'Estado HTTP',
                estado: 'ERROR',
                detalle: `HTTP ${httpStatus} — ${origen}`,
                items: infoError.snippet ? [`Mensaje del servidor: "${infoError.snippet.slice(0, 200)}"`] : []
              }]
            }
          },
          resumen: {
            estadoFinal: 'CRITICO',
            recomendacion: `HTTP ${httpStatus} — ${origen}. Corrige la URL o revisa las reglas de seguridad del servidor.`,
            criticos: 1,
            advertencias: 0,
            ok: 0,
            totalSecciones: 1
          }
        });
      }

      // Tiene contenido real a pesar del status de error (Cloudflare / WAF) — continuar
      console.log(`[${reporteId}] HTTP ${httpStatus} pero pagina tiene contenido — continuando analisis`);
    }

    const contextoGlobal = { url, page, context, browser, erroresJS, requestsFallidos, httpStatus, mailtrap_token, mailtrap_inbox_id };

    console.log(`[${reporteId}] Pagina cargada (${httpStatus}), ejecutando checks...`);

    const [
      saludTecnica,
      rendimiento,
      mobile,
      negocio,
      chat,
      contenido,
      tracking,
      seo,
      tecnologia
    ] = await Promise.all([
      checkSaludTecnica(contextoGlobal),
      checkRendimiento(contextoGlobal),
      checkMobile(contextoGlobal),
      checkNegocio(contextoGlobal),
      checkChat(contextoGlobal),
      checkContenido(contextoGlobal),
      checkTracking(contextoGlobal),
      checkSEO(contextoGlobal),
      checkTecnologia(contextoGlobal)
    ]);

    const formularios = await checkFormularios(contextoGlobal);

    await browser.close();

    const tiempoTotal = Math.round((Date.now() - inicioAnalisis) / 1000);

    const reporte = {
      reporteId,
      cliente: cliente || null,
      proyecto: proyecto || null,
      url,
      analizadoEn: new Date().toISOString(),
      tiempoAnalisis: `${tiempoTotal}s`,
      secciones: {
        saludTecnica,
        rendimiento,
        formularios,
        mobile,
        negocio,
        chat,
        contenido,
        tracking,
        seo,
        tecnologia
      },
      resumen: generarResumen({ saludTecnica, rendimiento, formularios, mobile, negocio, chat, contenido, tracking, seo, tecnologia })
    };

    console.log(`[${reporteId}] Analisis completado en ${tiempoTotal}s`);
    res.json(reporte);

  } catch (error) {
    if (browser) await browser.close();
    console.error(`[${reporteId}] Error:`, error.message);
    res.status(500).json({ error: error.message, reporteId });
  }
});

app.post('/qa/reporte-html', async (req, res) => {
  const reporte = req.body;
  if (!reporte || !reporte.reporteId) {
    return res.status(400).json({ error: 'Se requiere el reporte completo' });
  }
  const html = generarReporteHTML(reporte);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="reporte-qa-${reporte.reporteId}.html"`);
  res.send(html);
});

app.post('/qa/reporte-pdf', async (req, res) => {
  const reporte = req.body;
  if (!reporte || !reporte.reporteId) {
    return res.status(400).json({ error: 'Se requiere el reporte completo' });
  }

  const html = generarReporteHTML(reporte);
  const GOTENBERG_URL = process.env.GOTENBERG_URL || 'https://pdf.pedroarandamarketing.com/forms/chromium/convert/html';
  const GOTENBERG_AUTH = process.env.GOTENBERG_AUTH || 'Basic MmNaWDMzTWZ4UHVpY1pZVzpHZVZES0xuS0xJaUk1RWxpU3BPTldVRFZWR0JDZTI2WQ==';

  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('files', Buffer.from(html, 'utf-8'), { filename: 'index.html', contentType: 'text/html' });
    form.append('paperWidth', '8.27');
    form.append('marginTop', '0.3');
    form.append('marginBottom', '0.3');
    form.append('marginLeft', '0');
    form.append('marginRight', '0');
    form.append('printBackground', 'true');

    const response = await fetch(GOTENBERG_URL, {
      method: 'POST',
      headers: { 'Authorization': GOTENBERG_AUTH, ...form.getHeaders() },
      body: form
    });

    if (!response.ok) throw new Error(`Gotenberg respondio con ${response.status}`);

    const pdfBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-qa-${reporte.reporteId}.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('Error generando PDF:', error.message);
    res.status(500).json({ error: `No se pudo generar el PDF: ${error.message}` });
  }
});

function generarResumen(secciones) {
  const todas = Object.values(secciones);
  const criticos = todas.filter(s => s.estado === 'ERROR').length;
  const advertencias = todas.filter(s => s.estado === 'ADVERTENCIA').length;
  const ok = todas.filter(s => s.estado === 'OK').length;

  let estadoFinal, recomendacion;
  if (criticos > 0) {
    estadoFinal = 'CRITICO';
    recomendacion = `${criticos} problema(s) critico(s) que requieren atencion inmediata`;
  } else if (advertencias > 0) {
    estadoFinal = 'ADVERTENCIAS';
    recomendacion = `${advertencias} punto(s) a revisar con tu equipo`;
  } else {
    estadoFinal = 'OK';
    recomendacion = 'Todo se ve bien';
  }

  return { estadoFinal, recomendacion, criticos, advertencias, ok, totalSecciones: todas.length };
}

app.listen(PORT, () => {
  console.log(`QA Bot ARSEN 4.0 corriendo en puerto ${PORT}`);
});
