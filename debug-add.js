require('dotenv').config();
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function testAddLabel() {
  const cId = 8; // Kátia Maria
  
  // Add lowercase
  const resp1 = await fetch(`${CHATWOOT_URL}/contacts/${cId}/labels`, {
      method: 'POST',
      headers: { 
        'api_access_token': CHATWOOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ labels: ['microvasos'] })
  });
  console.log('Status Add:', resp1.status, await resp1.text());

  // Check again
  const lblResp = await fetch(`${CHATWOOT_URL}/contacts/${cId}/labels`, {
      headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  console.log(`Labels após adicionar:`, await lblResp.json());
}

testAddLabel();
