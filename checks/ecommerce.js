/**
 * SECCION 8 — ECOMMERCE (solo si aplica)
 * Carrito, precio visible, galeria de producto,
 * pasos del checkout, cupones
 */

async function checkEcommerce({ page }) {
  const checks = [];

  // Detectar si es ecommerce
  const esEcommerce = await page.evaluate(() => {
    const indicadores = [
      !!document.querySelector('[class*="cart"], [class*="carrito"], [id*="cart"], [id*="carrito"]'),
      !!document.querySelector('[class*="checkout"], [id*="checkout"]'),
      !!document.querySelector('[class*="product"], [class*="producto"]'),
      !!document.querySelector('[class*="price"], [class*="precio"]'),
      !!document.querySelector('button[name*="cart"], button[name*="carrito"]'),
      !!window.WooCommerce,
      !!window.Shopify,
      !!document.querySelector('form[action*="cart"], form[action*="carrito"]'),
    ];
    return indicadores.filter(Boolean).length >= 2;
  });

  if (!esEcommerce) {
    return {
      nombre: 'Ecommerce',
      estado: 'OK',
      checks: [{
        nombre: 'Deteccion de ecommerce',
        estado: 'OK',
        detalle: 'No se detecto funcionalidad de ecommerce en esta pagina — seccion no aplica'
      }]
    };
  }

  // 1. Boton agregar al carrito
  const carritoInfo = await page.evaluate(() => {
    const selectores = [
      '[class*="add-to-cart"]', '[class*="agregar"]', 'button[name="add"]',
      '[data-action*="cart"]', 'form[action*="cart"] button',
      '.single_add_to_cart_button', '.add_to_cart_button'
    ];
    for (const sel of selectores) {
      const btn = document.querySelector(sel);
      if (btn) return { encontrado: true, texto: btn.textContent.trim().slice(0, 50), habilitado: !btn.disabled };
    }
    return { encontrado: false };
  });

  if (carritoInfo.encontrado) {
    checks.push({
      nombre: 'Boton agregar al carrito',
      estado: carritoInfo.habilitado ? 'OK' : 'ERROR',
      detalle: carritoInfo.habilitado
        ? `Boton "${carritoInfo.texto}" disponible y habilitado`
        : `Boton "${carritoInfo.texto}" deshabilitado — el usuario no puede comprar`
    });
  }

  // 2. Precio visible
  const precioInfo = await page.evaluate(() => {
    const selectores = ['.price', '.precio', '[class*="price"]', '[class*="precio"]', '[itemprop="price"]', '.woocommerce-Price-amount'];
    for (const sel of selectores) {
      const el = document.querySelector(sel);
      if (el) return { visible: true, texto: el.textContent.trim().slice(0, 30) };
    }
    // Buscar patrones de precio en el texto
    const texto = document.body.innerText;
    const match = texto.match(/\$[\d,]+\.?\d*/);
    return match ? { visible: true, texto: match[0] } : { visible: false };
  });

  checks.push({
    nombre: 'Precio visible',
    estado: precioInfo.visible ? 'OK' : 'ADVERTENCIA',
    detalle: precioInfo.visible
      ? `Precio visible en la pagina (ej: ${precioInfo.texto})`
      : 'No se detecto precio visible — los clientes necesitan ver el precio para decidir'
  });

  // 3. Galeria de producto (imagenes multiples)
  const galeriaInfo = await page.evaluate(() => {
    const selectores = [
      '.woocommerce-product-gallery', '[class*="product-gallery"]', '[class*="gallery"]',
      '.slick-slider', '.swiper-container', '[class*="carousel"]'
    ];
    for (const sel of selectores) {
      const galeria = document.querySelector(sel);
      if (galeria) {
        const imagenes = galeria.querySelectorAll('img');
        return { tiene: true, cantidad: imagenes.length };
      }
    }
    return { tiene: false };
  });

  if (galeriaInfo.tiene) {
    checks.push({
      nombre: 'Galeria de producto',
      estado: 'OK',
      detalle: `Galeria de producto detectada con ${galeriaInfo.cantidad} imagen(es)`
    });
  }

  // 4. Terminos y condiciones de compra
  const tieneTerminos = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const palabras = ['terminos', 'condiciones', 'terms', 'conditions', 'politica de compra', 'politica de devolucion', 'reembolso', 'refund'];
    return links.some(a => palabras.some(p => a.textContent.toLowerCase().includes(p) || a.href.toLowerCase().includes(p)));
  });

  checks.push({
    nombre: 'Terminos y condiciones de compra',
    estado: tieneTerminos ? 'OK' : 'ADVERTENCIA',
    detalle: tieneTerminos
      ? 'Se encontro enlace a terminos y condiciones de compra'
      : 'No se detectaron terminos y condiciones de compra — obligatorio para tiendas online'
  });

  // 5. Cupones o descuentos visibles
  const tieneCupones = await page.evaluate(() => {
    const texto = document.body.innerText.toLowerCase();
    const palabras = ['cupon', 'coupon', 'descuento', 'discount', 'oferta', 'promo', 'codigo promocional'];
    return palabras.some(p => texto.includes(p));
  });

  checks.push({
    nombre: 'Cupones o descuentos',
    estado: 'OK',
    detalle: tieneCupones
      ? 'Se detectan elementos de cupones o descuentos en la pagina'
      : 'No se detectaron cupones ni descuentos visibles'
  });

  const estadoGeneral = calcularEstado(checks);

  return {
    nombre: 'Ecommerce',
    estado: estadoGeneral,
    checks
  };
}

function calcularEstado(checks) {
  if (checks.some(c => c.estado === 'ERROR')) return 'ERROR';
  if (checks.some(c => c.estado === 'ADVERTENCIA')) return 'ADVERTENCIA';
  return 'OK';
}

module.exports = { checkEcommerce };
