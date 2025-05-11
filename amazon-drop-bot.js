require('dotenv').config(); 

const puppeteer  = require('puppeteer-extra');
const Stealth    = require('puppeteer-extra-plugin-stealth');
const os         = require('os');
const path       = require('path');
const { URL }    = require('url');
const { ProxyAgent, fetch } = require('undici');

puppeteer.use(Stealth());

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
async function getBrowser(useProxy) {
  if (useProxy) {
    if (proxyBrowser) return proxyBrowser;
    proxyBrowser = await puppeteer.launch({
      headless       : false,
      executablePath : chromePath(),
      userDataDir    : path.join(os.homedir(), 'amazon-profile-proxy'),
      defaultViewport: null,
      args           : [
        '--start-maximized',
        `--proxy-server=${proxyParsed.hostname}:${proxyParsed.port}`
      ]
    });
    return proxyBrowser;
  }
  // default
  if (defaultBrowser) return defaultBrowser;
  defaultBrowser = await puppeteer.launch({
    headless       : false,
    executablePath : chromePath(),
    userDataDir    : path.join(os.homedir(), 'amazon-profile'),
    defaultViewport: null,
    args           : ['--start-maximized']
  });
  return defaultBrowser;
}

/*──────── helper login ────────*/
async function loginIfNeeded(page) {
  const signIn = await page.$('#nav-link-accountList');
  if (!signIn) return;                    // già loggato

  console.log('🔐 Login Amazon…');
  await Promise.allSettled([
    page.waitForNavigation({waitUntil:'domcontentloaded'}),
    signIn.click()
  ]);

  /* email */
  await page.type('#ap_email', process.env.AMAZON_EMAIL, {delay:20});
  await Promise.allSettled([
    page.waitForNavigation({waitUntil:'domcontentloaded'}),
    page.click('#continue')
  ]);

  /* password */
  await page.type('#ap_password', process.env.AMAZON_PASSWORD, {delay:20});
  await Promise.allSettled([
    page.waitForNavigation({waitUntil:'domcontentloaded'}),
    page.click('#signInSubmit')
  ]);

  console.log('✅ Login completato');
}

/*──────── click-flow super-snello ────────*/
async function attemptPurchase(page, asin) {

  await loginIfNeeded(page);  

  try {
    await page.goto(`https://www.amazon.it/dp/${asin}`, { waitUntil:'domcontentloaded', timeout:10000 });

    const btn = await page.$('#buy-now-button');
    if (!btn) return false;

    await Promise.allSettled([
      page.waitForNavigation({waitUntil:'domcontentloaded', timeout:10000}),
      btn.click()
    ]);

    const steps = [
      'input[type="submit"][value="Acquista ora"]',
      'input[name="proceedToRetailCheckout"]',
      'input[name="placeYourOrder1"]'
    ];

    for (const sel of steps) {
      const b = await page.$(sel);
      if (!b) continue;
      await Promise.allSettled([
        page.waitForNavigation({waitUntil: sel.endsWith('placeYourOrder1') ? 'networkidle0':'domcontentloaded',
                                timeout  : 15000}),
        b.click()
      ]);
    }

    const ok = await page.evaluate(() => {
      const t = document.body.innerText.toLowerCase();
      return t.includes('ordine effettuato') ||
             t.includes('grazie per il tuo ordine') ||
             t.includes('thanks for your order');
    });

    return ok;
  } catch { return false; }
}

/*──────── funzione principale ────────*/
async function tryPurchase(asin) {

  /* 1️⃣  se già in coda ⇒ reset timer */
  const existing = purchaseQueue.get(asin);
  if (existing) {
    existing.deadline = Date.now() + 10*60e3;
    console.log(`🔄 [${asin}] Timer reset (+10 min)`);
    return;
  }

  /* 2️⃣  decide se serve proxy (nuova size) */
  const newSize  = purchaseQueue.size + 1;
  const useProxy = newSize >= 3;
  const browser  = await getBrowser(useProxy);
  const page     = await browser.newPage();

  /* autentica proxy se serve */
  if (useProxy) {
    await page.authenticate({ username: proxyParsed.username, password: proxyParsed.password });
    // log traffico residuo (non blocca se fallisce)
    fetch(`https://dashboard.iproyal.com/api/proxies/traffic?token=${IPR_API_TOKEN}`,
          { dispatcher: new ProxyAgent(proxyUrl) })
      .then(r => r.json())
      .then(j => console.log('📊 Proxy MB rimasti:', j?.remaining))
      .catch(() => {});
  }

  /* blocca media/css/xhr/tracking */
  await page.setRequestInterception(true);
  page.on('request', r => {
    const t=r.resourceType();
    if (t==='image'||t==='media'||t==='font'||t==='stylesheet'||t==='xhr'||r.url().includes('tracking'))
      r.abort(); else r.continue();
  });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );

  /* salva in coda */
  purchaseQueue.set(asin, { deadline: Date.now() + 10*60e3, page });

  /* loop ricorsivo leggero */
  (async function loop () {
    const item = purchaseQueue.get(asin);
    if (!item) return;
    const success = await attemptPurchase(page, asin);

    if (success || Date.now() >= item.deadline) {
      await page.close();
      purchaseQueue.delete(asin);
      console.log(`🧹 [${asin}] ${ success?'SUCCESSO':'timeout' } (coda:${purchaseQueue.size})`);
      return;
    }
    setTimeout(loop, 2500 + Math.random()*2000);
  })();
}

module.exports = { tryPurchase };
