const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const os = require('os');
const path = require('path');

puppeteer.use(StealthPlugin());

// --- Config ------------------------------------------------------------------
const PRODUCTS = [
  { asin: 'B0C8NR3FPG', url: 'https://www.amazon.it/dp/B0C8NR3FPG', maxPrice: 37.00 },
  { asin: 'B0C8NSGN2H', url: 'https://www.amazon.it/dp/B0C8NSGN2H', maxPrice: 60.00 },
  { asin: 'B0BSR7T3G7', url: 'https://www.amazon.it/dp/B0BSR7T3G7', maxPrice: 60.00 },
  { asin: 'B0DFD2XFHL', url: 'https://www.amazon.it/dp/B0DFD2XFHL', maxPrice: 60.00 },
  { asin: 'B0DX2K9KKZ', url: 'https://www.amazon.it/dp/B0DX2K9KKZ', maxPrice: 120.00 },
  { asin: 'B0DTQCBW9B', url: 'https://www.amazon.it/dp/B0DTQCBW9B', maxPrice: 39.99 },
  { asin: 'B0DK93ZQPC', url: 'https://www.amazon.it/dp/B0DK93ZQPC', maxPrice: 60.00 }
];

const delay = ms => new Promise(r => setTimeout(r, ms));

function getChromePath() {
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'win32') return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  return '/usr/bin/google-chrome';
}

async function checkProductPrice(page, product) {
  try {
    await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000 + Math.random() * 2000); // 3–5s

    const priceText = await page.$eval('#corePrice_feature_div span.a-offscreen', el =>
      el.textContent.replace(',', '.').replace(/[^0-9.]/g, '')
    );
    const price = parseFloat(priceText);
    console.log(`💰 [${product.asin}] Prezzo: €${price}`);

    if (price <= product.maxPrice) {
      console.log(`🎯 [${product.asin}] Prezzo OK (€${price}). Avvio acquisto...`);

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
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
          proceedBtn.click()
        ]);
      }

      const finalBuyNowBtn = await page.$('input[name="placeYourOrder1"]');
      if (finalBuyNowBtn) {
        await finalBuyNowBtn.click();
        console.log(`🛒 Ordine completato per ${product.asin}!`);
      } else {
        console.log(`🕒 [${product.asin}] In attesa clic finale manuale su 'Acquista ora'`);
      }

      const errorFound = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('ops! ci dispiace') || text.includes('errore');
      });
      if (errorFound) {
        console.log(`🚨 [${product.asin}] Errore Amazon rilevato. Riproverò al prossimo ciclo.`);
      }

      const orderConfirmed = await page.evaluate(() =>
        document.body.innerText.includes('Ordine effettuato')
      );
      if (orderConfirmed) {
        console.log(`✅ Ordine confermato per ${product.asin}. Riprendo il monitoraggio.`);
        await page.goto('about:blank');
      } else {
        console.log(`❗ [${product.asin}] Nessuna conferma ordine rilevata.`);
      }
    } else {
      console.log(`❌ [${product.asin}] Prezzo troppo alto. (€${price})`);
    }
  } catch (err) {
    console.error(`❌ [${product.asin}] Errore: ${err.message}`);
  }
}

async function monitorProduct(page, product) {
  let cycles = 0;
  while (true) {
    const start = Date.now();
    await checkProductPrice(page, product);
    cycles++;
    if (cycles % 5 === 0) console.log(`🔁 [${product.asin}] Cicli completati: ${cycles}`);
    const elapsed = Date.now() - start;
    const randomDelay = 1500 + Math.floor(Math.random() * 2000); // 1.5s - 3.5s
    await delay(Math.max(randomDelay - elapsed, 0));
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: getChromePath(),
    userDataDir: path.join(os.homedir(), 'amazon-profile'),
    defaultViewport: null,
    args: ['--start-maximized']
  });

  for (const product of PRODUCTS) {
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (['image', 'font', 'media', /* 'stylesheet', */ 'xhr'].includes(type) || req.url().includes('tracking')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    monitorProduct(page, product);
  }
})();
