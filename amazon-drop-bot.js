// ────────────────────────────────────────────────
// FILE: amazon-drop-bot.js  (modulo di acquisto)
// ────────────────────────────────────────────────
import dotenv from 'dotenv';
dotenv.config();

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { URL } from 'url';
import { ProxyAgent, fetch } from 'undici';

/* ───── proxy config ───── */
const proxyUrl      = process.env.PROXY_URL;
const IPR_API_TOKEN = process.env.IPR_API_TOKEN;
const proxyParsed   = proxyUrl ? new URL(proxyUrl) : null;
/* ───────────────────────── */

function chromePath () {
  if (process.platform === 'darwin')
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'win32') {
    const guesses = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    const found = guesses.find(fs.existsSync);
    if (!found) throw new Error('❌ Chrome non trovato su Windows');
    return found;
  }
  return '/usr/bin/google-chrome';
}

function getProfileDir () {
  if (process.platform === 'win32')
    return path.join(process.env.LOCALAPPDATA, 'puppeteer-amazon-bot');
  return path.join(os.homedir(), 'amazon-profile');
}

/*──── uccide Chrome zombie che tengono il profilo lockato ────*/
function killStaleChromes () {
  const profileDir = getProfileDir();
  try {
    if (process.platform === 'win32') {
      const cmd = `wmic process where "CommandLine like '%%${profileDir.replace(/\\/g, '\\\\')}%%'" call terminate`;
      execSync(cmd, { stdio: 'ignore' });
    } else {
      execSync(`pkill -f "${profileDir}" || true`, { stdio: 'ignore' });
    }
    console.log('🗑️  Chrome vecchi terminati (se presenti)');
  } catch { /* nessuno o permessi mancanti */ }
}

/*■■ globali ■■*/
const purchaseQueue = new Map();
let   defaultBrowser = null;
let   launchPromise  = null;

/*─────────── PAGE-POOL ───────────*/
const POOL_SIZE = process.env.MONITOR_ASINS.split(',').map(s=>s.trim()).filter(Boolean).length;
const pagePool  = [];

async function setupPage (page) {
  page.removeAllListeners('request');
  await page.setRequestInterception(true);
  page.on('request', r => {
    const t = r.resourceType();
    if (['image', 'media', 'font', 'stylesheet'].includes(t) || r.url().includes('tracking'))
      r.abort();
    else
      r.continue();
  });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );
}

async function getFreePage (browser) {
  if (pagePool.length) {
    const p = pagePool.pop();
    await setupPage(p);
    return p;
  }
  const p = await browser.newPage();
  await setupPage(p);
  return p;
}

function releasePage (page) {
  page.removeAllListeners();
  page.goto('about:blank').catch(() => {});
  if (pagePool.length < POOL_SIZE) pagePool.push(page);
  else page.close({ runBeforeUnload: false }).catch(() => {});
}

/*──────── browser singleton ────────*/
async function getBrowser () {
  if (defaultBrowser) return defaultBrowser;
  if (launchPromise)   return launchPromise;

  launchPromise = (async () => {
    killStaleChromes();

    const profileDir = getProfileDir();
    try {
      const lockFile = path.join(profileDir, 'SingletonLock');
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log('🔓  Lock orfano rimosso');
      }
    } catch (err) {
      console.warn('⚠️  Impossibile rimuovere SingletonLock:', err.message);
    }

    console.log('🚀 Lancio Chrome con profilo:', profileDir);
    const browser = await puppeteer.launch({
      headless: false,                       // puoi mettere 'new' se vuoi headless
      executablePath: chromePath(),
      userDataDir: profileDir,
      defaultViewport: null,
      args: [
          '--start-maximized',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding'
      ]
    });

    console.log('✅ Browser avviato');

    /* warm-up: crea 3 tab nel pool */
    while (pagePool.length < POOL_SIZE) {
      const p = await browser.newPage();
      await setupPage(p);
      pagePool.push(p);
    }

    const keepAlive = await browser.newPage();
await keepAlive.goto('https://www.amazon.it/', { waitUntil: 'domcontentloaded' });
console.log('♥️  Tab keep-alive pronta (si aggiorna ogni 5 min)');

setInterval(async () => {
  try {
    await keepAlive.reload({ waitUntil: 'domcontentloaded' });
    console.log('↻  Refresh keep-alive OK');
  } catch (err) {
    console.warn('⚠️  Refresh keep-alive fallito:', err.message);
  }
}, 5 * 60 * 1000);   // 5 minuti

    defaultBrowser = browser;
    return browser;
  })();

  return launchPromise;
}

/*──────── uscita ordinata ────────*/
async function gracefulExit () {
  if (defaultBrowser) {
    try { await defaultBrowser.close(); }
    catch { defaultBrowser.process().kill('SIGKILL'); }
  }
  process.exit(0);
}
process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);

/*──────── login ────────*/
async function loginIfNeeded (page) {
  try {
    const btnText = await page.$eval(
      '#nav-link-accountList-nav-line-1',
      el => el.textContent.trim().toLowerCase()
    ).catch(() => '');

    if (btnText && !btnText.includes('accedi')) return; // già loggato

    console.log('🔐 Login Amazon…');
    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
      page.click('#nav-link-accountList')
    ]);

    await page.waitForSelector('#ap_email', { timeout: 10000 });
    await page.type('#ap_email', process.env.AMAZON_EMAIL, { delay: 20 });

    console.log('🕒 Attendi... clicca manualmente su "Continua"');

    await page.waitForSelector('#ap_password', { timeout: 120000 });
    console.log('✏️ Inserisco la password…');
    await page.type('#ap_password', process.env.AMAZON_PASSWORD, { delay: 20 });

    await page.waitForSelector('#signInSubmit', { visible: true, timeout: 10000 });
    await page.click('#signInSubmit');

    const result = await Promise.race([
      page.waitForSelector('#auth-mfa-otpcode', { timeout: 20000 }).then(() => '2fa'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).then(() => 'logged')
    ]);

    if (result === '2fa') {
      console.log('📩 Inserisci il codice 2FA (3 min)…');
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 180000 });
    }

    console.log('✅ Login completato');
  } catch (err) {
    console.error(`❌ loginIfNeeded error: ${err.message}`);
  }
}

/*──────── acquisto ────────*/
async function attemptPurchase (page, asin) {
  try {
    await page.goto('https://www.amazon.it/', {
      waitUntil: 'domcontentloaded',
      timeout  : 10000
    });
    await loginIfNeeded(page);

    const checkoutUrl =
      'https://www.amazon.it/gp/checkoutportal/enter-checkout.html/ref=dp_mw_buy_now' +
      `?checkoutClientId=retailwebsite&buyNow=1&quantity=1&asin=${asin}`;
    
    
    await page.goto(checkoutUrl, {
      waitUntil: 'domcontentloaded',
      timeout  : 10000
    });

    const placeBtn = await page.$('input[name="placeYourOrder1"]');
    if (placeBtn) {
      await page.bringToFront();  
      await Promise.allSettled([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
        placeBtn.click()
      ]);

/*       const okXHR = await page.evaluate(async btn => {
  const form = btn.form;
  const action = form.action;
  const data = new FormData(form);
  const res  = await fetch(action, { method: 'POST', body: data, credentials: 'include' });
  return res.ok && (await res.text()).toLowerCase().includes('ordine effettuato');
}, placeBtn);
if (okXHR) return true;    */



    }

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

/*──────── entry-point pubblica ────────*/
async function tryPurchase (asin) {
  const existing = purchaseQueue.get(asin);
  if (existing) {
    existing.deadline = Date.now() + 10 * 60e3;
    console.log(`🔄 [${asin}] Timer reset (+10 min)`);
    return;
  }

  const newSize   = purchaseQueue.size + 1;
  const useProxy  = proxyParsed && newSize >= 3;
  const browser   = await getBrowser();
  const page      = await getFreePage(browser);

  if (useProxy) {
    await page.authenticate({
      username: proxyParsed.username,
      password: proxyParsed.password
    });

    if (IPR_API_TOKEN) {
      fetch(`https://dashboard.iproyal.com/api/proxies/traffic?token=${IPR_API_TOKEN}`, {
        dispatcher: new ProxyAgent(proxyUrl)
      })
      .then(r => r.json())
      .then(j => console.log('📊 Proxy MB rimasti:', j?.remaining))
      .catch(() => {});
    }
  }

  purchaseQueue.set(asin, { deadline: Date.now() + 10 * 60e3, page });

  (async function loop () {
    const item = purchaseQueue.get(asin);
    if (!item) return;

    const success = await attemptPurchase(page, asin);

    if (success || Date.now() >= item.deadline) {
      releasePage(page);
      purchaseQueue.delete(asin);
      console.log(`🧹 [${asin}] ${success ? 'SUCCESSO' : 'timeout'} (coda:${purchaseQueue.size})`);
      return;
    }

    setTimeout(loop, 400 + Math.random() * 600); // 0,4-1,0 s
  })();
}

export { tryPurchase, getBrowser };
