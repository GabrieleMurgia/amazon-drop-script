// server.js
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import open from 'open';
import { fileURLToPath } from 'url';

dotenv.config(); // carica .env se presente

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ────── configurazione ────── */
const PORT = 3000;
let runningChild = null;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve GUI

/* ───────────── GET /env ───────────── */
app.get('/env', (_req, res) => {
  res.json({
    AMAZON_EMAIL    : process.env.AMAZON_EMAIL    || '',
    AMAZON_PASSWORD : process.env.AMAZON_PASSWORD || '',
    DISCORD_TOKEN   : process.env.DISCORD_TOKEN   || '',
    PROXY_URL       : process.env.PROXY_URL       || '',
    IPR_API_TOKEN   : process.env.IPR_API_TOKEN   || '',
    MONITOR_ASINS   : process.env.MONITOR_ASINS   || ''
  });
});

/* ───────────── POST /start ───────────── */
app.post('/start', (req, res) => {
  const {
    AMAZON_EMAIL    = '',
    AMAZON_PASSWORD = '',
    DISCORD_TOKEN   = '',
    PROXY_URL       = '',
    IPR_API_TOKEN   = '',
    MONITOR_ASINS   = ''
  } = req.body || {};

  // 1. scrive il file .env
  const envText = [
    `AMAZON_EMAIL=${AMAZON_EMAIL}`,
    `AMAZON_PASSWORD=${AMAZON_PASSWORD}`,
    `DISCORD_TOKEN=${DISCORD_TOKEN}`,
    `PROXY_URL=${PROXY_URL}`,
    `IPR_API_TOKEN=${IPR_API_TOKEN}`,
    `MONITOR_ASINS=${MONITOR_ASINS}`
  ].join('\n');

  fs.writeFileSync(path.join(__dirname, '.env'), envText, 'utf8');
  console.log('💾  .env aggiornato');

  // 2. aggiorna anche process.env
  Object.assign(process.env, {
    AMAZON_EMAIL, AMAZON_PASSWORD, DISCORD_TOKEN,
    PROXY_URL, IPR_API_TOKEN, MONITOR_ASINS
  });

  // 3. killa eventuale processo precedente
  if (runningChild) {
    runningChild.kill('SIGTERM');
    console.log('⏹  Bot precedente terminato');
  }

  // 4. avvia nuovo processo bot
  runningChild = spawn('node', ['check-discord.js'], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  runningChild.on('exit', (code, sig) => {
    console.log(`⚠️  Bot terminato (code ${code} | sig ${sig})`);
    runningChild = null;
  });

  res.json({ ok: true, msg: 'Bot avviato!' });
});

/* ───────────── avvia server GUI + browser ───────────── */
app.listen(PORT, () => {
  console.log(`🚀 GUI pronta → http://localhost:${PORT}`);
  open(`http://localhost:${PORT}`);
});
