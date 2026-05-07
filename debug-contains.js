require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function testContains() {
  const resp = await fetch(`${CHATWOOT_URL}/contacts/filter?page=1`, {
    method: 'POST',
    headers: { 
      'api_access_token': CHATWOOT_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      payload: [{ attribute_key: 'labels', filter_operator: 'contains', values: ['micro'], query_operator: null }]
    })
  });
  
  const data = await resp.json();
  console.log(`Contatos com 'contains' 'micro':`, data.meta ? data.meta.count : data);

  const resp2 = await fetch(`${CHATWOOT_URL}/contacts/filter?page=1`, {
    method: 'POST',
    headers: { 
      'api_access_token': CHATWOOT_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      payload: [{ attribute_key: 'labels', filter_operator: 'equal_to', values: ['Microvasos', 'microvasos'], query_operator: null }]
    })
  });
  const data2 = await resp2.json();
  console.log(`Contatos com 'equal_to' array múltiplo:`, data2.meta ? data2.meta.count : data2);
}

testContains();
