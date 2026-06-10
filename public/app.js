// === STATE ===
let selectedContacts = [];
let allLoadedContacts = [];
let currentStep = 1;
let dispatchId = null;
let eventSource = null;
let uploadedMediaId = null;

// === AUTH ===
let authToken = localStorage.getItem('luma_auth_token');

// Limpa tokens antigos inválidos
if (authToken === 'luma' || authToken === 'undefined') {
  localStorage.removeItem('luma_auth_token');
  authToken = null;
}

async function authorizedFetch(url, options = {}) {
  if (!options.headers) options.headers = {};
  if (authToken) {
    options.headers['Authorization'] = authToken;
  }
  
  const resp = await fetch(url, options);
  if (resp.status === 401 && url !== '/api/login') {
    showLogin();
  }
  return resp;
}

function showLogin() {
  document.getElementById('login-overlay').style.display = 'flex';
}

function hideLogin() {
  document.getElementById('login-overlay').style.display = 'none';
}

// === VERSION ===
async function loadVersion() {
  try {
    const resp = await authorizedFetch('/api/version');
    const data = await resp.json();
    const el = document.getElementById('app-version');
    if (el) el.textContent = 'v' + data.version;
  } catch (e) {}
}

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
  // Carrega versão imediatamente (rota pública)
  loadVersion();
  
  // Tenta login automático (detecta se servidor exige senha)
  try {
    const resp = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '' })
    });
    if (resp.ok) {
      const data = await resp.json();
      authToken = data.token;
      localStorage.setItem('luma_auth_token', authToken);
      hideLogin();
      loadTags();
      loadVersion();
      restoreActiveDispatch();
      return;
    }
  } catch (e) {}
  
  // Servidor exige senha
  if (authToken) {
    // Testa se o token salvo ainda é válido
    try {
      const test = await fetch('/api/tags', { headers: { 'Authorization': authToken } });
      if (test.ok) {
        hideLogin();
        loadTags();
        loadVersion();
        restoreActiveDispatch();
        return;
      }
    } catch (e) {}
  }
  
  // Token inválido ou inexistente → mostra login
  localStorage.removeItem('luma_auth_token');
  authToken = null;
  showLogin();
  
  // Login Handler
  document.getElementById('btn-login').addEventListener('click', async () => {
    const password = document.getElementById('app-password').value;
    const btn = document.getElementById('btn-login');
    const error = document.getElementById('login-error');
    
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    error.style.display = 'none';
    
    try {
      const resp = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      if (resp.ok) {
        const data = await resp.json();
        authToken = data.token;
        localStorage.setItem('luma_auth_token', authToken);
        hideLogin();
        loadTags();
        loadVersion();
        restoreActiveDispatch();
      } else {
        error.style.display = 'block';
      }
    } catch (e) {
      alert('Erro de conexão com o servidor');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Acessar Painel';
    }
  });
});

// === NAVIGATION ===
let historyRefreshInterval = null;

