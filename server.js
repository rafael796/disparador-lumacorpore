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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Upload config
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const upload = multer({ dest: uploadsDir, limits: { fileSize: 40 * 1024 * 1024 } });

// State
const dispatches = {};
const { CHATWOOT_TOKEN, CHATWOOT_URL, INBOX_ID } = process.env;
const historyFile = path.join(uploadsDir, 'history.json');

// --- HISTORY HELPERS ---
function loadHistory() {
  if (fs.existsSync(historyFile)) {
    try {
      return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveHistory(history) {
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

function updateHistory(dispatchId, data) {
  const history = loadHistory();
  const index = history.findIndex(h => h.id === dispatchId);
  if (index !== -1) {
    history[index] = { ...history[index], ...data };
    saveHistory(history);
  }
}

function addToHistory(entry) {
  const history = loadHistory();
  history.unshift(entry); // Mais novos primeiro
  saveHistory(history.slice(0, 100)); // Limite de 100 registros
}

// Autenticação (desativa se APP_PASSWORD não estiver definida)
const AUTH_ENABLED = !!process.env.APP_PASSWORD;
const APP_PASSWORD = process.env.APP_PASSWORD || '';

if (AUTH_ENABLED) {
  console.log('🔒 Autenticação ATIVADA (APP_PASSWORD definida)');
} else {
  console.log('🔓 Autenticação DESATIVADA (sem APP_PASSWORD no .env)');
}

// Middleware de Autenticação para API
const authMiddleware = (req, res, next) => {
  if (!AUTH_ENABLED) return next();
  if (!req.path.startsWith('/api') || req.path === '/api/login') return next();
  
  // SSE usa query params pq EventSource não suporta custom headers
  const token = req.headers['authorization'] || req.query.token;
  if (token === APP_PASSWORD) return next();
  
  res.status(401).json({ error: 'Não autorizado' });
};

app.use(authMiddleware);

// Rota de Login
app.post('/api/login', (req, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ success: true, token: 'dev-mode' });
  }
  const { password } = req.body;
  if (password === APP_PASSWORD) {
    res.json({ success: true, token: APP_PASSWORD });
  } else {
    res.status(401).json({ error: 'Senha incorreta' });
  }
});

// --- ROUTES ---
app.get('/api/history', (req, res) => {
  res.json(loadHistory());
});

app.get('/api/reports/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('Relatório não encontrado');
  }
});

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
7. Não altere nomes próprios (Wanessa, Luma Corpore)
8. CRÍTICO: MANTENHA INTACTA QUALQUER formatação do WhatsApp! Não remova os asteriscos de negrito (*texto*), os sublinhados de itálico (_texto_) nem os tis de riscado (~texto~). Se houver uma palavra formatada como *exemplo*, ela DEVE continuar como *exemplo* ou o sinônimo escolhido DEVE estar entre os mesmos asteriscos.` },
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
7. Não altere nomes próprios (Wanessa, Luma Corpore)
8. CRÍTICO: MANTENHA INTACTA QUALQUER formatação do WhatsApp! Não remova os asteriscos de negrito (*texto*), os sublinhados de itálico (_texto_) nem os tis de riscado (~texto~). Se houver uma palavra formatada como *exemplo*, ela DEVE continuar como *exemplo* ou o sinônimo escolhido DEVE estar entre os mesmos asteriscos.` }]
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
function formatBR(date, options = {}) {
  const defaultOptions = {
    timeZone: 'America/Sao_Paulo',
    hour12: false
  };
  return new Date(date).toLocaleString('pt-BR', { ...defaultOptions, ...options });
}

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
  
  // TRAVA FIXA: Entre 17 minutos (1020s) e 25 minutos (1500s)
  // Ignoramos o baseDelay para garantir que nunca ultrapasse o pedido do usuário
  const safetyMin = 1020; 
  const randomExtra = Math.floor(Math.random() * 480); // + 8 minutos de variação

  return safetyMin + randomExtra;
}

