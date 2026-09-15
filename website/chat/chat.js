'use strict';
/* Envelop web chat: whoever is online, plus Tomato.
 * Anonymous identity (name only), durable DMs, Tomato pinned + verified.
 * Needs SOME bridge online (a Mac holding the lease) for Tomato's screen. */

const SUPABASE_URL = 'https://sevnusobochafwuvmuvu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nhog8psQAljHGK3RvIyp-Q_26yCYmsF';
const DEVICE_ID = '00000000-0000-0000-0000-000000000001';
const STORE_KEY = 'envelop.web.session.v1';
const POLL_MS = 3000;
const BEAT_MS = 15000;
const FRESH_MS = 45000;

const state = {
  creds: null,
  expiresAt: 0,
  profile: null,
  people: [],
  peer: null,
  conversation: null,
  messages: [],
  tomatoOnline: false,
  isAdmin: false,
  presenceMode: null,
  lastBeat: 0,
  pollTimer: 0,
  searchTimer: 0,
  busy: false,
};

const $ = (id) => document.getElementById(id);

function showError(text) {
  const bar = $('chat-error');
  if (!text) { bar.hidden = true; bar.textContent = ''; return; }
  bar.hidden = false;
  bar.textContent = text;
}

function apiError(data) {
  if (data && typeof data === 'object') return data.message || data.msg || data.error_description || null;
  return null;
}

async function request(path, opts) {
  opts = opts || {};
  if (opts.auth !== false && Date.now() > state.expiresAt - 60000) await refresh();
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (opts.auth !== false && state.creds) headers.Authorization = 'Bearer ' + state.creds.access_token;
  const res = await fetch(SUPABASE_URL + '/' + path, {
    method: opts.body ? 'POST' : 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(apiError(data) || 'Envelop network request failed.');
  return data;
}

function saveCreds(creds) {
  state.creds = creds;
  state.expiresAt = Date.now() + creds.expires_in * 1000;
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ creds, expiresAt: state.expiresAt })); } catch (e) { /* private mode */ }
}

function loadCreds() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.creds = saved.creds;
    state.expiresAt = saved.expiresAt || 0;
  } catch (e) { state.creds = null; }
}

async function refresh() {
  if (!state.creds) throw new Error('Sign in first');
  const creds = await request('auth/v1/token?grant_type=refresh_token', {
    auth: false,
    body: { refresh_token: state.creds.refresh_token },
  });
  saveCreds(creds);
}

function avatarFor(name) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (Math.imul(h, 31) + ch.codePointAt(0)) | 0;
  return Math.abs(h) % 16;
}

function avatarColor(id) {
  const palette = ['#5a715a', '#ad342b', '#1d4e5f', '#7a5c2e', '#4a4e69', '#645244'];
  return palette[id % palette.length];
}

async function restore() {
  loadCreds();
  if (!state.creds) { renderWelcome(); return; }
  try {
    await refresh();
    const rows = await request('rest/v1/profiles?id=eq.' + state.creds.user.id + '&select=*');
    state.profile = rows[0] || null;
    if (!state.profile) { renderWelcome(); return; }
    await checkAdmin();
    renderChat();
    startPolling();
  } catch (err) {
    renderWelcome();
    showError(err.message);
  }
}

async function enter() {
  const input = $('chat-name');
  const name = input.value.trim();
  if (!name || name.length > 32 || state.busy) return;
  state.busy = true;
  showError('');
  try {
    if (!state.creds) saveCreds(await request('auth/v1/signup', { auth: false, body: { data: {} } }));
    state.profile = await request('rest/v1/rpc/create_profile', { body: { p_name: name, p_avatar: avatarFor(name) } });
    await checkAdmin();
    renderChat();
    startPolling();
  } catch (err) {
    showError(err.message);
  } finally {
    state.busy = false;
  }
}

function isFresh(p) {
  if (!p.presence || !p.presence.last_seen) return false;
  return Date.now() - new Date(p.presence.last_seen).getTime() < FRESH_MS;
}

