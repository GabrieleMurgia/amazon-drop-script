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
const proxyUrl = process.env.PROXY_URL;
const IPR_API_TOKEN = process.env.IPR_API_TOKEN;
const proxyParsed = proxyUrl ? new URL(proxyUrl) : null;
/* ───────────────────────── */

function chromePath() {
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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

function getProfileDir() {
  if (process.platform === 'win32') {
    // cartella locale, sempre scrivibile, non OneDrive
    const dir = path.join(process.env.LOCALAPPDATA, 'puppeteer-amazon-bot');
    console.log('📂 userDataDir Windows:', dir);
    return dir;
  }
  // macOS / Linux
  return path.join(os.homedir(), 'amazon-profile');
}

/*──────── kill di Chrome con profilo ────────*/
function killStaleChromes() {
  const profileDir = getProfileDir();
  try {
    if (process.platform === 'win32') {
      const cmd = `wmic process where "CommandLine like '%%${profileDir.replace(/\\/g, '\\\\')}%%'" call terminate`;
      execSync(cmd, { stdio: 'ignore' });
    } else {
      execSync(`pkill -f "${profileDir}" || true`, { stdio: 'ignore' });
    }
    console.log('🗑️  Chrome vecchi terminati (se presenti)');
  } catch {
    /* nessun Chrome da killare o permessi mancanti */
  }
}

/*■■ globali ■■*/
const purchaseQueue = new Map();
let defaultBrowser = null;
let launchPromise = null;

/*──────── helper: browser singleton ────────*/
async function getBrowser() {
  if (defaultBrowser) return defaultBrowser;
  if (launchPromise) return launchPromise;

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

    try {
      console.log('🚀 Lancio Chrome con profilo:', profileDir);
      const browser = await puppeteer.launch({
        headless: false,
        executablePath: chromePath(),
        userDataDir: profileDir,
        defaultViewport: null,
        args: ['--start-maximized']
      });

      console.log('✅ Browser avviato');
      defaultBrowser = browser;
      return browser;
    } catch (err) {
      console.error('❌ Puppeteer launch fallito:', err.message);
      throw err;
    }
  })();

  return launchPromise;
}

/*──────── chiusura ordinata ────────*/
async function gracefulExit() {
  if (defaultBrowser) {
    try { await defaultBrowser.close(); }
    catch { defaultBrowser.process().kill('SIGKILL'); }
  }
  process.exit(0);
}
process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);

/*──────── helper login ────────*/
async function loginIfNeeded(page) {
  try {
    const btnText = await page.$eval(
      '#nav-link-accountList-nav-line-1',
      el => el.textContent.trim().toLowerCase()
    ).catch(() => '');

    if (btnText && !btnText.includes('accedi')) return;

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

/*──────── click-flow con URL checkout-portal ────────*/
async function attemptPurchase(page, asin) {
  try {
    await page.goto('https://www.amazon.it/', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    await loginIfNeeded(page);

    const checkoutUrl =
      'https://www.amazon.it/gp/checkoutportal/enter-checkout.html/ref=dp_mw_buy_now' +
      `?checkoutClientId=retailwebsite&buyNow=1&quantity=1&asin=${asin}`;

    await page.goto(checkoutUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    const placeBtn = await page.$('input[name="placeYourOrder1"]');
    if (placeBtn) {
      await Promise.allSettled([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
        placeBtn.click()
      ]);
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

/*──────── funzione principale ────────*/
async function tryPurchase(asin) {
  const existing = purchaseQueue.get(asin);
  if (existing) {
    existing.deadline = Date.now() + 10 * 60e3;
    console.log(`🔄 [${asin}] Timer reset (+10 min)`);
    return;
  }

  const newSize = purchaseQueue.size + 1;
  const useProxy = proxyParsed && newSize >= 3;

  const browser = await getBrowser();
  const page = await browser.newPage();

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

  await page.setRequestInterception(true);
  page.on('request', r => {
    const t = r.resourceType();
    if (['image', 'media', 'font', 'stylesheet'].includes(t) || r.url().includes('tracking')) {
      r.abort();
    } else {
      r.continue();
    }
  });

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );

  purchaseQueue.set(asin, { deadline: Date.now() + 10 * 60e3, page });

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