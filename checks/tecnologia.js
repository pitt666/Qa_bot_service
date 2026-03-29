/**
 * SECCION 11 — TECNOLOGIA DETECTADA
 * CMS, framework, constructor de paginas, hosting signals, ecommerce
 */

async function checkTecnologia({ page }) {
  const checks = [];

  const techData = await page.evaluate(() => {
    const detectado = {};
    const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src.toLowerCase());
    const clases = document.body.className.toLowerCase() + ' ' + document.documentElement.className.toLowerCase();
    const metaGenerator = document.querySelector('meta[name="generator"]')?.getAttribute('content') || '';
    const htmlTexto = document.documentElement.outerHTML.toLowerCase();

    // ─── CMS ───
    if (window.wp || htmlTexto.includes('wp-content') || htmlTexto.includes('wp-includes') || metaGenerator.toLowerCase().includes('wordpress')) {
      detectado.cms = 'WordPress';
    } else if (htmlTexto.includes('shopify') || window.Shopify) {
      detectado.cms = 'Shopify';
    } else if (htmlTexto.includes('squarespace') || window.Static || htmlTexto.includes('sqsp')) {
      detectado.cms = 'Squarespace';
    } else if (window.wixBiSession || htmlTexto.includes('wix.com') || htmlTexto.includes('_wix_')) {
      detectado.cms = 'Wix';
    } else if (htmlTexto.includes('webflow') || htmlTexto.includes('data-wf-page')) {
      detectado.cms = 'Webflow';
    } else if (htmlTexto.includes('framer') || window.__framer_importFromPackage) {
      detectado.cms = 'Framer';
    } else if (metaGenerator.toLowerCase().includes('joomla') || htmlTexto.includes('/media/jui/')) {
      detectado.cms = 'Joomla';
    } else if (metaGenerator.toLowerCase().includes('drupal') || htmlTexto.includes('/sites/default/files/')) {
      detectado.cms = 'Drupal';
    } else if (htmlTexto.includes('ghost.io') || window.ghost) {
      detectado.cms = 'Ghost';
    }

    // ─── CONSTRUCTOR DE PAGINAS (page builders) ───
    if (detectado.cms === 'WordPress') {
      if (htmlTexto.includes('elementor') || clases.includes('elementor')) {
        detectado.pageBuilder = 'Elementor';
      } else if (htmlTexto.includes('divi') || htmlTexto.includes('et_pb')) {
        detectado.pageBuilder = 'Divi';
      } else if (htmlTexto.includes('wpbakery') || htmlTexto.includes('vc_row')) {
        detectado.pageBuilder = 'WPBakery';
      } else if (htmlTexto.includes('beaver') || htmlTexto.includes('fl-builder')) {
        detectado.pageBuilder = 'Beaver Builder';
      } else if (htmlTexto.includes('bricks') || htmlTexto.includes('brxe-')) {
        detectado.pageBuilder = 'Bricks Builder';
      } else if (htmlTexto.includes('oxygen') || htmlTexto.includes('ct-section')) {
        detectado.pageBuilder = 'Oxygen';
      } else if (htmlTexto.includes('gutenberg') || htmlTexto.includes('wp-block-')) {
        detectado.pageBuilder = 'Gutenberg (editor nativo)';
      }
    }

    // ─── FRAMEWORK JS ───
    if (window.__NEXT_DATA__ || htmlTexto.includes('_next/static')) {
      detectado.framework = 'Next.js';
    } else if (window.__NUXT__ || htmlTexto.includes('nuxt')) {
      detectado.framework = 'Nuxt.js';
    } else if (window.__vue_meta_installed || htmlTexto.includes('data-v-') || window.Vue) {
      detectado.framework = 'Vue.js';
    } else if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || htmlTexto.includes('react-root') || htmlTexto.includes('__reactFiber')) {
      detectado.framework = 'React';
    } else if (window.angular || htmlTexto.includes('ng-version')) {
      detectado.framework = 'Angular';
    } else if (window.svelte || htmlTexto.includes('svelte')) {
      detectado.framework = 'Svelte';
    } else if (window.Astro) {
      detectado.framework = 'Astro';
    }

    // ─── ECOMMERCE ───
    if (window.WooCommerce || (htmlTexto.includes('woocommerce') && detectado.cms === 'WordPress')) {
      detectado.ecommerce = 'WooCommerce';
    } else if (window.Shopify) {
      detectado.ecommerce = 'Shopify';
    } else if (htmlTexto.includes('tiendanube') || htmlTexto.includes('nuvemshop')) {
      detectado.ecommerce = 'Tienda Nube';
    } else if (htmlTexto.includes('magento') || window.Magento) {
      detectado.ecommerce = 'Magento';
    } else if (htmlTexto.includes('prestashop') || window.prestashop) {
      detectado.ecommerce = 'PrestaShop';
    }

    // ─── HOSTING SIGNALS ───
    const referenciasHosting = [];
    if (htmlTexto.includes('vercel') || htmlTexto.includes('.vercel.app')) referenciasHosting.push('Vercel');
    if (htmlTexto.includes('netlify') || htmlTexto.includes('.netlify.app')) referenciasHosting.push('Netlify');
    if (htmlTexto.includes('wpengine') || htmlTexto.includes('.wpengine.com')) referenciasHosting.push('WP Engine');
    if (htmlTexto.includes('kinsta') || htmlTexto.includes('.kinsta.cloud')) referenciasHosting.push('Kinsta');
    if (htmlTexto.includes('siteground')) referenciasHosting.push('SiteGround');
    if (htmlTexto.includes('bluehost')) referenciasHosting.push('Bluehost');
    if (htmlTexto.includes('godaddy') || htmlTexto.includes('.godaddysites.com')) referenciasHosting.push('GoDaddy');
    if (htmlTexto.includes('cloudflare')) referenciasHosting.push('Cloudflare (CDN/Proxy)');
    if (htmlTexto.includes('amazonaws') || htmlTexto.includes('cloudfront')) referenciasHosting.push('AWS');
    if (detectado.ecommerce === 'Shopify') referenciasHosting.push('Shopify Hosting');
    detectado.hosting = referenciasHosting;

    // ─── TEMAS POPULARES ───
    if (detectado.cms === 'WordPress') {
      if (htmlTexto.includes('astra') || htmlTexto.includes('ast-container')) detectado.tema = 'Astra';
      else if (htmlTexto.includes('generatepress') || htmlTexto.includes('generate-')) detectado.tema = 'GeneratePress';
      else if (htmlTexto.includes('hello-elementor')) detectado.tema = 'Hello Elementor';
      else if (htmlTexto.includes('storefront')) detectado.tema = 'Storefront (WooCommerce)';
      else if (htmlTexto.includes('flatsome')) detectado.tema = 'Flatsome';
    }

    // ─── META GENERATOR ───
    if (metaGenerator) detectado.metaGenerator = metaGenerator;

    return detectado;
  });

  // Formatear resultado
  const tecnologiasDetectadas = [];

  if (techData.cms) tecnologiasDetectadas.push(`CMS: ${techData.cms}`);
  if (techData.pageBuilder) tecnologiasDetectadas.push(`Constructor: ${techData.pageBuilder}`);
  if (techData.framework) tecnologiasDetectadas.push(`Framework: ${techData.framework}`);
  if (techData.ecommerce) tecnologiasDetectadas.push(`Ecommerce: ${techData.ecommerce}`);
  if (techData.tema) tecnologiasDetectadas.push(`Tema: ${techData.tema}`);
  if (techData.hosting && techData.hosting.length > 0) tecnologiasDetectadas.push(`Hosting/CDN: ${techData.hosting.join(', ')}`);
  if (techData.metaGenerator) tecnologiasDetectadas.push(`Generator: ${techData.metaGenerator}`);

  checks.push({
    nombre: 'Tecnologia detectada',
    estado: 'OK',
    detalle: tecnologiasDetectadas.length > 0
      ? `${tecnologiasDetectadas.length} tecnologia(s) identificada(s)`
      : 'No se pudo identificar la tecnologia — puede ser codigo custom o bien ofuscado',
    items: tecnologiasDetectadas
  });

  // Alertas especificas
  if (techData.cms === 'WordPress') {
    checks.push({
      nombre: 'WordPress — consideraciones',
      estado: 'ADVERTENCIA',
      detalle: 'Sitio WordPress detectado — verificar que plugins, temas y core esten actualizados para evitar vulnerabilidades'
    });
  }

  if (techData.cms === 'Wix' || techData.cms === 'Squarespace') {
    checks.push({
      nombre: `${techData.cms} — limitaciones`,
      estado: 'ADVERTENCIA',
      detalle: `${techData.cms} detectado — plataforma cerrada con limitaciones para SEO tecnico y personalizacion avanzada`
    });
  }

  return {
    nombre: 'Tecnologia',
    estado: 'OK',
    checks
  };
}

module.exports = { checkTecnologia };
