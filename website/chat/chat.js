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
// Migration-sensitive API strings live here so a renamed RPC is one edit.
const COMPUTE_API = Object.freeze({
  enqueue: 'rest/v1/rpc/enqueue_compute_job',
  read: 'rest/v1/rpc/my_compute_job',
  cancel: 'rest/v1/rpc/cancel_compute_job',
});

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

const localJobs = [];
const messageTabs = new Map();
const expandedMessages = new Set();
let pendingDraft = null;
const $ = (id) => document.getElementById(id);
const MOBILE_CHAT = '(max-width: 760px)';

function mobileChat() {
  return window.matchMedia(MOBILE_CHAT).matches;
}

function bindAppHeight() {
  const apply = () => {
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty('--app-height', Math.round(h) + 'px');
  };
  apply();
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', apply);
    visualViewport.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', apply);
}

function setPane(pane) {
  const grid = $('chat-grid');
  if (!grid) return;
  grid.dataset.pane = pane;
  document.body.classList.toggle('chat-thread-open', pane === 'thread');
}

function closeThread() {
  state.peer = null;
  state.conversation = null;
  state.messages = [];
  setPane('list');
  renderPeople();
  renderThread();
}

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
    if (pendingDraft) {
      const text = pendingDraft;
      pendingDraft = null;
      try {
        await search('');
        const tomato = state.people.find((p) => p.is_device) || null;
        if (tomato) await openPeer(tomato);
      } catch (e) { /* draft still fills below */ }
      const draft = $('chat-draft');
      if (draft) { draft.value = text; draft.focus(); }
      showError('');
    }
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
  const switching = !(state.peer && state.peer.id === peer.id);
  state.peer = peer;
  state.conversation = null;
  state.messages = [];
  setPane('thread');
  renderPeople();
  renderThread();
  if (mobileChat() && switching && !(history.state && history.state.envelopPane === 'thread')) {
    history.pushState({ envelopPane: 'thread' }, '');
  }
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
  if (state.peer.is_device) {
    let compiled;
    let compiler;
    try { compiler = await import('./virtual/compiler.mjs'); compiled = compiler.compile(body); }
    catch (err) { showError(err.message); return; }
    if (compiled) {
      const job = {id: crypto.randomUUID(), conversation: state.conversation, body,
        name: state.profile.display_name, created_at: new Date().toISOString(),
        program: compiled.canonical,
        hex: compiler.hex(compiled.bytes),
        version: 'Remote bytecode v1',
        understood: compiled.understood || null,
        status:'offer', compute:true};
      localJobs.push(job);
      input.value='';showError('');renderThread();
      // Hardware first when Tomato is online: the leased bridge runs the same
      // bytes on the real machine. Offline (or enqueue failure) stays virtual.
      if (state.tomatoOnline) runHardware(job);
      else runVirtual(job);
      return;
    }
    // Plain chat always sends; the server queues while hardware is away.
    // Firmware only auto-replies to canonical "Hello" and "/help": normalize
    // greeting variants (e.g. "Hello, Tomato.") client-side, same as the
    // Virtual Tomato worker, so hardware and virtual agree.
    const greet = compiler.normalizeGreeting ? compiler.normalizeGreeting(body) : null;
    if (greet || /^(help|what can you do)[?.!]*$/i.test(body.trim())) {
      const normalized = greet || '/help';
      state.busy = true;
      try {
        await request('rest/v1/rpc/send_message' , {
          body: { p_conversation: state.conversation, p_body: normalized, p_nonce: crypto.randomUUID() },
        });
        input.value = '';
        showError('');
        await fetchMessages();
      } catch (err) {
        showError(err.message);
      } finally {
        state.busy = false;
      }
      return;
    }
  }
  state.busy = true;
  try {
    await request('rest/v1/rpc/send_message' , {
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
  setPane('list');
}

function renderChat() {
  $('chat-welcome').hidden = true;
  $('chat-grid').hidden = false;
  setPane(state.peer ? 'thread' : 'list');
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
  const av = document.createElement('span');
  av.className = 'avatar';
  av.style.background = avatarColor(state.profile.avatar_id);
  av.textContent = (state.profile.display_name || '?').slice(0, 1).toUpperCase();
  row.appendChild(av);
  const who = document.createElement('span');
  who.className = 'who';
  const name = document.createElement('b');
  name.textContent = state.profile.display_name;
  if (state.profile.verified) {
    const seal = document.createElement('img');
    seal.src = '../media/verified.svg';
    seal.alt = 'Verified';
    seal.width = 14; seal.height = 14;
    name.appendChild(seal);
  }
  who.append(name);
  const sub = document.createElement('small');
  sub.textContent = 'Online';
  who.appendChild(sub);
  row.appendChild(who);
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
    const sub = document.createElement('small');
    const online = p.is_device ? state.tomatoOnline : !state.presenceMode || isFresh(p);
    sub.textContent = online ? 'Online' : 'Offline';
    who.appendChild(sub);
    btn.append(av, who);
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
  if (!state.peer) {
    empty.hidden = false;
    wrap.hidden = true;
    setPane('list');
    return;
  }
  empty.hidden = true; wrap.hidden = false;
  setPane('thread');
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
  const sub = document.createElement('small');
  if (state.peer.is_device) {
    sub.textContent = state.tomatoOnline
      ? 'Online · notes appear on Tomato’s screen'
      : 'Offline · Virtual Tomato available';
  } else {
    sub.textContent = !state.presenceMode || isFresh(state.peer) ? 'Online' : 'Offline';
  }
  head.appendChild(sub);
  renderNotice();
  const box = $('chat-messages');
  const prevTop = box.scrollTop;
  const fresh = box.dataset.conv !== String(state.conversation || '');
  const nearBottom = fresh || (box.scrollHeight - prevTop - box.clientHeight < 80);
  box.innerHTML = '';
  for (const m of state.messages) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (m.sender_id === (state.profile && state.profile.id) ? 'me' : 'them');
    appendMessageViews(div, m.id, m.body, null, null, 'UTF-8 message bytes', ['Text','Hex']);
    const t = document.createElement('time');
    const d = new Date(m.created_at);
    t.textContent = isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    div.appendChild(t);
    box.appendChild(div);
  }
  for (const job of localJobs.filter(j=>j.conversation===state.conversation)) box.appendChild(renderJob(job));
  box.dataset.conv = String(state.conversation || '');
  box.scrollTop = nearBottom ? box.scrollHeight : prevTop;
}

function renderNotice() {
  const n = $('chat-notice');
  if (state.peer && state.peer.is_device && !state.tomatoOnline) {
    n.hidden = false;
    n.innerHTML = '';
    n.append(document.createTextNode('Hardware Tomato is offline. Notes queue and deliver when its bridge is back.'));
  } else {
    n.hidden = true;
  }
  renderBanner();
}

function renderBanner() {
  const bar = $('vt-banner');
  if (bar) bar.hidden = !(state.profile && !$('chat-grid').hidden && state.peer && state.peer.is_device && !state.tomatoOnline);
  // Preview is always available for Tomato: virtual-only, labeled, never queued.
  const preview = $('vt-preview');
  if (preview) preview.hidden = !(state.profile && !$('chat-grid').hidden && state.peer && state.peer.is_device);
}

async function previewDraft() {
  const input = $('chat-draft');
  let body = input.value;
  if (!body && state.conversation) {
    const me = state.profile && state.profile.id;
    const last = [...state.messages].reverse().find(m => m.sender_id === me);
    if (last) body = last.body;
  }
  if (!body || !state.conversation || !state.peer) {
    showError('Type a message first, then preview it in Virtual Tomato.');
    if (input) input.focus();
    return;
  }
  let compiled, hex;
  try {
    const m = await import('./virtual/compiler.mjs');
    compiled = m.compile(body); hex = m.hex;
  } catch (err) { showError(err.message); return; }
  if (compiled) { send(); return; }
  const job = {id: crypto.randomUUID(), conversation: state.conversation, body,
    name: state.profile.display_name, created_at: new Date().toISOString(),
    program: 'Chat text · no assembly program is sent.',
    hex: hex(new TextEncoder().encode(body)),
    version: 'UTF-8 chat text', understood: null,
    status:'offer', compute:false, preview:true};
  localJobs.push(job);
  input.value='';showError('');renderThread();
  runVirtual(job);
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
    // Tappable examples: tap enters the exact text, addressed to Tomato.
    document.querySelectorAll('.try-chip').forEach((chip) => {
      chip.addEventListener('click', async () => {
        const text = chip.getAttribute('data-example') || chip.textContent.trim();
        // Already inside chat: open Tomato and fill the composer.
        if (state.profile && !$('chat-grid').hidden) {
          const tomato = state.people.find((p) => p.is_device);
          if (tomato && (!state.peer || state.peer.id !== tomato.id)) {
            try { await openPeer(tomato); } catch (e) { /* fall through to fill */ }
          }
          const draft = $('chat-draft');
          if (draft) { draft.value = text; draft.focus(); }
          showError('');
          return;
        }
        // Welcome screen: need a name first, then join with the example queued.
        const nameInput = $('chat-name');
        if (!nameInput || !nameInput.value.trim()) {
          pendingDraft = text;
          const hint = $('try-hint');
          if (hint) {
            hint.hidden = false;
            hint.textContent = 'Pick a name above, press Enter — we’ll fill in “' + text + '” for Tomato.';
          }
          if (nameInput) nameInput.focus();
          return;
        }
        pendingDraft = text;
        enter();
      });
    });
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
    $('vt-preview').addEventListener('click', previewDraft);
    $('chat-back').addEventListener('click', () => {
      if (history.state && history.state.envelopPane === 'thread') history.back();
      else closeThread();
    });
    window.addEventListener('popstate', () => {
      if (state.peer && mobileChat()) closeThread();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.peer && mobileChat() && !$('chat-grid').hidden) {
        if (history.state && history.state.envelopPane === 'thread') history.back();
        else closeThread();
      }
    });
    bindAppHeight();
    for (const menu of document.querySelectorAll('.site-menu')) {
      menu.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; });
      document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
      menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); }
      });
    }
    restore();
  });
}

