require('dotenv').config();
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function searchCap() {
  const resp = await fetch(`${CHATWOOT_URL}/contacts/search?q=Microvasos`, { headers: { 'api_access_token': CHATWOOT_TOKEN } });
  const data = await resp.json();
  console.log(`Busca por 'Microvasos':`, data.payload ? data.payload.length : data);
}

searchCap();
