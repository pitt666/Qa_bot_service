/**
 * SECCION 11 — TECNOLOGIA DETECTADA
 * Toda esta seccion es INFORMATIVA — no afecta el score general
 */
async function checkTecnologia({ page }) {
  const checks = [];

  const techData = await page.evaluate(() => {
    const d = {};
    const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src.toLowerCase());
    const clases = document.body.className.toLowerCase() + ' ' + document.documentElement.className.toLowerCase();
    const gen = document.querySelector('meta[name="generator"]')?.getAttribute('content') || '';
    const html = document.documentElement.outerHTML.toLowerCase();
    const ck = document.cookie.toLowerCase();

    // CMS
    if (window.wp || html.includes('wp-content') || html.includes('wp-includes') || gen.toLowerCase().includes('wordpress')) d.cms = 'WordPress';
    else if (html.includes('shopify') || window.Shopify) d.cms = 'Shopify';
    else if (html.includes('squarespace') || html.includes('sqsp')) d.cms = 'Squarespace';
    else if (window.wixBiSession || html.includes('wix.com') || html.includes('_wix_')) d.cms = 'Wix';
    else if (html.includes('webflow') || html.includes('data-wf-page')) d.cms = 'Webflow';
    else if (html.includes('framer') || window.__framer_importFromPackage) d.cms = 'Framer';
    else if (scripts.some(s => s.includes('js.hubspot.com/cms')) || (window.hbspt && html.includes('hs-sites.com'))) d.cms = 'HubSpot CMS';
    else if (gen.toLowerCase().includes('joomla') || html.includes('/media/jui/')) d.cms = 'Joomla';
    else if (gen.toLowerCase().includes('drupal') || html.includes('/sites/default/files/')) d.cms = 'Drupal';
    else if (html.includes('ghost.io') || window.ghost) d.cms = 'Ghost';

    // PAGE BUILDER
    if (d.cms === 'WordPress') {
      if (html.includes('elementor') || clases.includes('elementor'))       d.pageBuilder = 'Elementor';
      else if (html.includes('divi') || html.includes('et_pb'))             d.pageBuilder = 'Divi';
      else if (html.includes('wpbakery') || html.includes('vc_row'))        d.pageBuilder = 'WPBakery';
      else if (html.includes('beaver') || html.includes('fl-builder'))      d.pageBuilder = 'Beaver Builder';
      else if (html.includes('bricks') || html.includes('brxe-'))           d.pageBuilder = 'Bricks Builder';
      else if (html.includes('oxygen') || html.includes('ct-section'))      d.pageBuilder = 'Oxygen';
      else if (html.includes('gutenberg') || html.includes('wp-block-'))    d.pageBuilder = 'Gutenberg';
    }

    // FRAMEWORK JS
    if (window.__NEXT_DATA__ || html.includes('_next/static'))                       d.frameworkJs = 'Next.js';
    else if (window.__NUXT__ || html.includes('nuxt'))                               d.frameworkJs = 'Nuxt.js';
    else if (window.__vue_meta_installed || html.includes('data-v-') || window.Vue)  d.frameworkJs = 'Vue.js';
    else if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || html.includes('__reactfiber')) d.frameworkJs = 'React';
    else if (window.angular || html.includes('ng-version'))                          d.frameworkJs = 'Angular';
    else if (window.svelte || html.includes('svelte'))                               d.frameworkJs = 'Svelte';
    else if (window.Astro)                                                            d.frameworkJs = 'Astro';
    else if (window.Remix)                                                            d.frameworkJs = 'Remix';

    // FRAMEWORK PHP
    if (!d.cms) {
      if (ck.includes('xsrf-token') || ck.includes('laravel_session') || document.querySelector('meta[name="csrf-token"]'))
        d.frameworkPhp = 'Laravel';
      else if (ck.includes('ci_session') || ck.includes('ci_csrf_token'))
        d.frameworkPhp = 'CodeIgniter';
      else if (ck.includes('symfony') || html.includes('sf_redirect'))
        d.frameworkPhp = 'Symfony';
      else if (ck.includes('cakephp') || html.includes('cakephp'))
        d.frameworkPhp = 'CakePHP';
    }

    // HOSTING / DEPLOY
    if (scripts.some(s => s.includes('vercel-analytics') || s.includes('vercel.live')) || html.includes('_vercel'))
      d.hosting = 'Vercel';
    else if (html.includes('netlify') || window.netlifyIdentity || scripts.some(s => s.includes('netlify')))
      d.hosting = 'Netlify';
    else if (html.includes('pages.dev') || html.includes('cloudflare-pages'))
      d.hosting = 'Cloudflare Pages';

    // ECOMMERCE
    if (window.WooCommerce || (html.includes('woocommerce') && d.cms === 'WordPress')) d.ecommerce = 'WooCommerce';
    else if (window.Shopify) d.ecommerce = 'Shopify';
    else if (html.includes('tiendanube') || html.includes('nuvemshop')) d.ecommerce = 'Tienda Nube';
    else if (html.includes('magento') || window.Magento) d.ecommerce = 'Magento';
    else if (html.includes('prestashop') || window.prestashop) d.ecommerce = 'PrestaShop';

    // CRM / MARKETING
    const crms = [];
    if (window.hbspt || scripts.some(s => s.includes('js.hubspot.com')))             crms.push('HubSpot');
    if (scripts.some(s => s.includes('activecampaign.com')))                         crms.push('ActiveCampaign');
    if (window._learnq || scripts.some(s => s.includes('klaviyo.com')))              crms.push('Klaviyo');
    if (scripts.some(s => s.includes('mailchimp.com')))                              crms.push('Mailchimp');
    if (scripts.some(s => s.includes('salesforce.com') || s.includes('pardot.com'))) crms.push('Salesforce/Pardot');
    if (crms.length) d.crm = crms.join(', ');

    // TEMA WORDPRESS
    if (d.cms === 'WordPress') {
      if (html.includes('ast-container') || html.includes('/astra'))  d.tema = 'Astra';
      else if (html.includes('generatepress'))                         d.tema = 'GeneratePress';
      else if (html.includes('hello-elementor'))                       d.tema = 'Hello Elementor';
      else if (html.includes('storefront'))                            d.tema = 'Storefront';
      else if (html.includes('flatsome'))                              d.tema = 'Flatsome';
      else if (html.includes('avada'))                                 d.tema = 'Avada';
      else if (html.includes('oceanwp'))                               d.tema = 'OceanWP';
    }

    if (gen) d.metaGenerator = gen;
    return d;
  });

  const items = [
    techData.cms          && `CMS: ${techData.cms}`,
    techData.pageBuilder  && `Constructor: ${techData.pageBuilder}`,
    techData.frameworkJs  && `Framework JS: ${techData.frameworkJs}`,
    techData.frameworkPhp && `Framework PHP: ${techData.frameworkPhp}`,
    techData.ecommerce    && `Ecommerce: ${techData.ecommerce}`,
    techData.hosting      && `Hosting/Deploy: ${techData.hosting}`,
    techData.crm          && `CRM/Marketing: ${techData.crm}`,
    techData.tema         && `Tema: ${techData.tema}`,
    techData.metaGenerator && `Generator: ${techData.metaGenerator}`,
  ].filter(Boolean);

  // Todo INFORMATIVO — tecnologia es solo datos, no problemas
  checks.push({
    nombre: 'Tecnologia detectada',
    estado: 'INFORMATIVO',
    detalle: items.length ? `${items.length} tecnologia(s) identificada(s)` : 'No se pudo identificar la tecnologia — puede ser codigo custom u ofuscado',
    items
  });

  if (techData.cms === 'WordPress')
    checks.push({ nombre: 'WordPress — consideraciones', estado: 'INFORMATIVO', detalle: 'Verificar que plugins, temas y core esten actualizados (recomendacion)' });

  if (techData.cms === 'Wix' || techData.cms === 'Squarespace')
    checks.push({ nombre: `${techData.cms} — limitaciones`, estado: 'INFORMATIVO', detalle: `${techData.cms}: plataforma cerrada con limitaciones SEO y personalizacion (informativo)` });

  return { nombre: 'Tecnologia', estado: 'OK', checks };
}

module.exports = { checkTecnologia };