if (typeof module !== 'undefined') module.exports = { avatarFor, computeResolution };


// All rendering uses textContent. Program/hex never become executable markup.
function appendMessageViews(parent,id,text,program,bytes,version,modes) {
  const tabs=document.createElement('div');tabs.className='message-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Message representation');
  const content=document.createElement('div');content.className='message-content';
  const choices=modes||['Text','Program','Hex'];
  const paint=()=>{const mode=messageTabs.get(id)||'Text';for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.textContent===mode));
    content.textContent=mode==='Text'?text:mode==='Program'?program:version+'\n'+(bytes||Array.from(new TextEncoder().encode(text),b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' '));
    content.classList.toggle('code-view',mode!=='Text');};
  for(const label of choices){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{messageTabs.set(id,label);paint();};tabs.append(b);}
  parent.append(tabs,content);paint();
}
function renderJob(job) {
 const card=document.createElement('article');card.className='chat-job';
 const q=document.createElement('div');q.className='job-text';q.textContent=job.body;card.append(q);
 if(job.compute&&job.understood){
  const u=document.createElement('p');u.className='job-understood';
  const lab=document.createElement('small');lab.textContent='Envelope understood';u.append(lab);
  const line=document.createElement('code');line.textContent=job.understood;u.append(line);card.append(u);
 }
   const status=document.createElement('p');status.className='job-status';
   status.textContent=job.status==='running'
     ? (job.via==='hardware'?'Waiting for physical Tomato…':'Virtual Tomato is running your message…')
     :job.status==='done'?job.target:job.error||'Virtual execution failed';
   card.append(status);
   if (job.status==='error' && job.compute && job.hardwareAttempt && job.virtualSafe && !(job.replies&&job.replies.length)) {
     const note=document.createElement('p');note.className='job-status';
     note.textContent='The durable hardware job is terminal — nothing will replay later.';
     const fb=document.createElement('button');fb.type='button';fb.textContent='Run in Virtual Tomato';
     fb.onclick=()=>{job.hwSeq=(job.hwSeq||0)+1;job.status='offer';job.error=null;job.via=null;job.hardwareAttempt=false;job.virtualSafe=false;runVirtual(job);};
     note.append(document.createTextNode(' '));note.append(fb);card.append(note);
   }
  const det=document.createElement('details');det.className='job-exec';
 const sum=document.createElement('summary');sum.textContent='View execution';det.append(sum);
 if(job.compute){
  const pl=document.createElement('div');pl.className='exec-block';
  const ph=document.createElement('small');ph.textContent='Program · '+job.version;pl.append(ph);
  const pre=document.createElement('pre');pre.textContent=job.program;pl.append(pre);det.append(pl);
 }
 const hx=document.createElement('div');hx.className='exec-block';
 const hh=document.createElement('small');hh.textContent=job.compute?('Bytes · '+job.version):'Bytes · UTF-8 chat text';hx.append(hh);
 const hxpre=document.createElement('pre');hxpre.textContent=job.hex||'';hx.append(hxpre);det.append(hx);
 card.append(det);
  for(const reply of (job.replies||[])){const bubble=document.createElement('div');bubble.className='virtual-reply';const label=document.createElement('small');label.textContent=job.via==='hardware'?'Physical Tomato · hardware reply':job.compute?'Virtual Tomato · OS reply':'Virtual Tomato · reply';bubble.append(label);const t=document.createElement('div');t.className='virtual-text';t.textContent=reply;bubble.append(t);card.append(bubble);}
  return card;
}
function computeResolution(status) {
  if (status === 'completed') return 'physical';
  if (status === 'cancelled' || status === 'failed') return 'virtual-safe';
  return 'unknown';
}
async function runHardware(job) {
  // Only authenticated online sessions enter the durable queue. Virtual may
  // follow only a terminal failed/cancelled row; ambiguous jobs never replay.
  if (!state.tomatoOnline) { runVirtual(job); return; }
  job.hardwareAttempt = true; job.virtualSafe = false;
  job.via = 'hardware'; job.status = 'running';
  job.hwSeq = (job.hwSeq || 0) + 1;
  const seq = job.hwSeq;
  renderThread();
  const started = Date.now();
  const alive = () => job.hwSeq === seq && job.status === 'running';
  let jobId = null;
  const resolveCancellation = async () => {
    if (!jobId) return 'unknown';
    try {
      const final = await request(COMPUTE_API.cancel, { body: { p_job: jobId } });
      const resolution = computeResolution(final && final.status);
      if (resolution === 'physical') {
        job.status = 'done';
        job.replies = [final.result_text || 'Tomato completed the job.'];
        job.target = 'Physical Tomato · durable hardware job';
        renderThread();
      }
      return resolution;
    } catch (e) {
      return 'unknown';
    }
  };
  const showInterrupted = async () => {
    const resolution = await resolveCancellation();
    if (resolution === 'physical' || !alive()) return;
    job.status = 'error';
    job.virtualSafe = resolution === 'virtual-safe';
    job.error = resolution === 'virtual-safe'
      ? 'Physical Tomato became unavailable; the durable job is terminal.'
      : 'Tomato execution is unknown. Virtual was not started, preventing a later hardware replay.';
    renderThread();
  };
  try {
    const enq = await request(COMPUTE_API.enqueue, {
      body: { p_device: DEVICE_ID, p_conversation: job.conversation, p_job_hex: job.hex },
    });
    jobId = enq && enq.id;
    if (!jobId) throw new Error('Hardware submission could not be confirmed.');
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      if (!alive()) return;
      let cur;
      try {
        cur = await request(COMPUTE_API.read, { body: { p_job: jobId } });
      } catch (e) {
        await showInterrupted();
        return;
      }
      if (!alive()) return;
      if (cur.status === 'completed') {
        job.status = 'done'; job.replies = [cur.result_text];
        job.target = 'Physical Tomato · durable hardware job';
        renderThread(); return;
      }
      if (cur.status === 'failed' || cur.status === 'cancelled') {
        job.status = 'error'; job.virtualSafe = true;
        job.error = cur.result_text || 'The physical Tomato job is terminal.';
        renderThread(); return;
      }
      if (Date.now() - started > 25000) {
        await showInterrupted();
        return;
      }
    }
  } catch (err) {
    if (!alive() && job.status !== 'running') return;
    // A lost enqueue response can hide a durable queued job. With no id it
    // cannot be cancelled safely, so do not offer virtual execution.
    job.status = 'error';
    job.error = 'Hardware submission is unknown. Virtual was not started, preventing a later hardware replay.';
    renderThread();
  }
}
function runVirtual(job) {
 if(job.status!=='offer')return;
 job.status='running';renderThread();
 const worker=new Worker('./virtual/worker.mjs',{type:'module'});
 const timer=setTimeout(()=>finish('Virtual Tomato timed out. Your message was not queued for hardware.'),30000);
 function finish(error){clearTimeout(timer);worker.terminate();if(error){job.status='error';job.error=error;}renderThread();}
 worker.onerror=()=>finish('Could not start Virtual Tomato. Reload the page and try again.');
  worker.onmessage=({data})=>{if(data.kind==='compiled'){job.program=data.program;job.hex=data.hex;job.version=data.version;if(data.understood)job.understood=data.understood;renderThread();}
 else if(data.kind==='result'){job.status='done';job.replies=data.replies;job.target=data.target;finish();}
 else if(data.kind==='error')finish(data.error);};
 worker.postMessage({text:job.body,name:job.name});
}
