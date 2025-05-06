const puppeteer = require('puppeteer');
const os = require('os');
const path = require('path');

/* const PRODUCT_URL = 'https://www.amazon.it/dp/B07FSR1VB3';  */
const PRODUCT_URL = 'https://www.amazon.it/dp/B0C8NR3FPG';
const MAX_PRICE = 37.00;

(async () => {
  const userHome = os.homedir();
  const chromePath = process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome'; // Linux fallback

  const profilePath = path.join(userHome, 'amazon-profile');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    executablePath: chromePath,
    userDataDir: profilePath
  });

  const page = await browser.newPage();

  let success = false;

  while (!success) {
    try {
      await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

      const priceText = await page.evaluate(() => {
        const priceEl = document.querySelector('#corePrice_feature_div span.a-offscreen');
        return priceEl ? priceEl.textContent.replace(',', '.').replace(/[^\d.]/g, '') : null;
      });

      if (!priceText) {
        console.log('⏳ Prezzo non trovato. Riprovo tra 2s...');
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const price = parseFloat(priceText);
      console.log(`💰 Prezzo attuale: €${price}`);

      if (price <= MAX_PRICE) {
        console.log('🎯 Prezzo OK! Provo ad acquistare...');

        const buyNowButton = await page.$('#buy-now-button');
        if (!buyNowButton) throw new Error('Pulsante "Acquista ora" non trovato');
        await buyNowButton.click();
        await new Promise(r => setTimeout(r, 5000));

        // Secondo "Acquista ora"
        const secondBuyNow = await page.$('input[type="submit"][value="Acquista ora"]');
        if (secondBuyNow) {
          console.log('🔁 Secondo "Acquista ora" rilevato, clicco...');
          await secondBuyNow.click();
          await new Promise(r => setTimeout(r, 5000));
        } else {
          console.log('⚠️ Nessun secondo "Acquista ora" trovato. Forse ordine già confermato.');
        }

        // Controllo pagina di errore (post acquisto)
        const errorDetected = await page.evaluate(() => {
          return document.body.innerText.includes('Ops! Ci dispiace') ||
                 document.body.innerText.toLowerCase().includes('si è verificato un errore');
        });

        if (errorDetected) {
          console.log('🚨 Errore "Ops! Ci dispiace" rilevato! Ricarico la pagina e riprovo...');
          await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
          continue;
        }

        const proceedBtn = await page.$('input[name="proceedToRetailCheckout"]');
        if (proceedBtn) {
          await proceedBtn.click();
          console.log('🛒 Procedura avviata! Completa l’ordine manualmente.');
          success = true;
        } else {
          console.log('😢 Checkout non trovato. Riprovo...');
        }
      } else {
        console.log('⏳ Prezzo troppo alto, aspetto 30s...');
        await new Promise(r => setTimeout(r, 30000));
      }
    } catch (err) {
      console.error('❌ Errore:', err.message);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
})();
