require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function fixSidebar() {
  // 1. Get all labels
  const respLabels = await fetch(`${CHATWOOT_URL}/labels`, { headers: { 'api_access_token': CHATWOOT_TOKEN } });
  const data = await respLabels.json();
  const labels = data.payload || [];
  
  const vasinhosLabel = labels.find(l => l.title === 'vasinhos');
  
  if (vasinhosLabel) {
    console.log(`Encontrado 'vasinhos' (ID: ${vasinhosLabel.id}). Atualizando show_on_sidebar...`);
    // 2. Update label
    const updateResp = await fetch(`${CHATWOOT_URL}/labels/${vasinhosLabel.id}`, {
      method: 'PATCH',
      headers: { 
        'api_access_token': CHATWOOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        show_on_sidebar: true
      })
    });
    
    if (updateResp.ok) {
      console.log('✅ Atualizado com sucesso! Agora vai aparecer na barra lateral.');
    } else {
      console.log('❌ Falha ao atualizar', await updateResp.text());
    }
  } else {
    console.log("Não encontrou 'vasinhos'");
  }
}

fixSidebar();
