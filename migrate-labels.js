require('dotenv').config();


const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_URL = process.env.CHATWOOT_URL;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function migrateLabels() {
  console.log("Criando a etiqueta oficial 'vasinhos'...");
  
  // 1. Create the new official label
  await fetch(`${CHATWOOT_URL}/labels`, {
      method: 'POST',
      headers: { 
        'api_access_token': CHATWOOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'vasinhos',
        description: 'Tag oficial para campanha de secagem de vasinhos',
        color: '#ff0000'
      })
  });

  console.log("Iniciando varredura e migração dos contatos...");
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
        console.error("Erro ao buscar contatos");
        break;
    }

    const data = await resp.json();
    const contacts = data.payload;
    if (!contacts || contacts.length === 0) {
      hasMore = false;
      break;
    }

    // Process in batches
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
              
              // Check if it has any corrupt/old version
              const hasCorrupt = labels.some(l => l.toLowerCase() === 'microvasos' || l === 'microvasos_novo');
              
              if (hasCorrupt) {
                  console.log(`Migrando contato: ${c.name} (ID: ${c.id})...`);
                  
                  // Filter out all old tags and add the new one
                  let newLabels = labels.filter(l => l.toLowerCase() !== 'microvasos' && l !== 'microvasos_novo');
                  
                  // CLEAR OLD LABELS FIRST (To break the ActsAsTaggableOn link)
                  await fetch(`${CHATWOOT_URL}/contacts/${c.id}/labels`, {
                      method: 'POST',
                      headers: { 
                        'api_access_token': CHATWOOT_TOKEN,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({ labels: newLabels }) // Temporarily clear corrupt ones
                  });
                  
                  // NOW ADD THE NEW 'vasinhos'
                  if (!newLabels.includes('vasinhos')) {
                      newLabels.push('vasinhos');
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
                      console.log(`✅ Contato ${c.id} migrado para 'vasinhos'!`);
                  }
              }
          }
        } catch (err) {
            console.error(`Erro no contato ${c.id}:`, err.message);
        }
        totalChecked++;
      });

      await Promise.all(promises);
      await sleep(200); // Prevent rate limits
    }
    
    page++;
  }

  console.log(`\n🎉 Migração 100% concluída!`);
  console.log(`Contatos verificados: ${totalChecked}`);
  console.log(`Contatos migrados para 'vasinhos': ${totalFixed}`);
}

migrateLabels();
