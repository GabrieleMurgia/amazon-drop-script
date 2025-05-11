const { ProxyAgent, fetch } = require('undici');
const cheerio = require('cheerio');
const https = require('https');

const proxyUrl = 'http://8kI4zYM5zXISzmvX:oYBFJKw6gUkGD6iu_country-it@geo.iproyal.com:12321';
const proxyAgent = new ProxyAgent(proxyUrl);

const IPR_API_TOKEN = 'adfefb94d8157360d73e9099f93a8341167081316d1ed2f8d4583b5a2f20';

const PRODUCTS = [
  { asin: 'B0C8NR3FPG', url: 'https://www.amazon.it/gp/offer-listing/B0C8NR3FPG', maxPrice: 37.00 },
  { asin: 'B0C8NSGN2H', url: 'https://www.amazon.it/gp/offer-listing/B0C8NSGN2H', maxPrice: 60.00 },
  { asin: 'B0BSR7T3G7', url: 'https://www.amazon.it/gp/offer-listing/B0BSR7T3G7', maxPrice: 60.00 },
  { asin: 'B0DFD2XFHL', url: 'https://www.amazon.it/gp/offer-listing/B0DFD2XFHL', maxPrice: 60.00 },
  { asin: 'B0DX2K9KKZ', url: 'https://www.amazon.it/gp/offer-listing/B0DX2K9KKZ', maxPrice: 120.00 },
  { asin: 'B0DTQCBW9B', url: 'https://www.amazon.it/gp/offer-listing/B0DTQCBW9B', maxPrice: 39.99 },
  { asin: 'B0DK93ZQPC', url: 'https://www.amazon.it/gp/offer-listing/B0DK93ZQPC', maxPrice: 60.00 },
  { asin: 'B0DC119VMP', url: 'https://www.amazon.it/gp/offer-listing/B0DC119VMP', maxPrice: 10.00 }
];

const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G970F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
    'Accept-Language': 'it-IT,it;q=0.9',
    'Accept': 'text/html',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'DNT': '1'
  };
  
  async function checkProduct(product) {
    try {
      const res = await fetch(product.url, {
        dispatcher: proxyAgent,
        headers
      });
  
      const buffer = await res.arrayBuffer();
      const sizeKb = buffer.byteLength / 1024;
      console.log(`📦 [${product.asin}] Ricevuti: ${sizeKb.toFixed(2)} KB`);
  
      const html = Buffer.from(buffer).toString('utf-8');
      const $ = cheerio.load(html);
  
      // Cerca il prezzo nella pagina offer-listing (mobile Amazon)
      const priceText = $('.olpOfferPrice, .a-color-price').first().text().trim();
      const price = parseFloat(priceText.replace(/[^\d,\.]/g, '').replace(',', '.'));
  
      const available = !isNaN(price);
      const isOk = available && price <= product.maxPrice;
      const symbol = available ? (isOk ? '🟢' : '🟡') : '🔴';
  
      if (!available) {
        console.log(`${symbol} [${product.asin}] disponibile: no | soglia: €${product.maxPrice.toFixed(2)} | prezzo attuale: n/d`);
      } else {
        console.log(`${symbol} [${product.asin}] disponibile: sì | soglia: €${product.maxPrice.toFixed(2)} | prezzo attuale: €${price.toFixed(2)}`);
      }
    } catch (err) {
      console.log(`❌ [${product.asin}] errore: ${err.message}`);
    }
  }

  
function checkRealBandwidth() {
    const options = {
      method: 'GET',
      hostname: 'resi-api.iproyal.com',
      path: '/v1/me',
      headers: {
        'Authorization': `Bearer ${IPR_API_TOKEN}`
      }
    };
  
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log(parsed)
          const gb = parsed.available_traffic;
          if (typeof gb === 'number') {
            console.log(`📡 Banda residua reale: ${gb.toFixed(2)} GB`);
          } else {
            console.error('❌ Errore: campo "available_traffic" non trovato o non numerico');
          }
        } catch (err) {
          console.error('❌ Errore parsing risposta:', err.message);
        }
      });
    });
  
    req.on('error', (err) => {
      console.error('❌ Errore richiesta IPRoyal:', err.message);
    });
  
    req.end();
  }
(async () => {
  while (true) {
    const start = Date.now();
    await Promise.all(PRODUCTS.map(p => checkProduct(p)));
    const elapsed = Date.now() - start;
    const delay = Math.max(500 - elapsed, 0); // 1 secondo esatto tra i cicli
    /* await checkRealBandwidth(); */
    await new Promise(r => setTimeout(r, 1));
  }
})();