async function beat() {
  if (state.presenceMode === false) return;
  state.lastBeat = Date.now();
  try {
    await request('rest/v1/rpc/heartbeat', { body: {} });
  } catch (err) {
    showError(err.message);
  }
}

async function search(query) {
  const clean = (query || '').replace(/[^a-zA-Z0-9 \-]/g, '');
  const fetchRows = (withPresence) => {
    const params = new URLSearchParams({
      select: withPresence ? '*,presence(last_seen)' : '*',
      order: 'is_device.desc,display_name.asc,id.asc',
      limit: '50',
    });
    if (clean) params.set('display_name', 'ilike.*' + clean + '*');
    return request('rest/v1/profiles?' + params.toString());
  };
  try {
    let rows;
    if (state.presenceMode === false) {
      rows = await fetchRows(false);
    } else {
      try {
        rows = await fetchRows(true);
        state.presenceMode = true;
      } catch (e) {
        // Backend predates presence: show everyone, skip heartbeats.
        rows = await fetchRows(false);
        state.presenceMode = false;
      }
    }
    let visible = rows.filter((p) => p.id !== (state.profile && state.profile.id));
    if (state.presenceMode) visible = visible.filter((p) => p.is_device || p.pinned || isFresh(p));
    if (!visible.some((p) => p.is_device)) {
      const pinned = await request('rest/v1/profiles?id=eq.' + DEVICE_ID + '&select=*');
      visible = pinned.concat(visible);
    }
    state.people = visible;
    renderPeople();
  } catch (err) {
    showError(err.message);
  }
}

async function openPeer(peer) {
  state.peer = peer;
  state.conversation = null;
  state.messages = [];
  renderPeople();
  renderThread();
  try {
    state.conversation = await request('rest/v1/rpc/get_or_create_dm', { body: { p_peer: peer.id } });
    await fetchMessages();
  } catch (err) {
    showError(err.message);
  }
}

async function fetchMessages() {
  if (!state.conversation) return;
  const conv = state.conversation;
  const rows = await request(
    'rest/v1/messages?conversation_id=eq.' + conv + '&select=*&order=created_at.desc,id.desc&limit=20'
  );
  if (state.conversation !== conv) return;
  state.messages = rows.slice().reverse();
  renderThread();
}

function tomatoPrintable(body) {
  if (!body || BufferSafeLength(body) > 256) return false;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    if (c < 32 || c > 126) return false;
  }
  return true;
}

function BufferSafeLength(s) { return new TextEncoder().encode(s).length; }

async function send() {
  const input = $('chat-draft');
  const body = input.value;
  if (!body || BufferSafeLength(body) > 256 || state.busy || !state.conversation || !state.peer) return;
  if (state.peer.is_device && !tomatoPrintable(body)) {
    showError('Use 1–256 bytes. Tomato accepts printable ASCII.');
    return;
  }
  state.busy = true;
  try {
    await request('rest/v1/rpc/send_message', {
      body: { p_conversation: state.conversation, p_body: body, p_nonce: crypto.randomUUID() },
    });
    input.value = '';
    showError('');
    await fetchMessages();
  } catch (err) {
    showError(err.message);
  } finally {
    state.busy = false;
  }
}

async function poll() {
  try {
    if (Date.now() - state.lastBeat > BEAT_MS) await beat();
    const leases = await request('rest/v1/device_bridges?device_id=eq.' + DEVICE_ID + '&select=expires_at');
    const now = Date.now();
    state.tomatoOnline = leases.some((l) => new Date(l.expires_at).getTime() > now);
    if (state.conversation) await fetchMessages();
    await search($('chat-search') ? $('chat-search').value : '');
    renderNotice();
  } catch (err) {
    showError(err.message);
  }
}

function startPolling() {
  stopPolling();
  search($('chat-search') ? $('chat-search').value : '');
  state.pollTimer = setInterval(poll, POLL_MS);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = 0;
}

async function checkAdmin() {
  try {
    state.isAdmin = !!(await request('rest/v1/rpc/am_i_admin', { body: {} }));
  } catch (err) {
    state.isAdmin = false;
  }
  renderAdmin();
}

