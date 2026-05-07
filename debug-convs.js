require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function testConversations() {
  const resp = await fetch(`${CHATWOOT_URL}/conversations?labels=microvasos&status=all`, {
    headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  const data = await resp.json();
  console.log(`Conversas com 'microvasos':`, data.data ? data.data.meta.all_count : data);
  
  if (data.data && data.data.payload && data.data.payload.length > 0) {
    const conv = data.data.payload[0];
    console.log(`Primeiro contato da conversa:`, conv.meta.sender.name);
  }
}

testConversations();
