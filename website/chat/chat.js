'use strict';
/* Envelop web chat: whoever is online, plus Tomato.
 * Anonymous identity (name only), durable DMs, Tomato pinned + verified.
 * Needs SOME bridge online (a Mac holding the lease) for Tomato's screen. */

const SUPABASE_URL = 'https://sevnusobochafwuvmuvu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nhog8psQAljHGK3RvIyp-Q_26yCYmsF';
const DEVICE_ID = '00000000-0000-0000-0000-000000000001';
const STORE_KEY = 'envelop.web.session.v1';
const READ_KEY = 'envelop.web.read.v1';
const ASSET_VERSION = '20260916-signoff';
const POLL_ACTIVE_MS = 3000;
const POLL_BACKOFF_MS = [10000, 20000, 30000];
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
  tomatoOnlineKnown: false,
  connectionOutcome: null,
  connectionOutcomeUntil: 0,
  isAdmin: false,
  presenceMode: null,
  lastBeat: 0,
  pollTimer: 0,
  pollInFlight: false,
  pollAbort: null,
  unchangedPolls: 0,
  searchTimer: 0,
  busy: false,
  loadingThread: false,
  awaitTomatoAt: 0,
  awaitTomatoThem: 0,
  readAt: {},
  latestIncoming: {},
};

const localJobs = [];
let jobViewsPromise = null;
let jobViewsModule = null;
const messageTabs = new Map();
const expandedMessages = new Set();
let pendingDraft = null;
let typingTimer = 0;
const $ = (id) => document.getElementById(id);
const MOBILE_CHAT = '(max-width: 760px)';

function mobileChat() {
  return window.matchMedia(MOBILE_CHAT).matches;
}

function jobViews() {
  if (!jobViewsPromise) {
    jobViewsPromise = import('./job-view.mjs?v=' + ASSET_VERSION).then(module => {
      jobViewsModule = module;
      return module;
    });
  }
  return jobViewsPromise;
}

function updateJobView(job) {
  if (jobViewsModule) job.view = jobViewsModule.statusView(job);
}

function bindAppHeight() {
  let frame = 0;
  const apply = () => {
    frame = 0;
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty('--app-height', Math.round(h) + 'px');
    requestAnimationFrame(() => {
      const log = $('chat-log');
      const draft = $('chat-draft');
      const typing = $('chat-typing');
      if (log && ((draft && document.activeElement === draft) || (typing && !typing.hidden))) {
        log.scrollTop = log.scrollHeight;
      }
    });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  schedule();
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', schedule, {passive: true});
    visualViewport.addEventListener('scroll', schedule, {passive: true});
  }
  window.addEventListener('resize', schedule, {passive: true});
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

function viewingPeer(id) {
  if (!state.peer || state.peer.id !== id) return false;
  if (!mobileChat()) return true;
  const grid = $('chat-grid');
  return !!(grid && grid.dataset.pane === 'thread');
}

function readStoreKey() {
  return READ_KEY + '.' + ((state.profile && state.profile.id) || 'anon');
}

function loadRead() {
  try {
    state.readAt = JSON.parse(localStorage.getItem(readStoreKey()) || '{}') || {};
  } catch (e) {
    state.readAt = {};
  }
}

function saveRead() {
  try { localStorage.setItem(readStoreKey(), JSON.stringify(state.readAt)); } catch (e) { /* private mode */ }
}

function hasUnread(peerId) {
  if (viewingPeer(peerId)) return false;
  const incoming = state.latestIncoming[peerId];
  if (!incoming) return false;
  const read = state.readAt[peerId];
  return !read || incoming > read;
}

function markPeerRead(peerId) {
  const incoming = state.latestIncoming[peerId];
  const stamp = incoming || new Date().toISOString();
  if (!state.readAt[peerId] || stamp > state.readAt[peerId]) {
    state.readAt[peerId] = stamp;
    saveRead();
  }
}

function peerOfConversation(row) {
  const me = state.profile && state.profile.id;
  if (row.participant_a === me) return row.participant_b;
  if (row.participant_b === me) return row.participant_a;
  return null;
}

async function refreshInbox(signal) {
  if (!state.profile) return false;
  try {
    const convos = await request('rest/v1/conversations?select=id,participant_a,participant_b', {signal});
    const convPeer = {};
    for (const row of convos) {
      const peer = peerOfConversation(row);
      if (peer) convPeer[row.id] = peer;
    }
    const rows = await request('rest/v1/messages?select=id,conversation_id,sender_id,created_at&order=created_at.desc&limit=80', {signal});
    const latest = {};
    const me = state.profile.id;
    for (const message of rows) {
      const peer = convPeer[message.conversation_id];
      if (!peer || message.sender_id === me || latest[peer]) continue;
      latest[peer] = message.created_at;
    }
    const changed = JSON.stringify(latest) !== JSON.stringify(state.latestIncoming);
    state.latestIncoming = latest;
    if (state.peer && viewingPeer(state.peer.id)) markPeerRead(state.peer.id);
    return changed;
  } catch (e) { return false; /* inbox is best-effort */ }
}

function themCount() {
  const me = state.profile && state.profile.id;
  return state.messages.filter((m) => m.sender_id !== me).length;
}

function tomatoIsBusy() {
  if (!state.peer || !state.peer.is_device) return false;
  if (state.busy || state.loadingThread) return true;
  if (localJobs.some((j) => j.conversation === state.conversation
    && ['compiling', 'queued', 'executing'].includes(j.phase))) return true;
  if (!state.awaitTomatoAt) return false;
  if (Date.now() - state.awaitTomatoAt > 25000 || themCount() > state.awaitTomatoThem) {
    state.awaitTomatoAt = 0;
    clearTimeout(typingTimer);
    return false;
  }
  return true;
}

function markAwaitTomato() {
  state.awaitTomatoAt = Date.now();
  state.awaitTomatoThem = themCount();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    state.awaitTomatoAt = 0;
    syncTyping();
  }, 25000);
}

