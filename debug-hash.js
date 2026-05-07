require('dotenv').config();
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function checkHash() {
  const resp = await fetch(`${CHATWOOT_URL}/contacts/search?q=%23microvasos`, { headers: { 'api_access_token': CHATWOOT_TOKEN } });
  const data = await resp.json();
  console.log(`Busca por '#microvasos':`, data.payload ? data.payload.length : data);
}
checkHash();
