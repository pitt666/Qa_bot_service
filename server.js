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

app.post('/qa/execute', async (req, res) => {
  const { url, cliente, proyecto, mailtrap_token, mailtrap_inbox_id } = req.body;

  if (!url) return res.status(400).json({ error: 'Se requiere una URL' });

  const reporteId = uuidv4();
  const inicioAnalisis = Date.now();
  console.log(`[${reporteId}] Iniciando analisis de: ${url}`);

  let browser;
  try {
    browser = await chromium.launch({
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-blink-features=AutomationControlled','--disable-gpu']
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
    page.on('requestfailed', req => requestsFallidos.push({ url: req.url(), motivo: req.failure()?.errorText }));

    let httpStatus = null;
    try {
      try {
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
        httpStatus = response?.status();
      } catch (e) {
        if (e.message.includes('Timeout')) {
          console.log(`[${reporteId}] networkidle timeout, reintentando con domcontentloaded...`);
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          httpStatus = response?.status();
        } else { throw e; }
      }

      // Smart wait: esperar GTM y Tochat/Chatwit (o confirmar que no estan), max 5s
      await page.waitForFunction(() => {
        const gtmListo = !window.dataLayer || window.dataLayer.some(e => e.event && e.event !== 'gtm.js');
        const sinScriptTochat = !document.querySelector('script[src*="tochat"],script[src*="chatwit"]');
        const tochatCargado = !!document.querySelector('[class*="tochat"],[id*="tochat"],[class*="chatwit"],[id*="chatwit"]');
        return gtmListo && (sinScriptTochat || tochatCargado);
      }, { timeout: 5000 }).catch(() => {});

    } catch (e) {
      await browser.close();
      return res.status(200).json({ reporteId, url, error: `No se pudo cargar la pagina: ${e.message}`, status: 'ERROR' });
    }

    const contextoGlobal = { url, page, context, browser, erroresJS, requestsFallidos, httpStatus, mailtrap_token, mailtrap_inbox_id };
    console.log(`[${reporteId}] Pagina cargada (${httpStatus}), ejecutando checks...`);

    const [saludTecnica, rendimiento, mobile, negocio, chat, contenido, tracking, seo, tecnologia] = await Promise.all([
      safeCheck(() => checkSaludTecnica(contextoGlobal), 'Salud Tecnica'),
      safeCheck(() => checkRendimiento(contextoGlobal), 'Rendimiento'),
      safeCheck(() => checkMobile(contextoGlobal), 'Mobile'),
      safeCheck(() => checkNegocio(contextoGlobal), 'Negocio y Confianza'),
      safeCheck(() => checkChat(contextoGlobal), 'Chat y Atencion'),
      safeCheck(() => checkContenido(contextoGlobal), 'Contenido'),
      safeCheck(() => checkTracking(contextoGlobal), 'Tracking'),
      safeCheck(() => checkSEO(contextoGlobal), 'SEO'),
      safeCheck(() => checkTecnologia(contextoGlobal), 'Tecnologia')
    ]);

    const formularios = await safeCheck(() => checkFormularios(contextoGlobal), 'Formularios y Conversion');
    await browser.close();

    const tiempoTotal = Math.round((Date.now() - inicioAnalisis) / 1000);
    const reporte = {
      reporteId, cliente: cliente || null, proyecto: proyecto || null, url,
      analizadoEn: new Date().toISOString(),
      tiempoAnalisis: `${tiempoTotal}s`,
      secciones: { saludTecnica, rendimiento, formularios, mobile, negocio, chat, contenido, tracking, seo, tecnologia },
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
  if (!reporte || !reporte.reporteId) return res.status(400).json({ error: 'Se requiere el reporte completo' });
  const html = generarReporteHTML(reporte);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="reporte-qa-${reporte.reporteId}.html"`);
  res.send(html);
});

app.post('/qa/reporte-pdf', async (req, res) => {
  const reporte = req.body;
  if (!reporte || !reporte.reporteId) return res.status(400).json({ error: 'Se requiere el reporte completo' });
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
    const response = await fetch(GOTENBERG_URL, { method: 'POST', headers: { 'Authorization': GOTENBERG_AUTH, ...form.getHeaders() }, body: form });
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

const PESOS_SECCION = {
  saludTecnica: 2.0, seo: 1.5, tracking: 1.5, formularios: 1.5,
  rendimiento: 1.2, mobile: 1.2, negocio: 1.0, contenido: 1.0, chat: 0.8, tecnologia: 0.5
};
const PUNTOS_CHECK = { 'OK': 1.0, 'ADVERTENCIA': 0.5, 'ERROR': 0.0 };

function calcularScore(secciones) {
  let suma = 0, maxSuma = 0;
  for (const [key, sec] of Object.entries(secciones)) {
    const peso = PESOS_SECCION[key] ?? 1.0;
    for (const c of (sec?.checks || [])) {
      if (c.estado === 'INFORMATIVO') continue;
      const pts = PUNTOS_CHECK[c.estado];
      if (pts === undefined) continue;
      suma    += pts * peso;
      maxSuma += 1.0 * peso;
    }
  }
  if (maxSuma === 0) return { score: null, letra: 'N/A' };
  const score = Math.round((suma / maxSuma) * 100);
  const letra = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  return { score, letra };
}

function contarChecks(secciones) {
  let ok = 0, adv = 0, err = 0, info = 0;
  for (const sec of Object.values(secciones)) {
    for (const c of (sec?.checks || [])) {
      if      (c.estado === 'OK')          ok++;
      else if (c.estado === 'ADVERTENCIA') adv++;
      else if (c.estado === 'ERROR')       err++;
      else if (c.estado === 'INFORMATIVO') info++;
    }
  }
  return { ok, adv, err, info };
}

function generarResumen(secciones) {
  const todas = Object.values(secciones);
  const seccionesCriticas    = todas.filter(s => s.estado === 'ERROR').length;
  const seccionesAdvertencia = todas.filter(s => s.estado === 'ADVERTENCIA').length;
  const seccionesOk          = todas.filter(s => s.estado === 'OK').length;
  const cnt = contarChecks(secciones);
  const { score, letra } = calcularScore(secciones);
  let estadoFinal, recomendacion;
  if (seccionesCriticas > 0) {
    estadoFinal = 'CRITICO';
    recomendacion = `${cnt.err} problema(s) critico(s) que requieren atencion inmediata`;
  } else if (seccionesAdvertencia > 0) {
    estadoFinal = 'ADVERTENCIAS';
    recomendacion = `${cnt.adv} punto(s) a revisar con tu equipo`;
  } else {
    estadoFinal = 'OK';
    recomendacion = 'Todo se ve bien';
  }
  return { estadoFinal, recomendacion, score, letra, criticos: cnt.err, advertencias: cnt.adv, ok: cnt.ok, informativos: cnt.info, totalSecciones: todas.length, seccionesCriticas, seccionesAdvertencia, seccionesOk };
}

async function safeCheck(fn, defaultName) {
  try {
    return await fn();
  } catch (e) {
    console.error(`[safeCheck] Error en "${defaultName}":`, (e.message || '').slice(0, 200));
    return {
      nombre: defaultName,
      estado: 'ADVERTENCIA',
      checks: [{ nombre: 'Analisis incompleto', estado: 'ADVERTENCIA', detalle: `No se pudo completar el analisis de esta seccion: ${(e.message || 'Error desconocido').slice(0, 150)}` }]
    };
  }
}

app.listen(PORT, () => {
  console.log(`QA Bot ARSEN 4.0 corriendo en puerto ${PORT}`);
});
