require('dotenv').config();
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function testNewTag() {
  const cId = 8; // Kátia Maria
  
  // Create system label first just to be safe
  await fetch(`${CHATWOOT_URL}/labels`, {
      method: 'POST',
      headers: { 
        'api_access_token': CHATWOOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'microvasos_novo',
        description: 'Tag corrigida',
        color: '#ff0000'
      })
  });

  // Add it to Kátia
  const resp1 = await fetch(`${CHATWOOT_URL}/contacts/${cId}/labels`, {
      method: 'POST',
      headers: { 
        'api_access_token': CHATWOOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ labels: ['microvasos_novo'] })
  });
  console.log('Status Add:', resp1.status);

  // Check again
  const lblResp = await fetch(`${CHATWOOT_URL}/contacts/${cId}/labels`, {
      headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  console.log(`Labels após adicionar:`, await lblResp.json());

  // Test filter
  const filterResp = await fetch(`${CHATWOOT_URL}/contacts/filter?page=1`, {
    method: 'POST',
    headers: { 
      'api_access_token': CHATWOOT_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      payload: [{ attribute_key: 'labels', filter_operator: 'equal_to', values: ['microvasos_novo'], query_operator: null }]
    })
  });
  
  const data = await filterResp.json();
  console.log(`Contatos via /contacts/filter para microvasos_novo:`, data.meta ? data.meta.count : data);
}

testNewTag();