function typingDots() {
  const dots = document.createElement('span');
  dots.className = 'typing-dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  return dots;
}

function syncTyping() {
  const el = $('chat-typing');
  if (!el) return;
  const on = tomatoIsBusy();
  el.hidden = !on;
  const sub = document.querySelector('#chat-peer small');
  if (sub && state.peer && state.peer.is_device) {
    if (on) sub.textContent = 'Typing…';
    else if (mobileChat()) sub.textContent = state.tomatoOnline ? 'Online' : 'Offline';
    else if (state.tomatoOnline) sub.textContent = 'Online · notes appear on Tomato’s screen';
    else sub.textContent = 'Offline · Virtual Tomato available';
  }
  if (on) {
    const log = $('chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  }
}

function syncComposer() {
  const send = $('chat-send');
  if (send) {
    send.disabled = !!state.busy;
    send.textContent = state.busy ? 'Sending…' : 'Send';
    send.setAttribute('aria-busy', String(!!state.busy));
  }
  const join = $('chat-join');
  if (join) {
    join.disabled = !!state.busy;
    join.textContent = state.busy ? 'Entering…' : 'Enter';
    join.setAttribute('aria-busy', String(!!state.busy));
  }
  const draft = $('chat-draft');
  if (draft) draft.setAttribute('aria-busy', String(!!state.busy));
}

function setBusy(value) {
  state.busy = value;
  syncComposer();
  syncTyping();
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
    signal: opts.signal,
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
    loadRead();
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
  setBusy(true);
  showError('');
  try {
    if (!state.creds) saveCreds(await request('auth/v1/signup', { auth: false, body: { data: {} } }));
    state.profile = await request('rest/v1/rpc/create_profile', { body: { p_name: name, p_avatar: avatarFor(name) } });
    loadRead();
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
    setBusy(false);
  }
}

function isFresh(p) {
  if (!p.presence || !p.presence.last_seen) return false;
  return Date.now() - new Date(p.presence.last_seen).getTime() < FRESH_MS;
}

async function beat(signal) {
  if (state.presenceMode === false) return;
  state.lastBeat = Date.now();
  try {
    await request('rest/v1/rpc/heartbeat', { body: {}, signal });
  } catch (err) {
    if (err.name !== 'AbortError') showError(err.message);
  }
}

async function search(query, signal) {
  const clean = (query || '').replace(/[^a-zA-Z0-9 \-]/g, '');
  const fetchRows = (withPresence) => {
    const params = new URLSearchParams({
      select: withPresence ? '*,presence(last_seen)' : '*',
      order: 'is_device.desc,display_name.asc,id.asc',
      limit: '50',
    });
    if (clean) params.set('display_name', 'ilike.*' + clean + '*');
    return request('rest/v1/profiles?' + params.toString(), {signal});
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
    if (state.presenceMode) {
      visible = visible.filter((p) => p.is_device || p.pinned || isFresh(p) || hasUnread(p.id));
    }
    if (!visible.some((p) => p.is_device)) {
      const pinned = await request('rest/v1/profiles?id=eq.' + DEVICE_ID + '&select=*', {signal});
      visible = pinned.concat(visible);
    }
    const before = JSON.stringify(state.people);
    state.people = visible;
    const changed = before !== JSON.stringify(visible);
    if (changed) renderPeople();
    return changed;
  } catch (err) {
    if (err.name !== 'AbortError') showError(err.message);
    return false;
  }
}

async function openPeer(peer) {
  const switching = !(state.peer && state.peer.id === peer.id);
  state.peer = peer;
  state.conversation = null;
  state.messages = [];
  state.loadingThread = true;
  state.awaitTomatoAt = 0;
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
  } finally {
    state.loadingThread = false;
    renderThread();
  }
}

async function fetchMessages(signal) {
  if (!state.conversation) return false;
  const conv = state.conversation;
  const rows = await request(
    'rest/v1/messages?conversation_id=eq.' + conv + '&select=*&order=created_at.desc,id.desc&limit=20',
    {signal},
  );
  if (state.conversation !== conv) return false;
  const next = rows.slice().reverse();
  const changed = JSON.stringify(next) !== JSON.stringify(state.messages);
  state.messages = next;
  if (state.peer) {
    const me = state.profile && state.profile.id;
    const lastIn = [...state.messages].reverse().find((m) => m.sender_id !== me);
    if (lastIn) state.latestIncoming[state.peer.id] = lastIn.created_at;
    if (viewingPeer(state.peer.id)) markPeerRead(state.peer.id);
  }
  if (changed) {
    renderThread();
    renderPeople();
  }
  return changed;
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
    try {
      [compiler] = await Promise.all([
        import('./virtual/compiler.mjs?v=' + ASSET_VERSION),
        jobViews(),
      ]);
      compiled = compiler.compile(body);
    } catch (err) {
      const views = await jobViews();
      const outcome = views.compileOutcome(err, body);
      if (!outcome) { showError(err.message); return; }
      const failedJob = {
        id: crypto.randomUUID(),
        conversation: state.conversation,
        body,
        name: state.profile.display_name,
        created_at: new Date().toISOString(),
        compute: true,
        phase: views.PHASES.FAILED,
        outcome,
      };
      updateJobView(failedJob);
      localJobs.push(failedJob);
      input.value = '';
      showError('');
      renderThread();
      return;
    }
    if (compiled) {
      const job = {id: crypto.randomUUID(), conversation: state.conversation, body,
        name: state.profile.display_name, created_at: new Date().toISOString(),
        program: compiled.canonical,
        hex: compiler.hex(compiled.bytes),
        version: 'Remote bytecode v1',
        understood: compiled.understood || null,
        phase:'compiling', compute:true};
      updateJobView(job);
      localJobs.push(job);
      input.value='';showError('');renderThread();
      await new Promise(resolve => setTimeout(resolve, 0));
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
      markAwaitTomato();
      setBusy(true);
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
        setBusy(false);
      }
      return;
    }
  }
  setBusy(true);
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
    setBusy(false);
  }
}

