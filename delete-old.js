require('dotenv').config();

const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function deleteOldLabel() {
  const respLabels = await fetch(`${CHATWOOT_URL}/labels`, { headers: { 'api_access_token': CHATWOOT_TOKEN } });
  const data = await respLabels.json();
  const labels = data.payload || [];
  
  const oldLabel = labels.find(l => l.title === 'microvasos');
  if (oldLabel) {
      console.log(`Deletando etiqueta corrompida 'microvasos' (ID: ${oldLabel.id})...`);
      const delResp = await fetch(`${CHATWOOT_URL}/labels/${oldLabel.id}`, {
          method: 'DELETE',
          headers: { 'api_access_token': CHATWOOT_TOKEN }
      });
      if (delResp.ok) {
          console.log("✅ Etiqueta antiga deletada com sucesso do Chatwoot!");
      } else {
          console.log("❌ Erro ao deletar", await delResp.text());
      }
  } else {
      console.log("Etiqueta 'microvasos' não encontrada ou já deletada.");
  }
}

deleteOldLabel();
