const puppeteer = require('puppeteer');

const PRODUCT_URL = /* 'https://www.amazon.it/dp/B0C8NR3FPG'; */ 'https://www.amazon.it/dp/B07FSR1VB3';
const MAX_PRICE = 37.00;

(async () => {
/*     const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        userDataDir: '/Users/gabrielemurgia/amazon-profile'
      }); */

      const os = require('os');
const path = require('path');

const userHome = os.homedir();
const chromePath = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/google-chrome'; // per Linux

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
        console.log('⏳ Prezzo non trovato. Riprovo tra 10s...');
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const price = parseFloat(priceText);
      console.log(`💰 Prezzo attuale: €${price}`);

      if (price <= MAX_PRICE) {
        console.log('🎯 Prezzo OK! Provo ad acquistare...');

/*         const addToCartButton = await page.$('#add-to-cart-button');
        if (!addToCartButton) throw new Error('Pulsante "Aggiungi al carrello" non trovato');
        await addToCartButton.click();
        await new Promise(r => setTimeout(r, 3000)); */

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

        const content = await page.content();
        if (content.includes('Ops! Ci dispiace') || content.includes('errore')) {
          console.log('⚠️ Errore nella pagina, ricarico...');
          await new Promise(r => setTimeout(r, 3000));
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
