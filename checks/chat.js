/**
 * SECCION 6 — CHAT Y ATENCION
 * Chatbot vs chat en vivo, herramientas detectadas, tiempo de respuesta
 */

async function checkChat({ page }) {
  const checks = [];

  const chatInfo = await page.evaluate(() => {
    const herramientas = [];

    const detectores = [
      { nombre: 'Intercom', tipo: 'chat en vivo', señal: () => !!window.Intercom || !!document.querySelector('#intercom-container, .intercom-launcher') },
      { nombre: 'Drift', tipo: 'chat en vivo', señal: () => !!window.drift || !!document.querySelector('#drift-widget, .drift-widget-container') },
      { nombre: 'Zendesk Chat', tipo: 'chat en vivo', señal: () => !!window.zE || !!document.querySelector('#launcher, [data-product="web_widget"]') },
      { nombre: 'HubSpot Chat', tipo: 'chat en vivo', señal: () => !!window.HubSpotConversations || !!document.querySelector('#hubspot-messages-iframe-container') },
      { nombre: 'LiveChat', tipo: 'chat en vivo', señal: () => !!window.LiveChatWidget || !!document.querySelector('#chat-widget-container') },
      { nombre: 'Tidio', tipo: 'chatbot / chat en vivo', señal: () => !!window.tidioChatApi || !!document.querySelector('#tidio-chat, #tidio-chat-iframe') },
      { nombre: 'ManyChat', tipo: 'chatbot', señal: () => !!document.querySelector('[class*="manychat"], script[src*="manychat"]') },
      { nombre: 'Chatbase', tipo: 'chatbot IA', señal: () => !!document.querySelector('script[src*="chatbase"]') },
      { nombre: 'Crisp', tipo: 'chat en vivo', señal: () => !!window.$crisp || !!document.querySelector('.crisp-client') },
      { nombre: 'Tawk.to', tipo: 'chat en vivo', señal: () => !!window.Tawk_API || !!document.querySelector('#tawkchat-container, #tawk-bubble-container') },
      { nombre: 'WhatsApp Widget', tipo: 'chat WhatsApp', señal: () => !!(document.querySelector('[class*="whatsapp-widget"], [class*="wa-widget"]') || (document.querySelectorAll('a[href*="wa.me"]').length > 0 && document.querySelectorAll('a[href*="wa.me"]')[0]?.getBoundingClientRect().bottom > window.innerHeight * 0.7)) },
    ];

    for (const d of detectores) {
      try {
        if (d.señal()) herramientas.push({ nombre: d.nombre, tipo: d.tipo });
      } catch { }
    }

    return herramientas;
  });

  if (chatInfo.length === 0) {
    checks.push({
      nombre: 'Chat de atencion',
      estado: 'ADVERTENCIA',
      detalle: 'No se detecto ninguna herramienta de chat o atencion al cliente en la pagina'
    });
  } else {
    const chatEnVivo = chatInfo.filter(c => c.tipo.includes('en vivo'));
    const chatbots = chatInfo.filter(c => c.tipo.includes('chatbot'));

    checks.push({
      nombre: 'Chat / atencion al cliente',
      estado: 'OK',
      detalle: `${chatInfo.length} herramienta(s) detectada(s): ${chatInfo.map(c => `${c.nombre} (${c.tipo})`).join(', ')}`,
      items: [
        chatEnVivo.length > 0 ? `Chat en vivo: ${chatEnVivo.map(c => c.nombre).join(', ')}` : null,
        chatbots.length > 0 ? `Chatbots: ${chatbots.map(c => c.nombre).join(', ')}` : null
      ].filter(Boolean)
    });
  }

  // Detectar si el chat tiene mensaje de bienvenida o tiempo de respuesta visible
  const mensajeBienvenida = await page.evaluate(() => {
    const textos = ['tipicamente responde en', 'typically replies', 'tiempo de respuesta', 'en linea', 'online', 'disponible', 'available'];
    const texto = document.body.innerText.toLowerCase();
    return textos.some(t => texto.includes(t));
  });

  if (chatInfo.length > 0) {
    checks.push({
      nombre: 'Mensaje de disponibilidad en chat',
      estado: mensajeBienvenida ? 'OK' : 'ADVERTENCIA',
      detalle: mensajeBienvenida
        ? 'Se muestra tiempo de respuesta o disponibilidad en el chat'
        : 'El chat no muestra tiempo de respuesta — los usuarios no saben cuando esperar respuesta'
    });
  }

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'Chat y Atencion',
    estado: estadoGeneral,
    checks
  };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkChat };
