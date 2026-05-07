require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function checkLabels() {
  console.log("Checando contatos com a tag 'microvasos'...");
  
  // 1. Check contacts API directly
  const respContacts = await fetch(`${CHATWOOT_URL}/contacts?labels=microvasos`, {
    headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  const contactsData = await respContacts.json();
  
  console.log(`Contatos encontrados na API com tag 'microvasos':`, contactsData.payload.length);
  if (contactsData.payload.length > 0) {
      console.log(`Primeiro contato: ${contactsData.payload[0].name}, Labels:`, contactsData.payload[0].custom_attributes);
  }

  // 2. Check conversations API with the label
  const respConvs = await fetch(`${CHATWOOT_URL}/conversations?labels=microvasos`, {
    headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  const convsData = await respConvs.json();
  
  console.log(`\nConversas encontradas na API com tag 'microvasos':`, convsData.data ? convsData.data.meta.all_count : 'Erro');
}

checkLabels();
