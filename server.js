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
const { checkEcommerce } = require('./checks/ecommerce');
const { checkTracking } = require('./checks/tracking');
const { checkSEO } = require('./checks/seo');
const { checkTecnologia } = require('./checks/tecnologia');
const { generarReporteHTML } = require('./reporte/html');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'qa-bot-arsen-4.0', timestamp: new Date().toISOString() });
});

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

    // Capturar errores JS y requests fallidos globalmente
    const erroresJS = [];
    const requestsFallidos = [];
    page.on('pageerror', err => erroresJS.push(err.message));
    page.on('requestfailed', req => requestsFallidos.push({
      url: req.url(),
      motivo: req.failure()?.errorText
    }));

    // Navegar a la URL
    let httpStatus = null;
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      httpStatus = response?.status();
    } catch (e) {
      await browser.close();
      return res.status(200).json({
        reporteId,
        url,
        error: `No se pudo cargar la pagina: ${e.message}`,
        status: 'ERROR'
      });
    }

    const contextoGlobal = { url, page, context, browser, erroresJS, requestsFallidos, httpStatus, mailtrap_token, mailtrap_inbox_id };

    console.log(`[${reporteId}] Pagina cargada (${httpStatus}), ejecutando checks...`);

    // Ejecutar todas las secciones en paralelo donde sea posible
    const [
      saludTecnica,
      rendimiento,
      mobile,
      negocio,
      chat,
      contenido,
      ecommerce,
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
      checkEcommerce(contextoGlobal),
      checkTracking(contextoGlobal),
      checkSEO(contextoGlobal),
      checkTecnologia(contextoGlobal)
    ]);

    // Formularios requiere la pagina en estado desktop (se corre despues)
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
        ecommerce,
        tracking,
        seo,
        tecnologia
      },
      resumen: generarResumen({ saludTecnica, rendimiento, formularios, mobile, negocio, chat, contenido, ecommerce, tracking, seo, tecnologia })
    };

    console.log(`[${reporteId}] Analisis completado en ${tiempoTotal}s`);
    res.json(reporte);

  } catch (error) {
    if (browser) await browser.close();
    console.error(`[${reporteId}] Error:`, error.message);
    res.status(500).json({ error: error.message, reporteId });
  }
});

// Endpoint para reporte HTML descargable
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

// Endpoint para reporte PDF via Gotenberg
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

    if (!response.ok) {
      throw new Error(`Gotenberg respondio con ${response.status}`);
    }

    const pdfBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-qa-${reporte.reporteId}.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('Error generando PDF:', error.message);
    // Fallback: devolver HTML si Gotenberg falla
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
