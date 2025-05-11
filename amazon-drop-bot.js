// ────────────────────────────────────────────────
// FILE: amazon-drop-bot.js  (modulo di acquisto)
// ────────────────────────────────────────────────
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
const proxyUrl      = process.env.PROXY_URL;
const IPR_API_TOKEN = process.env.IPR_API_TOKEN;
const proxyParsed   = proxyUrl ? new URL(proxyUrl) : null;
/* ───────────────────────── */

function chromePath () {
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'win32')  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  return '/usr/bin/google-chrome';
}

/*■■ globali ■■*/
const purchaseQueue  = new Map();   // asin ⇒ {deadline, page}
let   defaultBrowser = null;        // singleton senza proxy (profilo fisso)

/*──────── helper: browser singleton ────────*/
async function getBrowser() {
  if (defaultBrowser) return defaultBrowser;

  defaultBrowser = await puppeteer.launch({
    headless       : false,
    executablePath : chromePath(),
    userDataDir    : path.join(os.homedir(), 'amazon-profile'), // profilo persistente
    defaultViewport: null,
    args           : ['--start-maximized']
  });

  return defaultBrowser;
}

/*──────── helper login ────────*/
async function loginIfNeeded(page) {
  try {
    // Il link "Account e liste" è sempre presente; controlla se contiene "Accedi"
    const btnText = await page.$eval(
      '#nav-link-accountList-nav-line-1',
      el => el.textContent.trim().toLowerCase()
    ).catch(() => '');

    if (btnText && !btnText.includes('accedi')) return; // già loggato

    console.log('🔐 Login Amazon…');
    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.click('#nav-link-accountList')
    ]);

    await page.waitForSelector('#ap_email', { timeout: 10000 });
    await page.type('#ap_email', process.env.AMAZON_EMAIL, { delay: 20 });

    console.log('🕒 Attendi... clicca manualmente su "Continua"');

    await page.waitForSelector('#ap_password', { timeout: 120000 });
    console.log('✏️ Inserisco la password...');
    await page.type('#ap_password', process.env.AMAZON_PASSWORD, { delay: 20 });

    await page.waitForSelector('#signInSubmit', { visible: true, timeout: 10000 });
    await page.click('#signInSubmit');

    const result = await Promise.race([
      page.waitForSelector('#auth-mfa-otpcode', { timeout: 20000 }).then(() => '2fa'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).then(() => 'logged')
    ]);

    if (result === '2fa') {
      console.log('📩 Inserisci il codice 2FA (3 min)…');
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 180000 });
    }

    console.log('✅ Login completato');
  } catch (err) {
    console.error(`❌ loginIfNeeded error: ${err.message}`);
  }
}

/*──────── click‑flow con URL checkout‑portal ────────*/
async function attemptPurchase(page, asin) {
  try {
    // 🔑 assicurati di avere una sessione valida
    await page.goto('https://www.amazon.it/', {
      waitUntil: 'domcontentloaded',
      timeout  : 10000
    });
    await loginIfNeeded(page);

    // 🚀 URL "Compra ora" diretto
    const checkoutUrl =
      'https://www.amazon.it/gp/checkoutportal/enter-checkout.html/ref=dp_mw_buy_now' +
      '?checkoutClientId=retailwebsite&buyNow=1&quantity=1&asin=' + asin;

    await page.goto(checkoutUrl, {
      waitUntil: 'domcontentloaded',
      timeout  : 10000
    });

    // 🛒 pulsante finale "Acquista ora"
    const placeBtn = await page.$('input[name="placeYourOrder1"]');
    if (placeBtn) {
      await Promise.allSettled([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
        placeBtn.click()
      ]);
    }

    // ✅ conferma ordine
    const ok = await page.evaluate(() => {
      const t = document.body.innerText.toLowerCase();
      return t.includes('ordine effettuato') ||
             t.includes('grazie per il tuo ordine') ||
             t.includes('thanks for your order');
    });

    if (page.url().includes('handleBuyNow') || page.url().includes('error')) return false;
    return ok;
  } catch (err) {
    console.error(`❌ attemptPurchase error: ${err.message}`);
    return false;
  }
}

/*──────── funzione principale ────────*/
async function tryPurchase(asin) {
  // 1️⃣ se già in coda ⇒ reset timer
  const existing = purchaseQueue.get(asin);
  if (existing) {
    existing.deadline = Date.now() + 10 * 60e3;
    console.log(`🔄 [${asin}] Timer reset (+10 min)`);
    return;
  }

  // 2️⃣ decide se usare proxy
  const newSize  = purchaseQueue.size + 1;
  const useProxy = proxyParsed && newSize >= 3;

  // 3️⃣ apri nuova pagina
  const browser = await getBrowser();
  const page    = await browser.newPage();

  // 4️⃣ abilita proxy sulla pagina se richiesto
  if (useProxy) {
    await page.authenticate({
      username: proxyParsed.username,
      password: proxyParsed.password
    });

    // logging traffico residuo (best effort)
    if (IPR_API_TOKEN) {
      fetch(`https://dashboard.iproyal.com/api/proxies/traffic?token=${IPR_API_TOKEN}`, {
        dispatcher: new ProxyAgent(proxyUrl)
      })
      .then(r => r.json())
      .then(j => console.log('📊 Proxy MB rimasti:', j?.remaining))
      .catch(() => {});
    }
  }

  // 5️⃣ blocca media/css ma NON xhr (checkout carica i form via xhr)
  await page.setRequestInterception(true);
  page.on('request', r => {
    const t = r.resourceType();
    if (['image', 'media', 'font', 'stylesheet'].includes(t) || r.url().includes('tracking')) {
      r.abort();
    } else {
      r.continue();
    }
  });

  // 6️⃣ User‑Agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );

  // 7️⃣ aggiungi alla coda
  purchaseQueue.set(asin, { deadline: Date.now() + 10 * 60e3, page });

  // 8️⃣ loop ricorsivo finché successo o timeout
  (async function loop() {
    const item = purchaseQueue.get(asin);
    if (!item) return;

    const success = await attemptPurchase(page, asin);

    if (success || Date.now() >= item.deadline) {
      try { await page.close({ runBeforeUnload: false }); } catch {}
      purchaseQueue.delete(asin);
      console.log(`🧹 [${asin}] ${success ? 'SUCCESSO' : 'timeout'} (coda:${purchaseQueue.size})`);
      return;
    }

    setTimeout(loop, 2500 + Math.random() * 2000);
  })();
}

export { tryPurchase };


// ────────────────────────────────────────────────
// FILE
