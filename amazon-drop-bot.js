const puppeteer = require('puppeteer');
const os = require('os');
const path = require('path');

/* const PRODUCT_URL = 'https://www.amazon.it/gp/product/B0C8NR3FPG/ref=ox_sc_saved_image_1?smid=A11IL2PNWYJU7H&psc=1'; */
const PRODUCT_URL = 'https://www.amazon.it/dp/B0C8NR3FPG'
const MAX_PRICE = 37.00;

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

  const page = await browser.newPage();
  let attempts = 0;

  while (true) {
    try {
      await page.goto(PRODUCT_URL, { waitUntil: 'load', timeout: 30000 });

      const priceText = await page.$eval('#corePrice_feature_div span.a-offscreen', el =>
        el.textContent.replace(',', '.').replace(/[^\d.]/g, '')
      );

      const price = parseFloat(priceText);
      console.log(`💰 Prezzo attuale: €${price}`);

      if (price <= MAX_PRICE) {
        console.log('🎯 Prezzo accettabile, inizio processo d’acquisto');

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'load' }),
          page.click('#buy-now-button')
        ]);

        const secondBuyNow = await page.$('input[type="submit"][value="Acquista ora"]');
        if (secondBuyNow) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            secondBuyNow.click()
          ]);
        }

        const proceedBtn = await page.$('input[name="proceedToRetailCheckout"]');
        if (proceedBtn) {
          await proceedBtn.click();
          console.log('✅ Procedura di checkout avviata! Completa manualmente.');
          break;
        }

        const errorFound = await page.evaluate(() => {
          const text = document.body.innerText.toLowerCase();
          return text.includes('ops! ci dispiace') || text.includes('errore');
        });

        if (errorFound) {
          console.log('🚨 Errore Amazon. Riprovo subito...');
        } else {
          console.log('🌀 Nessun errore ma checkout non trovato. Riprovo subito...');
        }

      } else {
        console.log(`❌ Prezzo troppo alto (€${price}). Riprovo tra 15s...`);
        await new Promise(r => setTimeout(r, 15000));
      }

    } catch (err) {
      console.error('❌ Errore:', err.message);
      await new Promise(r => setTimeout(r, 8000));
    }

    if (++attempts % 10 === 0) console.log(`🔁 Tentativi: ${attempts}`);
  }
})();
