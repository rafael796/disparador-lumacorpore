require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function testLabelsArray() {
  console.log("Testando /contacts?labels[]=microvasos");
  
  const resp = await fetch(`${CHATWOOT_URL}/contacts?labels[]=microvasos`, {
    headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  const data = await resp.json();
  
  console.log(`Contatos via GET ?labels[]=microvasos:`, data.meta ? data.meta.count : (data.payload ? data.payload.length : data));
  if (data.payload && data.payload.length > 0) {
      console.log(`Primeiro:`, data.payload[0].name);
  }

  const respB = await fetch(`${CHATWOOT_URL}/contacts?labels[]=botox`, {
    headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  const dataB = await respB.json();
  console.log(`Contatos via GET ?labels[]=botox:`, dataB.meta ? dataB.meta.count : (dataB.payload ? dataB.payload.length : dataB));

}

testLabelsArray();