// --- HELPERS (PDF) ---
function generatePDFReport(d) {
  return new Promise((resolve) => {
    const fileName = `report_${d.id}.pdf`;
    const filePath = path.join(uploadsDir, fileName);
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    
    doc.pipe(stream);
    doc.fontSize(20).text('Relatório de Disparo - Luma Corpore', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`ID da Campanha: ${d.id}`);
    doc.text(`Título: ${d.title || 'S/T'}`);
    doc.text(`Data: ${new Date(d.startedAt).toLocaleString('pt-BR')}`);
    doc.text(`Total de Contatos: ${d.total}`);
    doc.text(`Enviados com Sucesso: ${d.sent}`);
    doc.text(`Erros: ${d.errors}`);
    doc.text(`Status Final: ${d.status}`);
    doc.moveDown();
    doc.text('--- Log Detalhado ---');
    doc.moveDown();
    
    d.log.forEach(l => {
      doc.fontSize(8).text(`[${l.time}] ${l.contact} (${l.phone}) - ${l.status.toUpperCase()}: ${l.message}`);
    });
    
    doc.end();
    stream.on('finish', () => resolve(fileName));
  });
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

// Obter status de um disparo específico (para recuperação após F5)
app.get('/api/dispatch/:id', (req, res) => {
  const d = dispatches[req.params.id];
  if (!d) return res.status(404).json({ error: 'Disparo não encontrado' });
  res.json({
    id: d.id,
    title: d.title,
    status: d.status,
    sent: d.sent,
    errors: d.errors,
    total: d.total,
    paused: d.paused,
    cancelled: d.cancelled
  });
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
      first_name: (c.name || '').split(' ')[0] || 'cliente',
      last_dispatch: c.custom_attributes?.ultimo_disparo || 'Nunca'
    }));

    // Ordenação inteligente: 
    // 1. Quem "Nunca" recebeu (prioridade máxima)
    // 2. Por data (mais antigos primeiro)
    mappedContacts.sort((a, b) => {
      if (a.last_dispatch === 'Nunca' && b.last_dispatch !== 'Nunca') return -1;
      if (a.last_dispatch !== 'Nunca' && b.last_dispatch === 'Nunca') return 1;
      if (a.last_dispatch === 'Nunca' && b.last_dispatch === 'Nunca') return 0;
      
      // Comparar datas (formato ISO YYYY-MM-DD)
      return a.last_dispatch.localeCompare(b.last_dispatch);
    });

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
  const d = dispatches[id];

  // Roda o disparo em background
  addToHistory({
    id,
    title: d.title,
    startedAt: d.startedAt,
    total: d.total,
    status: 'running',
    sent: 0,
    errors: 0
  });

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
      serverTime: getBrazilDate().toLocaleTimeString('pt-BR'),
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
  doc.fontSize(12).text(`Início: ${formatBR(d.startedAt)}`);
  if (d.finishedAt) {
    doc.text(`Término: ${formatBR(d.finishedAt)}`);
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
  try {
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
    const timestamp = formatBR(new Date(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const hoje = formatBR(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');

    try {
      // Extrair primeiro nome real (ignorar se for número de telefone)
      let firstName = contact.name || '';
      if (firstName.includes(' ')) firstName = firstName.split(' ')[0];
      if (firstName === contact.phone_number || firstName.startsWith('+') || /^[0-9]+$/.test(firstName)) {
        firstName = '';
      }

      // Preparar mensagem
      let finalMessage = d.message;
      if (firstName) {
        finalMessage = finalMessage.replace(/\{NOME\}/g, firstName);
      } else {
        // Se não tem nome, remove a tag e limpa espaços ou vírgulas órfãs
        finalMessage = finalMessage.replace(/\s*\{NOME\}\s*,?\s*/g, ' ').trim();
      }

      // IA
      if (d.useAI) {
        d.log.push({ time: timestamp, contact: contact.name, phone: contact.phone_number, status: 'ia', message: `Gerando texto com IA (${d.aiProvider})...` });
        finalMessage = await rewriteWithAI(finalMessage, d.aiProvider);
      }

      // 1. Simular "Leitura" (Update Last Seen)
      try {
        // Precisamos do ID da conversa. Se não existir, o Chatwoot cria no POST do message, 
        // mas aqui tentamos buscar uma existente para marcar como lida primeiro.
        const searchConv = await chatwootGet(`/contacts/${contact.id}/conversations`);
        if (searchConv && searchConv.payload && searchConv.payload.length > 0) {
          const convId = searchConv.payload[0].id;
          await chatwootPost(`/conversations/${convId}/update_last_seen`, {});
        }
      } catch (e) {}

      // 2. Simular "Digitação" (Baseado no tamanho do texto)
      // Média humana: 200 caracteres por minuto (~3.3 chars/seg)
      const typingSpeed = 3.3; 
      let typingSeconds = Math.floor(finalMessage.length / typingSpeed);
      // Limites de segurança para não ficar artificial (entre 3 e 15 segundos)
      typingSeconds = Math.min(Math.max(typingSeconds, 3), 15);
      
      d.log.push({ time: timestamp, contact: contact.name, phone: contact.phone_number, status: 'typing', message: `Simulando digitação (${typingSeconds}s)...` });
      await sleep(typingSeconds * 1000);

      // 3. Enviar a mensagem real
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
    
    // Gerar PDF e salvar histórico
    const pdfName = await generatePDFReport(d);
    updateHistory(id, { 
      status: d.status, 
      sent: d.sent, 
      errors: d.errors, 
      finishedAt: d.finishedAt,
      pdfReport: pdfName 
    });
  } catch (err) {
    console.error('Erro fatal no ciclo de disparos:', err);
    updateHistory(id, { status: 'fatal_error', errorMsg: err.message });
  }
}

// --- START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Luma Corpore Disparador em Massa rodando em http://localhost:${PORT}\n`);
});