function pollingDelay(changed) {
  if (changed) {
    state.unchangedPolls = 0;
    return POLL_ACTIVE_MS;
  }
  const delay = POLL_BACKOFF_MS[Math.min(state.unchangedPolls, POLL_BACKOFF_MS.length - 1)];
  state.unchangedPolls++;
  return delay;
}

function schedulePoll(delay) {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = 0;
  if (!state.profile || document.hidden) return;
  state.pollTimer = setTimeout(poll, delay);
}

async function poll() {
  if (state.pollInFlight || document.hidden || !state.profile) return;
  state.pollInFlight = true;
  const controller = new AbortController();
  state.pollAbort = controller;
  const signal = controller.signal;
  let changed = false;
  try {
    if (Date.now() - state.lastBeat > BEAT_MS) await beat(signal);
    const leases = await request('rest/v1/device_bridges?device_id=eq.' + DEVICE_ID + '&select=expires_at', {signal});
    const now = Date.now();
    const online = leases.some((l) => new Date(l.expires_at).getTime() > now);
    const onlineChanged = state.tomatoOnlineKnown && online !== state.tomatoOnline;
    if (!state.tomatoOnlineKnown) {
      state.tomatoOnlineKnown = true;
      if (!online) {
        const views = await jobViews();
        state.connectionOutcome = views.personalityOutcome('HARDWARE_OFFLINE', 'initial-offline:' + DEVICE_ID);
      }
    } else if (online !== state.tomatoOnline) {
      const views = await jobViews();
      const event = online ? 'HARDWARE_RESTORED' : 'HARDWARE_OFFLINE';
      const leaseKey = leases.map(lease => lease.expires_at).sort().join(',');
      state.connectionOutcome = views.personalityOutcome(event, event + ':' + leaseKey);
      state.connectionOutcomeUntil = online ? now + 8000 : 0;
    }
    state.tomatoOnline = online;
    changed = onlineChanged;
    if (state.conversation && state.peer && viewingPeer(state.peer.id)) {
      changed = (await fetchMessages(signal)) || changed;
    }
    changed = (await refreshInbox(signal)) || changed;
    changed = (await search($('chat-search') ? $('chat-search').value : '', signal)) || changed;
    if (onlineChanged) {
      renderPeople();
      renderThread();
    }
    renderNotice();
  } catch (err) {
    if (err.name !== 'AbortError') {
      showError(err.message);
      changed = true;
    }
  } finally {
    if (state.pollAbort === controller) state.pollAbort = null;
    state.pollInFlight = false;
    schedulePoll(pollingDelay(changed));
  }
}

