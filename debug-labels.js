require('dotenv').config();
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function checkRealLabels() {
  const respLabels = await fetch(`${CHATWOOT_URL}/labels`, { headers: { 'api_access_token': CHATWOOT_TOKEN } });
  const labels = await respLabels.json();
  console.log("All Labels:", labels.payload.map(l => l.title));
}
checkRealLabels();
