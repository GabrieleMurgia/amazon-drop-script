const puppeteer = require('puppeteer');
const os = require('os');
const path = require('path');

const PRODUCTS = [
  {
    asin: 'B0C8NR3FPG',
    url: 'https://www.amazon.it/dp/B0C8NR3FPG',
    maxPrice: 37.00
  },
  {
    asin: 'INSERISCI_ALTRA_ASIN',
    url: 'https://www.amazon.it/dp/B0C8NR3FPG',
    maxPrice: 45.50
  }
];

(async () => {
  const chromePath = process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/google-chrome';

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    userDataDir: path.join(os.homedir(), 'amazon-profile'),
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const pages = await Promise.all(PRODUCTS.map(() => browser.newPage()));

  // Blocca solo immagini e font, ma lascia i CSS per mantenere lo stile
  for (const page of pages) {
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (['image', 'font'].includes(type)) req.abort();
      else req.continue();
    });
  }

  async function checkProductPrice(page, product) {
    try {
      await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const priceText = await page.$eval('#corePrice_feature_div span.a-offscreen', el =>
        el.textContent.replace(',', '.').replace(/[^0-9.]/g, '')
      );

      const price = parseFloat(priceText);
      console.log(`💰 [${product.asin}] Prezzo: €${price}`);

      if (price <= product.maxPrice) {
        console.log(`🎯 [${product.asin}] Prezzo OK (€${price}). Acquisto in corso...`);

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
          page.click('#buy-now-button')
        ]);

        const confirmBtn = await page.$('input[type="submit"][value="Acquista ora"]');
        if (confirmBtn) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            confirmBtn.click()
          ]);
        }

        const proceedBtn = await page.$('input[name="proceedToRetailCheckout"]');
        if (proceedBtn) {
          await proceedBtn.click();
          console.log(`✅ Checkout avviato per ${product.asin}. Completa manualmente.`);
          await browser.close();
          process.exit(0);
        }

        const error = await page.evaluate(() => document.body.innerText.toLowerCase().includes('errore'));
        console.log(error ? `🚨 [${product.asin}] Errore nel checkout` : `🌀 [${product.asin}] Checkout non trovato`);
      } else {
        console.log(`❌ [${product.asin}] Prezzo troppo alto. (€${price})`);
      }
    } catch (err) {
      console.error(`❌ [${product.asin}] Errore: ${err.message}`);
    }
  }

  let cycles = 0;
  while (true) {
    await Promise.all(
      pages.map((page, i) => checkProductPrice(page, PRODUCTS[i]))
    );

    cycles++;
    if (cycles % 5 === 0) console.log(`🔁 Cicli completati: ${cycles}`);
    await new Promise(r => setTimeout(r, 1500));
  }
})();