async function removePerson(peer) {
  if (!confirm('Remove ' + peer.display_name + ' from Envelop? Their conversations go too.')) return;
  try {
    await request('rest/v1/rpc/admin_remove_profile', { body: { p_user: peer.id } });
    if (state.peer && state.peer.id === peer.id) {
      state.peer = null; state.conversation = null; state.messages = [];
    }
    showError('');
    await search($('chat-search') ? $('chat-search').value : '');
    renderThread();
  } catch (err) {
    showError(err.message);
  }
}

async function flushAll() {
  if (!confirm('Flush EVERYTHING? All people, conversations and messages go. Only Tomato stays.')) return;
  if (!confirm('Really flush? This cannot be undone.')) return;
  try {
    await request('rest/v1/rpc/admin_flush', { body: {} });
    forget();
    showError('Flushed. Enter a name to start over (re-bootstrap admin + bridge grants after).');
  } catch (err) {
    showError(err.message);
  }
}

function renderWelcome() {
  $('chat-welcome').hidden = false;
  $('chat-grid').hidden = true;
}

function renderChat() {
  $('chat-welcome').hidden = true;
  $('chat-grid').hidden = false;
  renderMe(false);
  renderPeople();
  renderAdmin();
  renderThread();
}

function renderMe(editing) {
  const me = $('chat-me');
  me.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'chat-me-row';
  const selfDot = document.createElement('span');
  selfDot.className = 'dot';
  selfDot.title = 'Online';
  row.appendChild(selfDot);
  const name = document.createElement('strong');
  name.textContent = state.profile.display_name;
  row.appendChild(name);
  if (state.profile.verified) {
    const seal = document.createElement('img');
    seal.src = '../media/verified.svg';
    seal.alt = 'Verified';
    seal.width = 14; seal.height = 14;
    row.appendChild(seal);
  }
  if (!editing) {
    const pen = document.createElement('button');
    pen.type = 'button';
    pen.className = 'icon-btn';
    pen.title = 'Edit name';
    pen.setAttribute('aria-label', 'Edit name');
    pen.textContent = '✎';
    pen.addEventListener('click', () => renderMe(true));
    row.appendChild(pen);
  }
  me.append(row);
  if (!editing) return;
  const ed = document.createElement('div');
  ed.className = 'chat-edit';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 32;
  input.value = state.profile.display_name;
  input.setAttribute('aria-label', 'New name');
  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  save.addEventListener('click', async () => {
    const v = input.value.trim();
    if (!v || v.length > 32) { showError('Name must be 1–32 characters'); return; }
    try {
      state.profile = await request('rest/v1/rpc/update_profile_name', { body: { p_name: v } });
      showError('');
      renderMe(false);
    } catch (err) {
      showError(err.message);
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save.click();
    if (e.key === 'Escape') { renderMe(false); showError(''); }
  });
  cancel.addEventListener('click', () => { renderMe(false); showError(''); });
  ed.append(input, save, cancel);
  me.appendChild(ed);
  input.focus();
  input.select();
}

function renderPeople() {
  const list = $('chat-people');
  list.innerHTML = '';
  for (const p of state.people) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    if (state.peer && state.peer.id === p.id) btn.setAttribute('aria-current', 'true');
    const av = document.createElement('span');
    av.className = 'avatar';
    av.style.background = avatarColor(p.avatar_id);
    av.textContent = (p.display_name || '?').slice(0, 1).toUpperCase();
    const who = document.createElement('span');
    who.className = 'who';
    const b = document.createElement('b');
    b.textContent = p.display_name;
    if (p.verified) {
      const seal = document.createElement('img');
      seal.src = '../media/verified.svg';
      seal.alt = 'Verified';
      seal.width = 14; seal.height = 14;
      b.appendChild(seal);
    }
    who.appendChild(b);
    if (p.is_device || p.pinned) {
      const sub = document.createElement('small');
      const online = p.is_device ? state.tomatoOnline : state.presenceMode && isFresh(p);
      sub.textContent = online ? 'Online' : 'Offline';
      who.appendChild(sub);
    }
    btn.append(av, who);
    if (!p.is_device && state.presenceMode && isFresh(p)) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.title = 'Online';
      btn.prepend(dot);
    }
    btn.addEventListener('click', () => openPeer(p));
    li.appendChild(btn);
    if (state.isAdmin && !p.is_device && state.profile && p.id !== state.profile.id) {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'row-remove';
      rm.title = 'Remove ' + p.display_name;
      rm.setAttribute('aria-label', 'Remove ' + p.display_name);
      rm.textContent = '✕';
      rm.addEventListener('click', () => removePerson(p));
      li.appendChild(rm);
    }
    list.appendChild(li);
  }
}

