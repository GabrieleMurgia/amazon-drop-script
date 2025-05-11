import dotenv from 'dotenv';
dotenv.config();

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

import os from 'os';
import path from 'path';
import { URL } from 'url';
import { ProxyAgent, fetch } from 'undici';

/* ───── proxy config ───── */
const proxyUrl      = process.env.PROXY_URL
const IPR_API_TOKEN = process.env.IPR_API_TOKEN
const proxyParsed   = new URL(proxyUrl);
/* ──────────────────────── */

function chromePath () {
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'win32')  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  return '/usr/bin/google-chrome';
}

/*■■ globali ■■*/
const purchaseQueue      = new Map();          // asin ⇒ {deadline, page}
let   defaultBrowser     = null;               // senza proxy
let   proxyBrowser       = null;               // con proxy

/*──────── helper: browser singleton ────────*/
async function getBrowser() {
  if (defaultBrowser) return defaultBrowser;

  defaultBrowser = await puppeteer.launch({
    headless       : false,
    executablePath : chromePath(),
    userDataDir    : path.join(os.homedir(), 'amazon-profile'), // singolo profilo sempre
    defaultViewport: null,
    args           : ['--start-maximized']
  });

  return defaultBrowser;
}

/*──────── helper login ────────*/
async function loginIfNeeded(page) {
  try {
    // Verifica se il link "Accedi" è presente
    await page.waitForSelector('span#nav-link-accountList-nav-line-1', { timeout: 10000 });
    const signIn = await page.$('span#nav-link-accountList-nav-line-1');
    if (!signIn) return;

    console.log('🔐 Login Amazon…');
    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      signIn.click()
    ]);

    // Inserisce email ma NON clicca "Continua"
    await page.waitForSelector('#ap_email', { timeout: 10000 });
    await page.type('#ap_email', process.env.AMAZON_EMAIL, { delay: 20 });

    console.log('🕒 Attendi... clicca manualmente su "Continua"');

    // Attende che venga caricata la password
    await page.waitForSelector('#ap_password', { timeout: 120000 });
    console.log('✏️ Inserisco la password...');

    await page.type('#ap_password', process.env.AMAZON_PASSWORD, { delay: 20 });

    // Clicca su "Accedi"
    await page.waitForSelector('#signInSubmit', { visible: true, timeout: 10000 });
    await page.click('#signInSubmit');

    // Verifica se compare la schermata 2FA
    const result = await Promise.race([
      page.waitForSelector('#auth-mfa-otpcode', { timeout: 20000 }).then(() => '2fa'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).then(() => 'logged')
    ]);

    if (result === '2fa') {
      console.log('📩 Inserisci manualmente il codice 2FA (hai 3 minuti)...');
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 180000 });
    }

    console.log('✅ Login completato');
  } catch (err) {
    console.error(`❌ loginIfNeeded error: ${err.message}`);
  }
}

/*──────── click-flow super-snello ────────*/
async function attemptPurchase(page, asin) {
  try {
    // Verifica se bisogna fare login
    const pText = await page.evaluate(() => document.body.innerText.toLowerCase());
    if (pText.includes('accedi')) {
      await loginIfNeeded(page);
    }

    // Vai al prodotto
    await page.goto(`https://www.amazon.it/dp/${asin}`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    // Pulsante "Compra ora"
    const btn = await page.$('#buy-now-button');
    if (!btn) return false;

    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
      btn.click()
    ]);

    // Step successivi fino all'ordine
    const steps = [
      'input[type="submit"][value="Acquista ora"]',
      'input[name="proceedToRetailCheckout"]',
      'input[name="placeYourOrder1"]'
    ];

    for (const sel of steps) {
      const b = await page.$(sel);
      if (!b) continue;
      await Promise.allSettled([
        page.waitForNavigation({
          waitUntil: sel.endsWith('placeYourOrder1') ? 'networkidle0' : 'domcontentloaded',
          timeout: 15000
        }),
        b.click()
      ]);
    }

    // Verifica conferma ordine
    const ok = await page.evaluate(() => {
      const t = document.body.innerText.toLowerCase();
      return t.includes('ordine effettuato') ||
             t.includes('grazie per il tuo ordine') ||
             t.includes('thanks for your order');
    });

    return ok;
  } catch (err) {
    console.error(`❌ attemptPurchase error: ${err.message}`);
    return false;
  }
}


/*──────── funzione principale ────────*/
async function tryPurchase(asin) {
  // 1️⃣  se già in coda ⇒ reset timer
  const existing = purchaseQueue.get(asin);
  if (existing) {
    existing.deadline = Date.now() + 10 * 60e3;
    console.log(`🔄 [${asin}] Timer reset (+10 min)`);
    return;
  }

  // 2️⃣  decide se usare proxy
  const newSize  = purchaseQueue.size + 1;
  const useProxy = newSize >= 3;

  // 3️⃣  apri nuova pagina (unico browser, stesso profilo)
  const browser = await getBrowser();
  const page    = await browser.newPage();

  // 4️⃣  abilita proxy sulla pagina se richiesto
  if (useProxy) {
    await page.authenticate({
      username: proxyParsed.username,
      password: proxyParsed.password
    });

    // Log traffico residuo (non blocca se fallisce)
    fetch(`https://dashboard.iproyal.com/api/proxies/traffic?token=${IPR_API_TOKEN}`, {
      dispatcher: new ProxyAgent(proxyUrl)
    })
    .then(r => r.json())
    .then(j => console.log('📊 Proxy MB rimasti:', j?.remaining))
    .catch(() => {});
  }

  // 5️⃣  blocca media/css/xhr/tracking
  await page.setRequestInterception(true);
  page.on('request', r => {
    const t = r.resourceType();
    if (['image', 'media', 'font', 'stylesheet', 'xhr'].includes(t) || r.url().includes('tracking')) {
      r.abort();
    } else {
      r.continue();
    }
  });

  // 6️⃣  User-Agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );

  // 7️⃣  salva in coda
  purchaseQueue.set(asin, { deadline: Date.now() + 10 * 60e3, page });

  // 8️⃣  loop ricorsivo
  (async function loop() {
    const item = purchaseQueue.get(asin);
    if (!item) return;
    const success = await attemptPurchase(page, asin);

    if (success || Date.now() >= item.deadline) {
      await page.close();
      purchaseQueue.delete(asin);
      console.log(`🧹 [${asin}] ${success ? 'SUCCESSO' : 'timeout'} (coda:${purchaseQueue.size})`);
      return;
    }
    setTimeout(loop, 2500 + Math.random() * 2000);
  })();
}


export { tryPurchase };