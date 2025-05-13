import dotenv from 'dotenv';
dotenv.config(); // carica le variabili da .env

import { Client } from 'discord.js-selfbot-v13';
import { tryPurchase } from './amazon-drop-bot.js';

const client      = new Client({ checkUpdate: false });
const CHANNEL_ID  = /* '1350960827129401528' */ '1370756497914597456';;

const validAsins = process.env.MONITOR_ASINS
  ? process.env.MONITOR_ASINS.split(',').map(s=>s.trim()).filter(Boolean)
  : [
      'B0C8NR3FPG','B0C8NSGN2H','B0BSR7T3G7',
      'B0DFD2XFHL','B0DX2K9KKZ','B0DTQCBW9B',
      'B0DK93ZQPC','B0CJJP1PQB'
    ];

    console.log(validAsins)

const detectAsins = txt => validAsins.filter(a => txt?.includes(a));

client.on('ready', () =>
  console.log(`✅ Loggato come ${client.user.username}`)
);

client.on('messageCreate', msg => {
  if (msg.channel.id !== CHANNEL_ID) return;

  console.log('📥  Nuovo messaggio');
  const tryAll = list => list.forEach(asin => {
    console.log(`🚨  ASIN ${asin} trovato → tryPurchase`);
    tryPurchase(asin);
  });

  /* testo normale */
  const foundText = detectAsins(msg.content);
  if (foundText.length) return tryAll(foundText);

  /* embed */
  for (const [idx, emb] of msg.embeds.entries()) {
    const all = `${emb.title||''} ${emb.description||''} ${emb.url||''}`;
    const found = detectAsins(all);
    if (found.length) tryAll(found);
  }
});


client.login(process.env.DISCORD_TOKEN);