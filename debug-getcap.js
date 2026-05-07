require('dotenv').config();
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function checkKatiaAgain() {
  const resp = await fetch(`${CHATWOOT_URL}/contacts?labels[]=Microvasos`, { headers: { 'api_access_token': CHATWOOT_TOKEN } });
  const data = await resp.json();
  console.log(`Contatos via GET ?labels[]=Microvasos:`, data.meta ? data.meta.count : data.payload.length);
}
checkKatiaAgain();
