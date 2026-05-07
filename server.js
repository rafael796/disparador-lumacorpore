const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Upload config
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const upload = multer({ dest: uploadsDir, limits: { fileSize: 40 * 1024 * 1024 } });

// State
const dispatches = {};
const { CHATWOOT_TOKEN, CHATWOOT_URL, INBOX_ID } = process.env;

// --- HELPERS ---
async function chatwootGet(endpoint) {
  const resp = await fetch(`${CHATWOOT_URL}${endpoint}`, {
    headers: { 'api_access_token': CHATWOOT_TOKEN }
  });
  return resp.json();
}

async function chatwootPost(endpoint, body) {
  const resp = await fetch(`${CHATWOOT_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'api_access_token': CHATWOOT_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return resp.json();
}

async function chatwootPut(endpoint, body) {
  const resp = await fetch(`${CHATWOOT_URL}${endpoint}`, {
    method: 'PUT',
    headers: { 'api_access_token': CHATWOOT_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return resp.json();
}

function chatwootPostMultipart(endpoint, form) {
  return new Promise((resolve, reject) => {
    const fullUrl = `${CHATWOOT_URL}${endpoint}`;
    const url = new URL(fullUrl);
    form.submit({
      host: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      protocol: url.protocol,
      headers: { 'api_access_token': CHATWOOT_TOKEN }
    }, (err, res) => {
      if (err) return reject(err);
      console.log(`Multipart response status: ${res.statusCode}`);
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`Multipart response body: ${body.substring(0, 200)}`);
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve({ raw: body, statusCode: res.statusCode }); }
      });
    });
  });
}

async function rewriteWithOpenAI(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return text;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 1.2,
        messages: [
          { role: 'system', content: `Você é um assistente de reescrita criativa para mensagens de WhatsApp Business.
Sua tarefa: rescrever a mensagem de forma um pouco diferente, mas mantendo o mesmo significado, para evitar bloqueios de disparos em massa pelo whatsapp business.
REGRAS:
1. Mantenha o mesmo objet ivo e sentido
2. Não altere URLs/links
3. Faça mudanças sutis: sinônimos, ordem de frases, conectivos diferentes
4. Mantenha tom profissional
5. Retorne APENAS a mensagem reescrita, sem explicações
6. Use apenas o primeiro nome
7. Não altere nomes próprios (Wanessa, Luma Corpore)` },
          { role: 'user', content: `Reescreva esta mensagem:\n\n${text}` }
        ]
      })
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`Erro na API OpenAI (${resp.status}):`, errorText);
      return text;
    }

    const data = await resp.json();
    const rewritten = data.choices?.[0]?.message?.content?.trim();

    if (rewritten) {
      console.log(`\n--- REESCRITA COM IA (OPENAI) ---`);
      console.log(`ORIGINAL: ${text.substring(0, 100)}...`);
      console.log(`REESCRITO: ${rewritten.substring(0, 100)}...`);
      console.log(`------------------------\n`);
      return rewritten;
    }
    return text;
  } catch (e) {
    console.error('Erro IA (OpenAI):', e.message);
    return text;
  }
}

async function rewriteWithAI(text, provider = 'gemini') {
  if (provider === 'openai') {
    return await rewriteWithOpenAI(text);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return text; // Se não tem chave, retorna original

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: `Você é um assistente de reescrita criativa para mensagens de WhatsApp Business.
Sua tarefa: rescrever a mensagem de forma um pouco diferente, mas mantendo o mesmo significado, para evitar bloqueios de disparos em massa pelo whatsapp business.
REGRAS:
1. Mantenha o mesmo objet ivo e sentido
2. Não altere URLs/links
3. Faça mudanças sutis: sinônimos, ordem de frases, conectivos diferentes
4. Mantenha tom profissional
5. Retorne APENAS a mensagem reescrita, sem explicações
6. Use apenas o primeiro nome
7. Não altere nomes próprios (Wanessa, Luma Corpore)` }]
        },
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
      console.log(`ORIGINAL: ${text.substring(0, 100)}...`);
      console.log(`REESCRITO: ${rewritten.substring(0, 100)}...`);
      console.log(`------------------------\n`);
      return rewritten;
    }
    return text;
  } catch (e) {
    console.error('Erro IA:', e.message);
    return text;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- HELPERS DE AGENDAMENTO ---
function getBrazilDate() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const hash = {};
  parts.forEach(p => hash[p.type] = p.value);
  return new Date(hash.year, hash.month - 1, hash.day, hash.hour, hash.minute, hash.second);
}

function isWorkingHours() {
  const brTime = getBrazilDate();
  const hour = brTime.getHours();
  return hour >= 7 && hour < 22; // 07:00 às 21:59
}

function getSecondsUntilNext7AM() {
  const brTime = getBrazilDate();
  const target = new Date(brTime);
  if (brTime.getHours() >= 22) {
    target.setDate(target.getDate() + 1);
  }
  target.setHours(7, 0, 0, 0);
  return Math.max(0, Math.floor((target.getTime() - brTime.getTime()) / 1000));
}

function calculateDelay(dailyLimit, sentToday) {
  if (sentToday >= dailyLimit) return 0;
  const brTime = getBrazilDate();
  const hour = brTime.getHours();
  const hoursLeft = Math.max(1, 22 - hour);
  const secondsLeft = hoursLeft * 3600;
  const remainingToday = dailyLimit - sentToday;
  
  const baseDelay = Math.floor(secondsLeft / remainingToday);
  
  // Caos controlado (± 40%)
  const variance = Math.floor(baseDelay * 0.4);
  const minDelay = Math.max(10, baseDelay - variance);
  const maxDelay = baseDelay + variance;
  
  return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
}

// --- ROTAS API ---

// Listar labels
app.get('/api/tags', async (req, res) => {
  try {
    const data = await chatwootGet('/labels');
    res.json(data.payload || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Buscar contatos por tag (chunks de ~250 contatos para o frontend)
app.post('/api/contacts', async (req, res) => {
  try {
    const { tag, startPage = 1 } = req.body;
    const CHUNK_SIZE = 250;

    let currentPage = startPage;
    let accumulated = [];
    let hasMore = true;
    let totalInBase = 0;

    while (hasMore && accumulated.length < CHUNK_SIZE) {
      let data;
      if (tag) {
        data = await chatwootPost(`/contacts/filter?page=${currentPage}`, {
          payload: [{ attribute_key: 'labels', filter_operator: 'equal_to', values: [tag], query_operator: null }]
        });
      } else {
        data = await chatwootGet(`/contacts?page=${currentPage}`);
      }

      if (currentPage === startPage && data.meta?.count) {
        totalInBase = data.meta.count;
      }

      const contacts = data.payload || [];
      if (contacts.length === 0) {
        hasMore = false;
        break;
      }

      accumulated.push(...contacts);

      if (contacts.length < 15) {
        hasMore = false;
      }
      currentPage++;
    }

    const mappedContacts = accumulated.map(c => ({
      id: c.id,
      name: c.name || '',
      phone_number: c.phone_number || '',
      first_name: (c.name || '').split(' ')[0] || 'cliente'
    }));

    res.json({
      contacts: mappedContacts,
      hasMore,
      nextPage: currentPage,
      totalInBase: totalInBase
    });
  } catch (e) {
    console.error('Erro na rota contacts:', e);
    res.status(500).json({ error: e.message });
  }
});

// Upload de mídia (preserva extensão original)
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});
const uploadWithName = multer({ storage, limits: { fileSize: 40 * 1024 * 1024 } });

app.post('/api/upload', uploadWithName.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo' });
  console.log(`Upload recebido: ${req.file.originalname} (${req.file.mimetype})`);
  res.json({
    id: req.file.filename,
    originalName: req.file.originalname,
    path: req.file.path,
    mimetype: req.file.mimetype,
    size: req.file.size
  });
});

// Iniciar disparo
app.post('/api/dispatch', (req, res) => {
  const { title, contacts, message, mediaId, dailyLimit, pauseBatch, pauseDuration, useAI, aiProvider } = req.body;
  const id = Date.now().toString(36);

  dispatches[id] = {
    id,
    title: title || 'Campanha Sem Título',
    status: 'running',
    contacts,
    message,
    mediaId,
    dailyLimit: Number(dailyLimit) || 100,
    pauseBatch: Number(pauseBatch) || 0,
    pauseDuration: Number(pauseDuration) || 300,
    useAI: useAI !== false,
    aiProvider: aiProvider || 'gemini',
    sent: 0,
    sentToday: 0,
    errors: 0,
    total: contacts.length,
    log: [],
    startedAt: new Date().toISOString(),
    paused: false,
    cancelled: false
  };

  // Roda o disparo em background
  runDispatch(id);
  res.json({ dispatchId: id });
});

// SSE - progresso em tempo real
app.get('/api/dispatch/:id/progress', (req, res) => {
  const id = req.params.id;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const interval = setInterval(() => {
    const d = dispatches[id];
    if (!d) { clearInterval(interval); res.end(); return; }

    res.write(`data: ${JSON.stringify({
      status: d.status,
      sent: d.sent,
      errors: d.errors,
      total: d.total,
      log: d.log.slice(-20),
      paused: d.paused,
      serverTime: new Date().toLocaleTimeString('pt-BR'),
      nextMessageAt: d.nextMessageAt || null
    })}\n\n`);

    if (d.status === 'done' || d.status === 'cancelled') {
      clearInterval(interval);
      setTimeout(() => res.end(), 1000);
    }
  }, 1000);

  req.on('close', () => clearInterval(interval));
});

// Pausar
app.post('/api/dispatch/:id/pause', (req, res) => {
  const d = dispatches[req.params.id];
  if (d) { d.paused = !d.paused; }
  res.json({ paused: d?.paused });
});

// Cancelar
app.post('/api/dispatch/:id/cancel', (req, res) => {
  const d = dispatches[req.params.id];
  if (d) { d.cancelled = true; d.status = 'cancelled'; }
  res.json({ ok: true });
});

// Download PDF Report
app.get('/api/dispatch/:id/report', (req, res) => {
  const d = dispatches[req.params.id];
  if (!d) return res.status(404).send('Not found');

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-disposition', `attachment; filename=relatorio-${d.id}.pdf`);
  res.setHeader('Content-type', 'application/pdf');
  doc.pipe(res);

  doc.fontSize(20).text('Relatório de Disparo em Massa', { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(14).text(`Título da Campanha: ${d.title}`);
  doc.fontSize(12).text(`Início: ${new Date(d.startedAt).toLocaleString('pt-BR')}`);
  if (d.finishedAt) {
    doc.text(`Término: ${new Date(d.finishedAt).toLocaleString('pt-BR')}`);
  }
  doc.moveDown();

  doc.fontSize(14).text('Estatísticas:', { underline: true });
  doc.fontSize(12).text(`Total na Lista: ${d.total}`);
  doc.text(`Enviados com Sucesso: ${d.sent}`);
  doc.text(`Falhas: ${d.errors}`);
  doc.moveDown();

  doc.fontSize(14).text('Resumo do Log:', { underline: true });
  const recentLogs = d.log.slice(0, 50); // Mostrar primeiros 50 logs no pdf pra não ficar gigante
  recentLogs.forEach(l => {
    let status = l.status === 'ok' ? 'SUCESSO' : (l.status === 'error' ? 'ERRO' : l.status);
    doc.fontSize(10).text(`[${l.time}] ${l.contact} (${l.phone}) - ${status}`);
  });

  doc.end();
});

// --- DISPATCH ENGINE ---
async function runDispatch(id) {
  const d = dispatches[id];
  const inboxId = Number(INBOX_ID) || 3;
  let lastDay = new Date().getDate();

  for (let i = 0; i < d.contacts.length; i++) {
    // Checar mudança de dia para resetar o contador
    const currentDay = new Date().getDate();
    if (currentDay !== lastDay) {
      d.sentToday = 0;
      lastDay = currentDay;
    }

    if (d.cancelled) break;

    // 1. Checar Horário Comercial (7h às 22h)
    while (!isWorkingHours() && !d.cancelled) {
      const waitSecs = getSecondsUntilNext7AM();
      d.nextMessageAt = Date.now() + (waitSecs * 1000);
      d.log.push({ time: new Date().toLocaleTimeString('pt-BR'), contact: 'SISTEMA', phone: '-', status: 'wait', message: `Fora do horario de funcionamento. Retomaremos os disparos às 07:00...` });
      d.paused = true;
      
      let waited = 0;
      while (waited < waitSecs && !d.cancelled) {
        await sleep(1000);
        waited++;
      }
      d.paused = false;
      d.nextMessageAt = null;
    }

    if (d.cancelled) break;

    // 2. Checar Limite Diário
    while (d.sentToday >= d.dailyLimit && !d.cancelled) {
      const waitSecs = getSecondsUntilNext7AM();
      d.nextMessageAt = Date.now() + (waitSecs * 1000);
      d.log.push({ time: new Date().toLocaleTimeString('pt-BR'), contact: 'SISTEMA', phone: '-', status: 'wait', message: `Limite diário (${d.dailyLimit}) atingido. Pausado até amanhã às 07:00.` });
      d.paused = true;
      
      let waited = 0;
      while (waited < waitSecs && !d.cancelled) {
        await sleep(1000);
        waited++;
      }
      d.paused = false;
      d.nextMessageAt = null;
      d.sentToday = 0; // Reset no dia seguinte
      lastDay = new Date().getDate();
    }

    if (d.cancelled) break;

    // 3. Pausa em lote (Opcional manual)
    if (i > 0 && d.pauseBatch > 0 && i % d.pauseBatch === 0) {
      const mins = Math.round(d.pauseDuration / 60);
      d.log.push({ time: new Date().toLocaleTimeString('pt-BR'), contact: 'SISTEMA', phone: '-', status: 'wait', message: `Pausa de segurança de ${mins} min...` });
      d.paused = true;
      let waited = 0;
      while (waited < d.pauseDuration && !d.cancelled) {
         await sleep(1000);
         waited++;
      }
      d.paused = false;
    }

    if (d.cancelled) break;

    // Checar pausa manual
    while (d.paused && !d.cancelled) {
      await sleep(1000);
    }
    if (d.cancelled) break;

    const contact = d.contacts[i];
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const hoje = new Date().toISOString().split('T')[0];

    try {
      // Preparar mensagem
      let finalMessage = d.message.replace(/\{NOME\}/g, contact.first_name);

      // IA
      if (d.useAI) {
        d.log.push({ time: timestamp, contact: contact.name, phone: contact.phone_number, status: 'ia', message: `Gerando texto com IA (${d.aiProvider})...` });
        finalMessage = await rewriteWithAI(finalMessage, d.aiProvider);
      }

      // Enviar
      const convResult = await chatwootPost('/conversations', {
        contact_id: contact.id,
        inbox_id: inboxId,
        message: { content: finalMessage, message_type: 'outgoing' }
      });

      // Mídia
      if (d.mediaId) {
        const mediaPath = path.join(uploadsDir, d.mediaId);
        if (fs.existsSync(mediaPath)) {
          const convId = convResult.id;
          const form = new FormData();
          form.append('content', '');
          form.append('message_type', 'outgoing');
          form.append('attachments[]', fs.createReadStream(mediaPath));
          try {
            await chatwootPostMultipart(`/conversations/${convId}/messages`, form);
          } catch (mediaErr) {}
        }
      }

      await chatwootPut(`/contacts/${contact.id}`, {
        custom_attributes: { [`ultimo_disparo`]: hoje }
      });

      d.sent++;
      d.sentToday++;
      d.log.push({ time: timestamp, contact: contact.name, phone: contact.phone_number, status: 'ok', message: finalMessage.substring(0, 60) + '...' });

    } catch (e) {
      d.errors++;
      d.log.push({ time: timestamp, contact: contact.name, phone: contact.phone_number, status: 'error', message: e.message });
    }

    // Delay Dinâmico (Anti-ban)
    if (i < d.contacts.length - 1 && !d.cancelled) {
      const delay = calculateDelay(d.dailyLimit, d.sentToday);
      d.nextMessageAt = Date.now() + (delay * 1000);
      const mins = Math.round(delay / 60);
      d.log.push({ time: timestamp, contact: '-', phone: '-', status: 'wait', message: `Aguardando ${mins} min (Caos dinâmico)...` });
      
      let waited = 0;
      while (waited < delay && !d.cancelled) {
         await sleep(1000);
         waited++;
      }
      d.nextMessageAt = null;
    }
  }

  if (!d.cancelled) d.status = 'done';
  d.finishedAt = new Date().toISOString();
}

// --- START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Luma Corpore Disparador em Massa rodando em http://localhost:${PORT}\n`);
});
