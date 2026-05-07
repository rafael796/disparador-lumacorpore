require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function checkFilter() {
  console.log("Testando /contacts/filter para 'microvasos'...");
  
  const resp = await fetch(`${CHATWOOT_URL}/contacts/filter?page=1`, {
    method: 'POST',
    headers: { 
      'api_access_token': CHATWOOT_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      payload: [{ attribute_key: 'labels', filter_operator: 'equal_to', values: ['microvasos'], query_operator: null }]
    })
  });
  
  const data = await resp.json();
  console.log(`Contatos via /contacts/filter:`, data.meta ? data.meta.count : data);
  
  // Test botox just to compare
  const respBotox = await fetch(`${CHATWOOT_URL}/contacts/filter?page=1`, {
    method: 'POST',
    headers: { 
      'api_access_token': CHATWOOT_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      payload: [{ attribute_key: 'labels', filter_operator: 'equal_to', values: ['botox'], query_operator: null }]
    })
  });
  
  const dataBotox = await respBotox.json();
  console.log(`Contatos via /contacts/filter ('botox'):`, dataBotox.meta ? dataBotox.meta.count : dataBotox);
  
  // Test standard GET /contacts?labels=microvasos
  const respGet = await fetch(`${CHATWOOT_URL}/contacts?labels=microvasos`, {
    headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  const dataGet = await respGet.json();
  console.log(`Contatos via GET /contacts?labels=microvasos:`, dataGet.meta ? dataGet.meta.count : dataGet.payload.length);
}

checkFilter();
