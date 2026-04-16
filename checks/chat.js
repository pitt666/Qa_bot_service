/**
 * SECCION 6 — CHAT Y ATENCION
 */

async function checkChat({ page }) {
  const checks = [];

  const herramientas = await page.evaluate(() => {
    const detectores = [
      { nombre: 'Intercom', se\u00f1al: () => !!window.Intercom || !!document.querySelector('#intercom-container, .intercom-launcher') },
      { nombre: 'Drift', se\u00f1al: () => !!window.drift || !!document.querySelector('#drift-widget') },
      { nombre: 'Zendesk Chat', se\u00f1al: () => !!window.zE || !!document.querySelector('[data-product="web_widget"]') },
      { nombre: 'HubSpot Chat', se\u00f1al: () => !!window.HubSpotConversations || !!document.querySelector('#hubspot-messages-iframe-container') },
      { nombre: 'LiveChat', se\u00f1al: () => !!window.LiveChatWidget || !!document.querySelector('#chat-widget-container') },
      { nombre: 'Tidio', se\u00f1al: () => !!window.tidioChatApi || !!document.querySelector('#tidio-chat, #tidio-chat-iframe') },
      { nombre: 'ManyChat', se\u00f1al: () => !!document.querySelector('[class*="manychat"], script[src*="manychat"]') },
      { nombre: 'Crisp', se\u00f1al: () => !!window.$crisp || !!document.querySelector('.crisp-client') },
      { nombre: 'Tawk.to', se\u00f1al: () => !!window.Tawk_API || !!document.querySelector('#tawkchat-container') },
      { nombre: 'Chatbase', se\u00f1al: () => !!document.querySelector('script[src*="chatbase"]') },
      { nombre: 'Tochat / Chatwit', se\u00f1al: () =>
        !!document.querySelector('script[src*="tochat"], script[src*="chatwit"], [class*="tochat"], [class*="chatwit"]') ||
        !!window.tochat || !!window.chatwit
      },
    ];
    return detectores.filter(d => { try { return d.se\u00f1al(); } catch { return false; } }).map(d => d.nombre);
  });

  checks.push({
    nombre: 'Herramientas de chat',
    estado: 'OK',
    detalle: herramientas.length > 0
      ? `Detectado: ${herramientas.join(', ')}`
      : 'Sin herramienta de chat instalada (informativo)',
    items: herramientas.length > 0 ? herramientas : undefined
  });

  return { nombre: 'Chat y Atencion', estado: calcularEstado(checks), checks };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkChat };
