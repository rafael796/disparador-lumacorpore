require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function checkKatia() {
  console.log("Pesquisando Kátia Maria (+553186316000)...");
  
  const resp = await fetch(`${CHATWOOT_URL}/contacts/search?q=+553186316000`, {
    headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  const data = await resp.json();
  
  if (data.payload && data.payload.length > 0) {
    const k = data.payload[0];
    console.log(`Encontrado: ${k.name}`);
    console.log(`ID do Contato: ${k.id}`);
    console.log(`Custom Attributes:`, k.custom_attributes);
    // Fetch detailed labels for this contact
    const lblResp = await fetch(`${CHATWOOT_URL}/contacts/${k.id}/labels`, {
      headers: { 'api_access_token': CHATWOOT_TOKEN }
    });
    const lblData = await lblResp.json();
    console.log(`Labels explícitas do contato:`, lblData.payload);
  } else {
    console.log("Não encontrado.");
  }
}

checkKatia();
