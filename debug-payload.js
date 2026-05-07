require('dotenv').config();
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function checkPayload() {
  const resp = await fetch(`${CHATWOOT_URL}/contacts?page=1`, { headers: { 'api_access_token': CHATWOOT_TOKEN } });
  const data = await resp.json();
  if (data.payload && data.payload.length > 0) {
    console.log(Object.keys(data.payload[0]));
    // See if labels are in custom_attributes or anywhere
  }
}
checkPayload();
