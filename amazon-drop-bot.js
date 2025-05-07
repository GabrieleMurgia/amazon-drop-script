const puppeteer = require('puppeteer');
const os = require('os');
const path = require('path');

const ASIN = 'B0C8NR3FPG';
const MAX_PRICE = 37.00;
const PRODUCT_URL = `https://www.amazon.it/dp/${ASIN}`;
const ADD_TO_CART_URL = `https://www.amazon.it/gp/aws/cart/add.html?ASIN.1=${ASIN}&Quantity.1=1`;

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: path.join(os.homedir(), 'amazon-profile'),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  let attempts = 0;

  while (true) {
    try {
      await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const available = await page.$('#add-to-cart-button');
      if (!available) {
        console.log('❌ Prodotto non disponibile. Riprovo tra 10s...');
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      const priceText = await page.$eval('#corePrice_feature_div span.a-offscreen', el =>
        el.textContent.replace(',', '.').replace(/[^\d.]/g, '')
      );
      const price = parseFloat(priceText);
      console.log(`💰 Prezzo attuale: €${price}`);

      if (price > MAX_PRICE) {
        console.log(`❌ Prezzo troppo alto (€${price}). Riprovo tra 15s...`);
        await new Promise(r => setTimeout(r, 15000));
        continue;
      }

      console.log('🛒 Prezzo OK! Vado direttamente al link per aggiungere al carrello...');
      await page.goto(ADD_TO_CART_URL, { waitUntil: 'networkidle2' });

      // Vai al carrello per controllare
      await page.goto('https://www.amazon.it/gp/cart/view.html', { waitUntil: 'networkidle2' });

      // Tenta acquisto
      const proceedBtn = await page.$('input[name="proceedToRetailCheckout"]');
      if (proceedBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          proceedBtn.click()
        ]);
        console.log('✅ Procedura di acquisto avviata! Completa manualmente se necessario.');
      } else {
        console.log('🌀 Prodotto aggiunto. Procedura di acquisto non trovata.');
      }

      break;

    } catch (err) {
      console.error('❌ Errore:', err.message);
      await new Promise(r => setTimeout(r, 5000));
    }

    if (++attempts % 10 === 0) console.log(`🔁 Tentativi: ${attempts}`);
  }

  await browser.close();
})();
