require('dotenv').config();
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;



async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fixLabels() {
  console.log("Iniciando varredura de contatos para corrigir a tag 'Microvasos'...");
  let page = 1;
  let hasMore = true;
  let totalFixed = 0;
  let totalChecked = 0;

  while (hasMore) {
    console.log(`Lendo página ${page}...`);
    const resp = await fetch(`${CHATWOOT_URL}/contacts?page=${page}`, {
      headers: { 'api_access_token': CHATWOOT_TOKEN }
    });
    
    if (!resp.ok) {
        console.error("Erro ao buscar contatos", await resp.text());
        break;
    }

    const data = await resp.json();
    const contacts = data.payload;
    if (!contacts || contacts.length === 0) {
      hasMore = false;
      break;
    }

    // Process in batches of 10 to avoid rate limit
    for (let i = 0; i < contacts.length; i += 10) {
      const batch = contacts.slice(i, i + 10);
      const promises = batch.map(async (c) => {
        try {
          const lblResp = await fetch(`${CHATWOOT_URL}/contacts/${c.id}/labels`, {
            headers: { 'api_access_token': CHATWOOT_TOKEN }
          });
          if (lblResp.ok) {
              const lblData = await lblResp.json();
              const labels = lblData.payload || [];
              
              if (labels.includes('Microvasos')) {
                  console.log(`Corrigindo contato: ${c.name} (ID: ${c.id})...`);
                  
                  // Remover 'Microvasos' e adicionar 'microvasos'
                  const newLabels = labels.filter(l => l !== 'Microvasos');
                  if (!newLabels.includes('microvasos')) {
                      newLabels.push('microvasos');
                  }
                  
                  const updateResp = await fetch(`${CHATWOOT_URL}/contacts/${c.id}/labels`, {
                      method: 'POST',
                      headers: { 
                        'api_access_token': CHATWOOT_TOKEN,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({ labels: newLabels })
                  });
                  
                  if (updateResp.ok) {
                      totalFixed++;
                      console.log(`✅ Contato ${c.id} corrigido com sucesso!`);
                  } else {
                      console.error(`❌ Erro ao corrigir contato ${c.id}`, await updateResp.text());
                  }
              }
          }
        } catch (err) {
            console.error(`Erro no contato ${c.id}:`, err.message);
        }
        totalChecked++;
      });

      await Promise.all(promises);
      // Small delay to prevent hitting API limits
      await sleep(200);
    }
    
    page++;
  }

  console.log(`\n🎉 Varredura concluída!`);
  console.log(`Contatos verificados: ${totalChecked}`);
  console.log(`Contatos corrigidos: ${totalFixed}`);
}

fixLabels();
