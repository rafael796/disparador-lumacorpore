require('dotenv').config();

async function rewriteWithAI(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No API KEY found!");
    return text;
  }

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: `Você é um assistente de reescrita criativa para mensagens de WhatsApp Business.
Sua tarefa: rescrever a mensagem de forma LEVEMENTE diferente, mantendo o mesmo significado.
REGRAS:
1. Mantenha o mesmo objetivo e sentido
2. Não altere URLs/links
3. Faça mudanças SUTIS: sinônimos, ordem de frases, conectivos diferentes
4. Mantenha tom profissional
5. Retorne APENAS a mensagem reescrita, sem explicações
6. Use apenas o primeiro nome
7. Aplique no máximo 2 ajustes
8. Não altere nomes próprios (Wanessa, Luma Corpore)` }] },
        contents: [{ parts: [{ text: `Reescreva esta mensagem:\n\n${text}` }] }],
        generationConfig: {
          temperature: 1.2,
          topP: 0.95
        }
      })
    });
    
    if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`Erro na API Gemini (${resp.status}):`, errorText);
        return text;
    }
    
    const data = await resp.json();
    const rewritten = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (rewritten) {
        console.log(`\n--- REESCRITA COM IA ---`);
        console.log(`ORIGINAL: ${text}`);
        console.log(`REESCRITO: ${rewritten}`);
        console.log(`------------------------\n`);
        return rewritten;
    }
    return text;
  } catch (e) {
    console.error('Erro IA:', e.message);
    return text;
  }
}

async function run() {
    console.log("Iniciando teste local com 3 variações diferentes...");
    const msg = "🌸 Oi Rafael! Aqui é a Wanessa, biomédica da Clínica Luma Corpore. Vi que você se interessou pelo nosso tratamento.";
    
    console.log("Teste 1:");
    await rewriteWithAI(msg);
    
    console.log("Teste 2:");
    await rewriteWithAI(msg);
    
    console.log("Teste 3:");
    await rewriteWithAI(msg);
}

run();
