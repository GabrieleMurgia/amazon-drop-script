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
    asin: 'B0C8NSGN2H',
    url: 'https://www.amazon.it/dp/B0C8NSGN2H',
    maxPrice: 60.00
  },
  {
    asin: 'B0BSR7T3G7',
    url: 'https://www.amazon.it/dp/B0BSR7T3G7',
    maxPrice: 60.00
  },
  {
    asin: 'B0DFD2XFHL',
    url: 'https://www.amazon.it/dp/B0DFD2XFHL',
    maxPrice: 60.00
  },
  {
    asin: 'B0DX2K9KKZ',
    url: 'https://www.amazon.it/dp/B0DX2K9KKZ',
    maxPrice: 120.00
  },
  {
    asin: 'B0DTQCBW9B',
    url: 'https://www.amazon.it/dp/B0DTQCBW9B',
    maxPrice: 39.99
  },
  {
    asin: 'B0DK93ZQPC',
    url: 'https://www.amazon.it/dp/B0DK93ZQPC',
    maxPrice: 60.00
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
  
    async function checkProductPrice(page, product, index) {
      try {
        await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  
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
            console.log(`🚨 [${product.asin}] Errore Amazon. Riprovo subito...`);
          } else {
            console.log(`🌀 [${product.asin}] Nessun errore ma checkout non trovato. Riprovo subito...`);
          }
  
          const orderConfirmed = await page.evaluate(() => {
            return document.body.innerText.includes('Ordine effettuato');
          });
  
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
  
    let cycles = 0;
    while (true) {
      await Promise.all(
        pages.map((page, i) => checkProductPrice(page, PRODUCTS[i], i))
      );
  
      cycles++;
      if (cycles % 5 === 0) console.log(`🔁 Cicli completati: ${cycles}`);
      await new Promise(r => setTimeout(r, 1500));
    }
  })();
  