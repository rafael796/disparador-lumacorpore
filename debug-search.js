require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function searchMicrovasos() {
  console.log("Pesquisando 'microvasos' globalmente no Chatwoot...");
  
  // 1. Get all labels to see if there are duplicates or weird casing
  const respLabels = await fetch(`${CHATWOOT_URL}/labels`, { headers: { 'api_access_token': CHATWOOT_TOKEN } });
  const labels = await respLabels.json();
  console.log("Labels disponíveis:", labels.payload.map(l => l.title).filter(t => t.toLowerCase().includes('micro') || t.toLowerCase().includes('botox')));

  // 2. Search contacts via generic search using query 'microvasos'
  const respSearch = await fetch(`${CHATWOOT_URL}/contacts/search?q=microvasos`, { headers: { 'api_access_token': CHATWOOT_TOKEN } });
  const searchData = await respSearch.json();
  console.log(`Contatos encontrados na busca genérica por 'microvasos':`, searchData.payload ? searchData.payload.length : searchData);
  
  if (searchData.payload && searchData.payload.length > 0) {
      console.log(`Primeiro contato da busca: ${searchData.payload[0].name}, Labels:`, searchData.payload[0].custom_attributes);
  }
}

searchMicrovasos();
