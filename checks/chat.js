/**
 * SECCION 6 — CHAT Y ATENCION
 * Detecta herramientas de chat instaladas
 */

async function checkChat({ page }) {
  const checks = [];

  const herramientas = await page.evaluate(() => {
    const detectores = [
      { nombre: 'Intercom', señal: () => !!window.Intercom || !!document.querySelector('#intercom-container, .intercom-launcher') },
      { nombre: 'Drift', señal: () => !!window.drift || !!document.querySelector('#drift-widget') },
      { nombre: 'Zendesk Chat', señal: () => !!window.zE || !!document.querySelector('[data-product="web_widget"]') },
      { nombre: 'HubSpot Chat', señal: () => !!window.HubSpotConversations || !!document.querySelector('#hubspot-messages-iframe-container') },
      { nombre: 'LiveChat', señal: () => !!window.LiveChatWidget || !!document.querySelector('#chat-widget-container') },
      { nombre: 'Tidio', señal: () => !!window.tidioChatApi || !!document.querySelector('#tidio-chat, #tidio-chat-iframe') },
      { nombre: 'ManyChat', señal: () => !!document.querySelector('[class*="manychat"], script[src*="manychat"]') },
      { nombre: 'Crisp', señal: () => !!window.$crisp || !!document.querySelector('.crisp-client') },
      { nombre: 'Tawk.to', señal: () => !!window.Tawk_API || !!document.querySelector('#tawkchat-container') },
      { nombre: 'Chatbase', señal: () => !!document.querySelector('script[src*="chatbase"]') },
    ];
    return detectores.filter(d => { try { return d.señal(); } catch { return false; } }).map(d => d.nombre);
  });

  checks.push({
    nombre: 'Herramientas de chat',
    estado: herramientas.length > 0 ? 'OK' : 'ADVERTENCIA',
    detalle: herramientas.length > 0
      ? `Detectado: ${herramientas.join(', ')}`
      : 'No se detecto ninguna herramienta de chat o atencion al cliente',
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
