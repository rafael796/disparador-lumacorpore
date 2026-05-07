require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function checkSegments() {
  console.log("Checking custom segments...");
  const resp = await fetch(`${CHATWOOT_URL}/custom_filters`, {
    headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  const data = await resp.json();
  console.log(data);
}

checkSegments();