function startPolling() {
  stopPolling();
  state.unchangedPolls = 0;
  if (!document.hidden) poll();
}

function stopPolling() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = 0;
  if (state.pollAbort) state.pollAbort.abort();
  state.pollAbort = null;
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
    const unread = hasUnread(p.id);
    sub.textContent = unread ? 'Unread' : online ? 'Online' : 'Offline';
    who.appendChild(sub);
    btn.append(av, who);
    if (unread) {
      btn.classList.add('unread');
      const pip = document.createElement('span');
      pip.className = 'unread-pip';
      pip.setAttribute('aria-hidden', 'true');
      btn.appendChild(pip);
      btn.setAttribute('aria-label', (p.display_name || 'Person') + ', unread');
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
  if (!state.peer) {
    empty.hidden = false;
    wrap.hidden = true;
    setPane('list');
    syncTyping();
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
    if (tomatoIsBusy()) sub.textContent = 'Typing…';
    else if (mobileChat()) sub.textContent = state.tomatoOnline ? 'Online' : 'Offline';
    else sub.textContent = state.tomatoOnline
      ? 'Online · notes appear on Tomato’s screen'
      : 'Offline · Virtual Tomato available';
  } else {
    sub.textContent = !state.presenceMode || isFresh(state.peer) ? 'Online' : 'Offline';
  }
  head.appendChild(sub);
  renderNotice();
  const box = $('chat-messages');
  const log = $('chat-log') || box;
  const prevTop = log.scrollTop;
  const fresh = box.dataset.conv !== String(state.conversation || '');
  const nearBottom = fresh || (log.scrollHeight - prevTop - log.clientHeight < 80);
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
  syncTyping();
  log.scrollTop = nearBottom ? log.scrollHeight : prevTop;
}