function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.header-tab').forEach(t => t.classList.remove('active'));
  
  document.getElementById(`tab-${tabId}`).classList.add('active');
  const btn = document.querySelector(`.header-tab[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');
  
  // Limpa auto-refresh anterior
  if (historyRefreshInterval) {
    clearInterval(historyRefreshInterval);
    historyRefreshInterval = null;
  }
  
  if (tabId === 'history') {
    loadHistory();
    // Auto-refresh a cada 10 segundos enquanto na aba relatórios
    historyRefreshInterval = setInterval(loadHistory, 10000);
  }
}

async function loadHistory() {
  const body = document.getElementById('history-body');
  body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px"><div class="loading-spinner" style="margin:0 auto"></div></td></tr>';
  
  try {
    const resp = await authorizedFetch('/api/history');
    const history = await resp.json();
    
    if (history.length === 0) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Nenhum histórico encontrado</td></tr>';
      return;
    }
    
    body.innerHTML = history.map(h => `
      <tr>
        <td>${new Date(h.startedAt).toLocaleString('pt-BR')}</td>
        <td>${h.title || 'Campanha'}</td>
        <td><span class="status-badge status-${h.status}">${h.status}</span></td>
        <td style="color:var(--success)">${h.sent}</td>
        <td style="color:var(--danger)">${h.errors}</td>
        <td>
          <div style="display:flex; gap: 4px;">
            ${h.pdfReport ? `<a href="/api/reports/${h.pdfReport}${authToken ? '?token=' + authToken : ''}" class="btn btn-outline" style="padding:4px 8px;font-size:11px" target="_blank">📥 PDF</a>` : ''}
            ${(h.status && h.status.toLowerCase() === 'running') ? `<button onclick="cancelHistoryDispatch('${h.id}')" class="btn btn-outline" style="padding:4px 8px;font-size:11px;color:var(--danger);border-color:var(--danger)">✕ Parar</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--danger)">Erro ao carregar histórico</td></tr>';
  }
}

async function cancelHistoryDispatch(id) {
  if (!confirm('Deseja realmente forçar a parada deste disparo zumbi?')) return;
  
  try {
    const resp = await authorizedFetch(`/api/history/${id}/cancel`, { method: 'POST' });
    if (resp.ok) {
      loadHistory(); // Recarrega a tabela
    }
  } catch (e) {
    alert('Erro ao cancelar: ' + e.message);
  }
}

// === TAGS ===
async function loadTags() {
  const container = document.getElementById('tags-list');
  try {
    const resp = await authorizedFetch('/api/tags');
    const tags = await resp.json();
    const visibleTags = tags.filter(t => t.title !== 'optout');
    container.innerHTML = visibleTags.map(t => `
      <button class="tag-chip" onclick="selectTag('${t.title}', this)" style="border-left: 3px solid ${t.color || '#10b981'}">
        ${t.title}
      </button>
    `).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty-state">Erro ao carregar tags</p>';
  }
}

async function selectTag(tag, el) {
  // Visual
  document.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('btn-all-contacts').classList.remove('active');

  await loadContactsByTag(tag);
}

async function loadAllContacts() {
  document.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
  const btn = document.getElementById('btn-all-contacts');
  btn.classList.add('active');

  await loadContactsByTag(null);
}

function clearContactsList() {
  if (loadContactsAbortController) {
    loadContactsAbortController.abort();
  }
  document.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('btn-all-contacts').classList.remove('active');
  
  allLoadedContacts = [];
  selectedContacts = [];
  
  const table = document.getElementById('contacts-table');
  table.innerHTML = '<p class="empty-state">Selecione uma tag para carregar contatos</p>';
  document.getElementById('contact-count').textContent = '0';
  document.getElementById('btn-next-1').disabled = true;
  document.getElementById('search-input').value = '';
}

let loadContactsAbortController = null;

async function loadContactsByTag(tag) {
  if (loadContactsAbortController) {
    loadContactsAbortController.abort();
  }
  loadContactsAbortController = new AbortController();
  const signal = loadContactsAbortController.signal;

  const table = document.getElementById('contacts-table');
  table.innerHTML = '<div style="padding:40px;text-align:center"><div class="loading-spinner" style="margin:0 auto"></div><p id="loading-text" style="margin-top:12px;color:var(--text-muted)">Carregando contatos...</p></div>';

  allLoadedContacts = [];
  selectedContacts = [];
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const dateFilter = document.getElementById('filter-date')?.value || null;

      const resp = await authorizedFetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, startPage: page, dateFilter }),
        signal
      });
      
      if (!resp.ok) throw new Error('Erro na API');
      const data = await resp.json();
      
      allLoadedContacts.push(...data.contacts);
      
      // Ordenação global: "Nunca" primeiro, depois por data mais antiga
      allLoadedContacts.sort((a, b) => {
        const aIsNunca = !a.last_dispatch || a.last_dispatch === 'Nunca';
        const bIsNunca = !b.last_dispatch || b.last_dispatch === 'Nunca';
        if (aIsNunca && !bIsNunca) return -1;
        if (!aIsNunca && bIsNunca) return 1;
        if (aIsNunca && bIsNunca) return 0;
        return a.last_dispatch.localeCompare(b.last_dispatch);
      });
      
      selectedContacts = [...allLoadedContacts];
      hasMore = data.hasMore;
      page = data.nextPage; // Pula para a próxima página do chunk

      const loadingText = document.getElementById('loading-text');
      if (loadingText) {
         const total = data.totalInBase || '...';
         loadingText.textContent = `Carregando... ${allLoadedContacts.length} de ${total}`;
      }

      // Update table incrementally
      renderContacts(selectedContacts);
      document.getElementById('btn-next-1').disabled = selectedContacts.length === 0;
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      table.innerHTML = '<p class="empty-state">Erro ao carregar contatos</p>';
      console.error(e);
    }
  }
}

function renderContacts(contacts) {
  const container = document.getElementById('contacts-table');
  document.getElementById('contact-count').textContent = contacts.length;

  if (contacts.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhum contato encontrado</p>';
    return;
  }

  const rows = contacts.slice(0, 500).map(c => {
    const dateStr = c.last_dispatch && c.last_dispatch !== 'Nunca'
      ? c.last_dispatch
      : '<span style="color:var(--text-muted);font-style:italic">Nunca</span>';
    return `<tr>
      <td class="col-name">${c.name || 'Sem nome'}</td>
      <td class="col-phone">${c.phone_number}</td>
      <td class="col-date">${dateStr}</td>
      <td class="col-action"><button class="btn-remove" onclick="removeContact(${c.id})" title="Remover">✕</button></td>
    </tr>`;
  }).join('');

  let extra = '';
  if (contacts.length > 500) {
    extra = `<tr><td colspan="4" class="empty-state" style="padding:12px">... e mais ${contacts.length - 500} contatos</td></tr>`;
  }

  container.innerHTML = `<table class="contacts-grid">
    <thead><tr>
      <th>Contato</th>
      <th>Telefone</th>
      <th>Último Envio</th>
      <th></th>
    </tr></thead>
    <tbody>${rows}${extra}</tbody>
  </table>`;
}

function removeContact(id) {
  selectedContacts = selectedContacts.filter(c => c.id != id);
  allLoadedContacts = allLoadedContacts.filter(c => c.id != id);
  renderContacts(selectedContacts);
  document.getElementById('btn-next-1').disabled = selectedContacts.length === 0;
}

function filterContacts() {
  const query = document.getElementById('search-input').value.toLowerCase();
  if (!query) {
    selectedContacts = [...allLoadedContacts];
  } else {
    selectedContacts = allLoadedContacts.filter(c =>
      (c.name || '').toLowerCase().includes(query) ||
      (c.phone_number || '').includes(query)
    );
  }
  // Manter ordenação: "Nunca" primeiro, depois por data mais antiga
  selectedContacts.sort((a, b) => {
    const aIsNunca = !a.last_dispatch || a.last_dispatch === 'Nunca';
    const bIsNunca = !b.last_dispatch || b.last_dispatch === 'Nunca';
    if (aIsNunca && !bIsNunca) return -1;
    if (!aIsNunca && bIsNunca) return 1;
    if (aIsNunca && bIsNunca) return 0;
    return a.last_dispatch.localeCompare(b.last_dispatch);
  });
  renderContacts(selectedContacts);
}

// === NAVIGATION ===
function goToStep(step) {
  if (step === 2 && selectedContacts.length === 0) return;
  currentStep = step;

  document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
  document.getElementById(`step${step}`).classList.add('active');

  document.querySelectorAll('.step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (s === step) el.classList.add('active');
    else if (s < step) el.classList.add('done');
  });

  if (step === 2) updatePreview();
}

// === PREVIEW ===
function updatePreview() {
  const msg = document.getElementById('message-input').value;
  const preview = msg.replace(/\{NOME\}/g, 'Rafael');
  document.getElementById('preview-bubble').textContent = preview;
}

document.getElementById('message-input')?.addEventListener('input', updatePreview);

// === UPLOAD ===
async function handleUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const preview = document.getElementById('upload-preview');
  preview.innerHTML = '⏳ Enviando...';

  const formData = new FormData();
  formData.append('media', file);

  try {
    const resp = await authorizedFetch('/api/upload', { method: 'POST', body: formData });
    const data = await resp.json();
    uploadedMediaId = data.id;
    preview.innerHTML = `✅ ${data.originalName} (${(data.size / 1024 / 1024).toFixed(1)}MB)`;
  } catch (e) {
    preview.innerHTML = '❌ Erro no upload';
  }
}

// === DISPATCH ===
async function startDispatch() {
  const title = document.getElementById('campaign-title').value.trim();
  if (!title) { alert('Digite um título para a campanha!'); return; }
  const message = document.getElementById('message-input').value;
  if (!message.trim()) { alert('Digite uma mensagem!'); return; }

  const dailyLimit = parseInt(document.getElementById('daily-limit').value) || 100;
  const pauseBatch = parseInt(document.getElementById('pause-batch').value) || 0;
  const pauseDuration = parseInt(document.getElementById('pause-duration').value) || 300;
  const useAI = document.getElementById('use-ai').checked;
  const aiProvider = document.getElementById('ai-provider').value;

  goToStep(3);

  // Reset stats
  document.getElementById('stat-sent').textContent = '0';
  document.getElementById('stat-pending').textContent = selectedContacts.length;
  document.getElementById('stat-errors').textContent = '0';
  document.getElementById('progress-percent').textContent = '0%';
  document.getElementById('progress-count').textContent = `0 / ${selectedContacts.length}`;
  document.getElementById('dispatch-log').innerHTML = '';
  document.getElementById('btn-pause').style.display = '';
  document.getElementById('btn-cancel').style.display = '';
  document.getElementById('btn-new').style.display = 'none';

  try {
    const resp = await authorizedFetch('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        contacts: selectedContacts,
        message,
        mediaId: uploadedMediaId,
        dailyLimit,
        pauseBatch,
        pauseDuration,
        useAI,
        aiProvider
      })
    });
    const data = await resp.json();
    dispatchId = data.dispatchId;
    localStorage.setItem('luma_active_dispatch_id', dispatchId);
    startProgressStream();
  } catch (e) {
    alert('Erro ao iniciar disparo: ' + e.message);
  }
}

function startProgressStream() {
  if (eventSource) eventSource.close();

  const qs = authToken ? `?token=${authToken}` : '';
  eventSource = new EventSource(`/api/dispatch/${dispatchId}/progress${qs}`);
  eventSource.onmessage = (event) => {
    const d = JSON.parse(event.data);
    updateProgress(d);
  };
  eventSource.onerror = () => {
    eventSource.close();
  };
}

function updateProgress(d) {
  const total = d.total;
  const processed = d.sent + d.errors;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
  const pending = total - processed;

  // Stats
  document.getElementById('stat-sent').textContent = d.sent;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-errors').textContent = d.errors;

  // Ring
  document.getElementById('progress-percent').textContent = `${percent}%`;
  document.getElementById('progress-count').textContent = `${processed} / ${total}`;
  const circle = document.getElementById('progress-circle');
  const circumference = 2 * Math.PI * 52;
  circle.style.strokeDashoffset = circumference - (percent / 100) * circumference;

  // Log
  const logContainer = document.getElementById('dispatch-log');
  logContainer.innerHTML = (d.log || []).map(entry => {
    let icon = '';
    if (entry.status === 'ok') icon = '✅';
    else if (entry.status === 'error') icon = '❌';
    else if (entry.status === 'wait') icon = '⏳';
    else if (entry.status === 'ia') icon = '🤖';

    return `<div class="log-entry">
      <span class="log-time">${entry.time}</span>
      <span class="log-status">${icon}</span>
      <span class="log-name">${entry.contact}</span>
      <span class="log-message">${entry.message}</span>
    </div>`;
  }).join('');
  logContainer.scrollTop = logContainer.scrollHeight;

  // Pause button text
  document.getElementById('btn-pause').textContent = d.paused ? '▶️ Retomar' : '⏸️ Pausar';

  // Server Time & Timer
  document.getElementById('server-time').textContent = d.serverTime || '--:--:--';
  if (d.nextMessageAt) {
    document.getElementById('countdown-container').style.display = 'block';
    if (window._countdownInterval) clearInterval(window._countdownInterval);
    
    const updateTimer = () => {
      const msLeft = d.nextMessageAt - Date.now();
      if (msLeft <= 0) {
        document.getElementById('countdown-timer').textContent = '00:00';
        clearInterval(window._countdownInterval);
        return;
      }
      const totalSecs = Math.floor(msLeft / 1000);
      const hours = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;
      
      let timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      if (hours > 0) timeStr = `${String(hours).padStart(2, '0')}:${timeStr}`;
      
      document.getElementById('countdown-timer').textContent = timeStr;
    };
    
    updateTimer();
    window._countdownInterval = setInterval(updateTimer, 1000);
  } else {
    document.getElementById('countdown-container').style.display = 'none';
    if (window._countdownInterval) clearInterval(window._countdownInterval);
  }

  // Done
  if (d.status === 'done' || d.status === 'cancelled') {
    localStorage.removeItem('luma_active_dispatch_id');
    if (eventSource) eventSource.close();
    if (window._countdownInterval) clearInterval(window._countdownInterval);
    document.getElementById('countdown-container').style.display = 'none';
    document.getElementById('btn-pause').style.display = 'none';
    document.getElementById('btn-cancel').style.display = 'none';
    document.getElementById('btn-new').style.display = '';

    if (d.status === 'done') {
      document.getElementById('progress-percent').textContent = '✅';
      document.getElementById('progress-percent').style.fontSize = '36px';
      document.getElementById('report-container').style.display = 'block';
      document.getElementById('btn-download-report').href = `/api/dispatch/${dispatchId}/report${authToken ? '?token=' + authToken : ''}`;
    }
  }
}

async function restoreActiveDispatch() {
  const activeId = localStorage.getItem('luma_active_dispatch_id');
  if (!activeId) return;

  try {
    const resp = await authorizedFetch(`/api/dispatch/${activeId}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.status === 'running' || data.status === 'paused') {
        dispatchId = activeId;
        goToStep(3);
        startProgressStream();
      } else {
        localStorage.removeItem('luma_active_dispatch_id');
      }
    } else {
      localStorage.removeItem('luma_active_dispatch_id');
    }
  } catch (e) {
    console.error('Erro ao restaurar disparo:', e);
  }
}

async function togglePause() {
  if (!dispatchId) return;
  await authorizedFetch(`/api/dispatch/${dispatchId}/pause`, { method: 'POST' });
}

async function cancelDispatch() {
  if (!dispatchId) return;
  if (!confirm('Tem certeza que deseja cancelar?')) return;
  await authorizedFetch(`/api/dispatch/${dispatchId}/cancel`, { method: 'POST' });
}

function resetAll() {
  currentStep = 1;
  selectedContacts = [];
  allLoadedContacts = [];
  dispatchId = null;
  uploadedMediaId = null;
  document.getElementById('progress-percent').style.fontSize = '';
  goToStep(1);
  loadTags();
}