function renderAdmin() {
  const box = $('chat-admin');
  box.innerHTML = '';
  if (!state.isAdmin) { box.hidden = true; return; }
  box.hidden = false;
  const label = document.createElement('span');
  label.textContent = 'Admin';
  const flush = document.createElement('button');
  flush.type = 'button';
  flush.textContent = 'Flush everything';
  flush.addEventListener('click', flushAll);
  box.append(label, flush);
}

function renderThread() {
  const empty = $('chat-empty');
  const wrap = $('chat-convo');
  if (!state.peer) { empty.hidden = false; wrap.hidden = true; return; }
  empty.hidden = true; wrap.hidden = false;
  const head = $('chat-peer');
  head.innerHTML = '';
  head.append(state.peer.display_name);
  if (state.peer.verified) {
    const seal = document.createElement('img');
    seal.src = '../media/verified.svg';
    seal.alt = 'Verified';
    seal.width = 16; seal.height = 16;
    head.appendChild(seal);
  }
  if (state.peer.is_device) {
    const sub = document.createElement('small');
    sub.textContent = state.tomatoOnline ? 'Online · notes appear on Tomato’s screen' : 'Offline · notes wait for a bridge';
    head.appendChild(sub);
  }
  renderNotice();
  const box = $('chat-messages');
  box.innerHTML = '';
  for (const m of state.messages) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (m.sender_id === (state.profile && state.profile.id) ? 'me' : 'them');
    div.textContent = m.body;
    const t = document.createElement('time');
    const d = new Date(m.created_at);
    t.textContent = isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    div.appendChild(t);
    box.appendChild(div);
  }
  box.scrollTop = box.scrollHeight;
}

function renderNotice() {
  const n = $('chat-notice');
  if (state.peer && state.peer.is_device && !state.tomatoOnline) {
    n.hidden = false;
    n.textContent = 'Messages wait in Envelop until Tomato has a bridge (a Mac holding the lease).';
  } else {
    n.hidden = true;
  }
}

async function leave() {
  if (!confirm('Leave Envelop? Your name and conversations are deleted for good.')) return;
  try {
    await request('rest/v1/rpc/leave_network', { body: {} });
    forget();
    showError('Left. Your chats were deleted.');
  } catch (err) {
    showError(err.message);
  }
}

function forget() {
  // Best-effort server wipe first so the name doesn't linger for
  // everyone else; falls back to dropping the local session only
  // (pre-004 backends, or identities never named).
  if (state.creds) {
    request('rest/v1/rpc/leave_network', { body: {} }).catch(() => {});
  }
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  stopPolling();
  state.creds = null; state.profile = null; state.peer = null;
  state.conversation = null; state.messages = []; state.people = [];
  state.isAdmin = false;
  $('chat-admin').hidden = true;
  renderWelcome();
  showError('');
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    $('chat-join').addEventListener('click', enter);
    $('chat-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
    $('chat-send').addEventListener('click', send);
    $('chat-draft').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    $('chat-search').addEventListener('input', (e) => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => search(e.target.value), 250);
    });
    $('chat-forget').addEventListener('click', forget);
    $('chat-leave').addEventListener('click', leave);
    restore();
  });
}

if (typeof module !== 'undefined') module.exports = { avatarFor: avatarFor };