function renderNotice() {
  const n = $('chat-notice');
  const restored = state.tomatoOnline
    && state.connectionOutcome
    && state.connectionOutcome.event === 'HARDWARE_RESTORED'
    && Date.now() < state.connectionOutcomeUntil;
  if (state.peer && state.peer.is_device && (!state.tomatoOnline || restored)) {
    n.hidden = false;
    n.innerHTML = '';
    const outcome = state.connectionOutcome;
    const text = document.createElement('span');
    text.textContent = outcome
      ? outcome.text
      : 'Hardware Tomato is offline. Notes queue and deliver when its bridge is back.';
    n.append(text);
    if (outcome) {
      const technical = document.createElement('small');
      technical.textContent = outcome.technical;
      n.append(technical);
    }
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
    const [m] = await Promise.all([import('./virtual/compiler.mjs?v=' + ASSET_VERSION), jobViews()]);
    compiled = m.compile(body); hex = m.hex;
  } catch (err) {
    const outcome = jobViewsModule && jobViewsModule.compileOutcome(err, body);
    if (!outcome) { showError(err.message); return; }
    const failedJob = {
      id: crypto.randomUUID(),
      conversation: state.conversation,
      body,
      name: state.profile.display_name,
      created_at: new Date().toISOString(),
      compute: true,
      preview: true,
      phase: 'failed',
      outcome,
    };
    updateJobView(failedJob);
    localJobs.push(failedJob);
    input.value = '';
    showError('');
    renderThread();
    return;
  }
  if (compiled) { send(); return; }
  const job = {id: crypto.randomUUID(), conversation: state.conversation, body,
    name: state.profile.display_name, created_at: new Date().toISOString(),
    program: 'Chat text · no assembly program is sent.',
    hex: hex(new TextEncoder().encode(body)),
    version: 'UTF-8 chat text', understood: null,
    phase:'queued', compute:false, preview:true};
  updateJobView(job);
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
  state.tomatoOnline = false;
  state.tomatoOnlineKnown = false;
  state.connectionOutcome = null;
  state.connectionOutcomeUntil = 0;
  state.awaitTomatoAt = 0;
  state.loadingThread = false;
  state.readAt = {};
  state.latestIncoming = {};
  clearTimeout(typingTimer);
  setBusy(false);
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
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopPolling();
      else if (state.profile) {
        state.unchangedPolls = 0;
        poll();
      }
    });
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
  const lab=document.createElement('small');lab.textContent='Envelop understood';u.append(lab);
  const line=document.createElement('code');line.textContent=job.understood;u.append(line);card.append(u);
 }
 updateJobView(job);
 const view=job.view||{phase:job.phase||'unknown',voice:'envelop',text:'Operation status unavailable.',technical:'STATUS_UNKNOWN'};
 const appendReplies=()=>{
  for(const reply of (job.replies||[])){const bubble=document.createElement('div');bubble.className='virtual-reply';const label=document.createElement('small');label.textContent=job.via==='hardware'?'Physical Tomato':job.compute?'Virtual Tomato':'Virtual Tomato · reply';bubble.append(label);const t=document.createElement('div');t.className='virtual-text';t.textContent=reply;bubble.append(t);card.append(bubble);}
 };
 if(view.resultFirst)appendReplies();
 const status=document.createElement('div');status.className='job-status job-response';status.dataset.phase=view.phase;
 if(view.pending)status.append(typingDots());
 const statusCopy=document.createElement('span');statusCopy.className='job-response-copy';
 if(view.text){
  const human=document.createElement('span');human.className='job-human';
  human.textContent=(view.voice==='tomato'?'Tomato: ':'Envelop: ')+view.text;statusCopy.append(human);
 }
 if(view.technical){
  const technical=document.createElement('small');technical.className='job-technical';technical.textContent=view.technical;statusCopy.append(technical);
 }
 status.append(statusCopy);card.append(status);
 if (!view.resultFirst) appendReplies();
   if (view.phase==='failed' && job.compute && job.hardwareAttempt && job.virtualSafe && !(job.replies&&job.replies.length)) {
     const note=document.createElement('p');note.className='job-status';
     note.textContent='The durable hardware job is terminal — nothing will replay later.';
     const fb=document.createElement('button');fb.type='button';fb.textContent='Run in Virtual Tomato';
     fb.onclick=()=>{job.hwSeq=(job.hwSeq||0)+1;job.phase='queued';job.outcome=null;job.via=null;job.hardwareAttempt=false;job.virtualSafe=false;updateJobView(job);runVirtual(job);};
     note.append(document.createTextNode(' '));note.append(fb);card.append(note);
   }
 if(!job.program&&!job.hex)return card;
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
  return card;
}
function computeResolution(status) {
  if (status === 'completed') return 'physical';
  if (status === 'cancelled' || status === 'failed') return 'virtual-safe';
  return 'unknown';
}
function setJobPhase(job, phase) {
  job.phase = phase;
  updateJobView(job);
}
function failJobWithPersonality(job, event, details, key) {
  job.outcome = jobViewsModule.personalityOutcome(event, key || job.id, details);
  setJobPhase(job, 'failed');
}
function failJobWithEnvelop(job, text, code, details) {
  job.outcome = jobViewsModule.fixedOutcome({text, code, details});
  setJobPhase(job, 'failed');
}
function tomatoStatus(text) {
  const match = String(text || '').match(/Tomato rejected the job \(status (\d+)\)\.?/i);
  return match ? Number(match[1]) : null;
}
function completeHardwareJob(job, row) {
  const result = row && row.result_text;
  const statusByte = tomatoStatus(result);
  if (statusByte !== null) {
    failJobWithPersonality(job, 'EXECUTION_FAULT', {statusByte}, job.id + ':status:' + statusByte);
    return;
  }
  job.replies = [result || 'Tomato completed the job.'];
  job.target = 'Physical Tomato · durable hardware job';
  setJobPhase(job, 'succeeded');
}
async function runHardware(job) {
  // Only authenticated online sessions enter the durable queue. Virtual may
  // follow only a terminal failed/cancelled row; ambiguous jobs never replay.
  if (!state.tomatoOnline) { runVirtual(job); return; }
  job.hardwareAttempt = true; job.virtualSafe = false;
  job.via = 'hardware'; setJobPhase(job, 'queued');
  job.hwSeq = (job.hwSeq || 0) + 1;
  const seq = job.hwSeq;
  renderThread();
  const started = Date.now();
  const alive = () => job.hwSeq === seq && (job.phase === 'queued' || job.phase === 'executing');
  let jobId = null;
  const resolveCancellation = async () => {
    if (!jobId) return 'unknown';
    try {
      const final = await request(COMPUTE_API.cancel, { body: { p_job: jobId } });
      const resolution = computeResolution(final && final.status);
      if (resolution === 'physical') {
        completeHardwareJob(job, final);
        renderThread();
      }
      return resolution;
    } catch (e) {
      return 'unknown';
    }
  };
  const showInterrupted = async () => {
    const wasExecuting = job.phase === 'executing';
    const resolution = await resolveCancellation();
    if (resolution === 'physical' || !alive()) return;
    job.virtualSafe = resolution === 'virtual-safe';
    if (resolution === 'virtual-safe') {
      if (wasExecuting) failJobWithPersonality(job, 'TIMEOUT', {}, job.id + ':physical-timeout');
      else failJobWithEnvelop(job, 'Physical Tomato became unavailable; the durable job is terminal.', 'HARDWARE_UNAVAILABLE');
    } else {
      setJobPhase(job, 'unknown');
    }
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
        completeHardwareJob(job, cur);
        renderThread(); return;
      }
      if (cur.status === 'failed' || cur.status === 'cancelled') {
        job.virtualSafe = true;
        failJobWithEnvelop(job, cur.result_text || 'The physical Tomato job is terminal.', 'HARDWARE_JOB_TERMINAL');
        renderThread(); return;
      }
      setJobPhase(job, cur.status === 'claimed' || cur.status === 'running' ? 'executing' : 'queued');
      renderThread();
      if (Date.now() - started > 25000) {
        await showInterrupted();
        return;
      }
    }
  } catch (err) {
    if (!alive()) return;
    // A lost enqueue response can hide a durable queued job. With no id it
    // cannot be cancelled safely, so do not offer virtual execution.
    setJobPhase(job, 'unknown');
    renderThread();
  }
}
function runVirtual(job) {
 if(job.phase!=='queued'&&job.phase!=='compiling')return;
 job.via='virtual';setJobPhase(job,'queued');renderThread();
 const worker=new Worker('./virtual/worker.mjs?v='+ASSET_VERSION,{type:'module'});
 const timer=setTimeout(()=>{if(job.phase==='executing')failJobWithPersonality(job,'TIMEOUT',{},job.id+':virtual-timeout');else failJobWithEnvelop(job,'Could not start Virtual Tomato in time.','VIRTUAL_START_TIMEOUT');finish();},30000);
 function finish(){clearTimeout(timer);worker.terminate();renderThread();}
 worker.onerror=()=>{failJobWithEnvelop(job,'Could not start Virtual Tomato. Reload the page and try again.','VIRTUAL_WORKER_ERROR');finish();};
  worker.onmessage=({data})=>{if(data.kind==='compiled'){job.program=data.program;job.hex=data.hex;job.version=data.version;if(data.understood)job.understood=data.understood;renderThread();}
 else if(data.kind==='phase'&&data.phase==='executing'){setJobPhase(job,'executing');renderThread();}
 else if(data.kind==='result'){job.replies=data.replies;job.target=data.target;setJobPhase(job,'succeeded');finish();}
 else if(data.kind==='error'){
   const error=data.error||{};
   const compile=jobViewsModule.compileOutcome(error,job.body);
   if(compile){job.outcome=compile;setJobPhase(job,'failed');}
   else if(error.code==='EXECUTION_FAULT')failJobWithPersonality(job,'EXECUTION_FAULT',error.details,job.id+':'+(error.details&&error.details.statusByte));
   else if(job.phase==='executing')failJobWithPersonality(job,'EXECUTION_FAULT',error.details,job.id+':virtual-fault');
   else failJobWithEnvelop(job,error.message||'Virtual Tomato could not start.','VIRTUAL_EXECUTION_ERROR');
   finish();
 }};
 worker.postMessage({text:job.body,name:job.name});
}
