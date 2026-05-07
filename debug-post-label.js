require('dotenv').config();
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function testPostLabel() {
  const cId = 8; // Kátia Maria
  
  // Try to update using POST /labels
  const resp1 = await fetch(`${CHATWOOT_URL}/contacts/${cId}/labels`, {
      method: 'POST',
      headers: { 
        'api_access_token': CHATWOOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ labels: ['microvasos'] })
  });
  
  console.log('Status POST /labels:', resp1.status);
  console.log('Body POST /labels:', await resp1.text());
}

testPostLabel();
