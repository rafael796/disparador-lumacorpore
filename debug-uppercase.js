require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function testUppercaseFilter() {
  const resp = await fetch(`${CHATWOOT_URL}/contacts/filter?page=1`, {
    method: 'POST',
    headers: { 
      'api_access_token': CHATWOOT_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      payload: [{ attribute_key: 'labels', filter_operator: 'equal_to', values: ['Microvasos'], query_operator: null }]
    })
  });
  
  const data = await resp.json();
  console.log(`Contatos via /contacts/filter ('Microvasos' maiúsculo):`, data.meta ? data.meta.count : data);
}

testUppercaseFilter();
